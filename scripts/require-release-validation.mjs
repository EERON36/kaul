import { pathToFileURL } from "node:url";

const WORKFLOW_PATH = ".github/workflows/validate.yml";
const REQUIRED_JOBS = [
  "validate",
  "firewall-rehearsal",
  "ingress-rehearsal",
  "backup-rehearsal",
];
const FAILURE = "Exact release validation could not be confirmed.";

function requireCondition(value) {
  if (!value) throw new Error(FAILURE);
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

export async function requireReleaseValidation(
  { repository, repositoryId, sha, token },
  fetchImpl = fetch,
) {
  try {
    requireCondition(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository));
    requireCondition(positiveInteger(repositoryId));
    requireCondition(/^[0-9a-f]{40}$/.test(sha));
    requireCondition(typeof token === "string" && token.length > 0);
    const base = `https://api.github.com/repos/${repository}`;
    const read = async (path) => {
      const response = await fetchImpl(`${base}${path}`, {
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token}`,
          "x-github-api-version": "2022-11-28",
        },
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
      });
      requireCondition(response.ok);
      return response.json();
    };
    const workflow = await read("/actions/workflows/validate.yml");
    requireCondition(
      positiveInteger(workflow.id) &&
        workflow.path === WORKFLOW_PATH &&
        workflow.state === "active",
    );
    const trustedRun = (run) =>
      run &&
      positiveInteger(run.id) &&
      positiveInteger(run.run_number) &&
      positiveInteger(run.run_attempt) &&
      run.workflow_id === workflow.id &&
      run.head_sha === sha &&
      run.event === "push" &&
      run.head_branch === "main" &&
      run.repository?.id === repositoryId &&
      run.repository.full_name === repository &&
      run.head_repository?.id === repositoryId &&
      run.head_repository.full_name === repository;
    const listed = await read(
      `/actions/workflows/${workflow.id}/runs?head_sha=${sha}&event=push&branch=main&per_page=100`,
    );
    requireCondition(
      positiveInteger(listed.total_count) &&
        listed.total_count <= 100 &&
        Array.isArray(listed.workflow_runs) &&
        listed.workflow_runs.length === listed.total_count &&
        listed.workflow_runs.every(trustedRun),
    );
    // Do not fall back to an older green run when a newer run is red or pending.
    const latest = listed.workflow_runs.reduce((selected, run) =>
      run.run_number > selected.run_number ? run : selected,
    );
    requireCondition(
      latest.status === "completed" && latest.conclusion === "success",
    );
    const jobs = await read(
      `/actions/runs/${latest.id}/attempts/${latest.run_attempt}/jobs?per_page=100`,
    );
    requireCondition(
      jobs.total_count === REQUIRED_JOBS.length &&
        Array.isArray(jobs.jobs) &&
        jobs.jobs.length === REQUIRED_JOBS.length &&
        REQUIRED_JOBS.every(
          (name) => jobs.jobs.filter((job) => job.name === name).length === 1,
        ) &&
        jobs.jobs.every(
          (job) =>
            job.run_id === latest.id &&
            job.head_sha === sha &&
            job.status === "completed" &&
            job.conclusion === "success",
        ),
    );
    // A rerun started while inspecting jobs invalidates that attempt's evidence.
    const confirmed = await read(`/actions/runs/${latest.id}`);
    requireCondition(
      trustedRun(confirmed) &&
        confirmed.id === latest.id &&
        confirmed.run_attempt === latest.run_attempt &&
        confirmed.status === "completed" &&
        confirmed.conclusion === "success",
    );
    return { runId: latest.id, attempt: latest.run_attempt };
  } catch {
    // API response bodies, tokens and transport details are never emitted.
    throw new Error(FAILURE);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const result = await requireReleaseValidation({
      repository: process.env.GITHUB_REPOSITORY,
      repositoryId: Number(process.env.GITHUB_REPOSITORY_ID),
      sha: process.env.GITHUB_SHA,
      token: process.env.GITHUB_TOKEN,
    });
    console.log(
      `Release validation confirmed: run=${result.runId} attempt=${result.attempt}`,
    );
  } catch {
    console.error(FAILURE);
    process.exitCode = 1;
  }
}
