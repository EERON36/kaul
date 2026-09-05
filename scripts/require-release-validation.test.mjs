import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { requireReleaseValidation } from "./require-release-validation.mjs";

const source = {
  repository: "fictional/kaul",
  repositoryId: 123,
  sha: "a".repeat(40),
  token: "fictional-release-read-token",
};
const jobNames = [
  "validate",
  "firewall-rehearsal",
  "ingress-rehearsal",
  "backup-rehearsal",
];

function fixture() {
  const workflow = {
    id: 456,
    path: ".github/workflows/validate.yml",
    state: "active",
  };
  const run = {
    id: 789,
    run_number: 12,
    run_attempt: 2,
    workflow_id: workflow.id,
    head_sha: source.sha,
    event: "push",
    head_branch: "main",
    repository: { id: source.repositoryId, full_name: source.repository },
    head_repository: { id: source.repositoryId, full_name: source.repository },
    status: "completed",
    conclusion: "success",
  };
  return {
    workflow,
    runs: { total_count: 1, workflow_runs: [run] },
    jobs: {
      total_count: jobNames.length,
      jobs: jobNames.map((name) => ({
        name,
        run_id: run.id,
        head_sha: source.sha,
        status: "completed",
        conclusion: "success",
      })),
    },
    confirmed: structuredClone(run),
  };
}

function apiFor(data) {
  const replies = [data.workflow, data.runs, data.jobs, data.confirmed];
  return vi.fn(async () => {
    const reply = replies.shift();
    if (!reply) throw new Error("Unexpected extra API call.");
    return { ok: true, json: async () => structuredClone(reply) };
  });
}

const rejected = (promise) =>
  expect(promise).rejects.toThrow(
    "Exact release validation could not be confirmed.",
  );

describe("exact release validation", () => {
  it("accepts only the exact trusted successful full attempt", async () => {
    const data = fixture();
    const api = apiFor(data);
    await expect(requireReleaseValidation(source, api)).resolves.toEqual({
      runId: 789,
      attempt: 2,
    });
    expect(api.mock.calls.map(([url]) => url)).toEqual([
      "https://api.github.com/repos/fictional/kaul/actions/workflows/validate.yml",
      `https://api.github.com/repos/fictional/kaul/actions/workflows/456/runs?head_sha=${source.sha}&event=push&branch=main&per_page=100`,
      "https://api.github.com/repos/fictional/kaul/actions/runs/789/attempts/2/jobs?per_page=100",
      "https://api.github.com/repos/fictional/kaul/actions/runs/789",
    ]);
    for (const [, options] of api.mock.calls) {
      expect(options.redirect).toBe("error");
      expect(options.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it.each([
    ["missing", { total_count: 0, workflow_runs: [] }],
    ["malformed", { total_count: 1, workflow_runs: null }],
    ["truncated", { total_count: 101, workflow_runs: [] }],
  ])("rejects %s run evidence", async (_label, runs) => {
    const data = fixture();
    data.runs = runs;
    await rejected(requireReleaseValidation(source, apiFor(data)));
  });

  it.each([
    ["pending", { status: "in_progress", conclusion: null }],
    ["failed", { conclusion: "failure" }],
    ["cancelled", { conclusion: "cancelled" }],
    ["skipped", { conclusion: "skipped" }],
    ["wrong source", { head_sha: "b".repeat(40) }],
    ["PR event", { event: "pull_request" }],
    ["untrusted branch", { head_branch: "feature" }],
    ["wrong workflow", { workflow_id: 999 }],
    ["fork", { head_repository: { id: 999, full_name: "fork/kaul" } }],
    [
      "wrong repository",
      { repository: { id: 999, full_name: source.repository } },
    ],
    ["missing attempt", { run_attempt: null }],
  ])("rejects %s validation", async (_label, change) => {
    const data = fixture();
    Object.assign(data.runs.workflow_runs[0], change);
    const api = apiFor(data);
    await rejected(requireReleaseValidation(source, api));
    expect(api).toHaveBeenCalledTimes(2);
  });

  it("does not fall back from a newer red run to an older green run", async () => {
    const data = fixture();
    data.runs.workflow_runs.push({
      ...data.runs.workflow_runs[0],
      id: 790,
      run_number: 13,
      conclusion: "failure",
    });
    data.runs.total_count = 2;
    await rejected(requireReleaseValidation(source, apiFor(data)));
  });

  it.each([
    ["wrong path", { path: ".github/workflows/other.yml" }],
    ["disabled", { state: "disabled_manually" }],
    ["malformed", { id: null }],
  ])("rejects a %s workflow identity", async (_label, change) => {
    const data = fixture();
    Object.assign(data.workflow, change);
    await rejected(requireReleaseValidation(source, apiFor(data)));
  });

  it.each([
    ["missing job", (jobs) => jobs.jobs.pop()],
    ["failed job", (jobs) => (jobs.jobs[0].conclusion = "failure")],
    ["pending job", (jobs) => (jobs.jobs[0].status = "in_progress")],
    ["skipped job", (jobs) => (jobs.jobs[0].conclusion = "skipped")],
    ["duplicate job", (jobs) => (jobs.jobs[0].name = "backup-rehearsal")],
    ["wrong run", (jobs) => (jobs.jobs[0].run_id = 999)],
    ["wrong source", (jobs) => (jobs.jobs[0].head_sha = "b".repeat(40))],
    ["partial attempt", (jobs) => (jobs.total_count = 1)],
  ])("rejects %s in the required full attempt", async (_label, mutate) => {
    const data = fixture();
    mutate(data.jobs);
    await rejected(requireReleaseValidation(source, apiFor(data)));
  });

  it.each([
    ["new attempt", { run_attempt: 3 }],
    ["rerun pending", { status: "queued", conclusion: null }],
    ["changed result", { conclusion: "failure" }],
    ["wrong source", { head_sha: "b".repeat(40) }],
  ])("rejects %s during final confirmation", async (_label, change) => {
    const data = fixture();
    Object.assign(data.confirmed, change);
    await rejected(requireReleaseValidation(source, apiFor(data)));
  });

  it.each([0, 1, 2, 3])(
    "fails closed on API failure at call %i",
    async (index) => {
      const api = apiFor(fixture());
      for (let call = 0; call < index; call += 1) {
        const replies = [fixture().workflow, fixture().runs, fixture().jobs];
        api.mockResolvedValueOnce({
          ok: true,
          json: async () => replies[call],
        });
      }
      api.mockResolvedValueOnce({ ok: false });
      await rejected(requireReleaseValidation(source, api));
      expect(api).toHaveBeenCalledTimes(index + 1);
    },
  );

  it.each([
    async () => {
      throw new Error("Fictional private transport details.");
    },
    async () => ({
      ok: true,
      json: async () => {
        throw new Error("Fictional invalid response.");
      },
    }),
  ])("redacts transport and parse failures", async (api) => {
    await rejected(requireReleaseValidation(source, api));
  });

  it.each([
    { repository: "../../other" },
    { repositoryId: 0 },
    { sha: "main" },
    { token: "" },
  ])("rejects invalid release context before requests: %j", async (change) => {
    const api = apiFor(fixture());
    await rejected(requireReleaseValidation({ ...source, ...change }, api));
    expect(api).not.toHaveBeenCalled();
  });
});

describe("release workflow gate ordering", () => {
  it("requires exact validation and fresh strict audit before registry use", () => {
    const workflow = readFileSync(
      new URL(
        "../.github/workflows/publish-release-image.yml",
        import.meta.url,
      ),
      "utf8",
    );
    const names = [
      "Require a version tag on main",
      "Set up Node.js for release gates",
      "Require exact trusted full validation",
      "Install locked dependencies for release audit",
      "Recheck mandatory dependency audit before publication",
      "Log in to GHCR",
      "Build and publish image",
    ];
    const positions = names.map((name) => workflow.indexOf(`- name: ${name}`));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    for (const name of names.slice(2, 5)) {
      const step = workflow.split(`- name: ${name}`)[1].split("- name:")[0];
      expect(step).not.toMatch(/continue-on-error|\n\s+if:/);
    }
    expect(workflow).toContain(
      "run: node scripts/require-release-validation.mjs",
    );
    expect(workflow).toContain("run: npm ci");
    expect(workflow).toContain("run: npm run audit:ci");
    expect(workflow).toContain("actions: read");
    expect(workflow).toContain(
      'git merge-base --is-ancestor "$GITHUB_SHA" origin/main',
    );
    const validate = readFileSync(
      new URL("../.github/workflows/validate.yml", import.meta.url),
      "utf8",
    );
    const declaredJobs = [
      ...validate.split("jobs:")[1].matchAll(/^  ([a-z-]+):$/gm),
    ].map((match) => match[1]);
    expect(declaredJobs.sort()).toEqual([...jobNames].sort());
    expect(validate).toContain("run: npm run audit:ci");
  });
});
