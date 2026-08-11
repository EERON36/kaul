import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export class CleanupBlockedError extends Error {
  constructor(message) {
    super(message);
    this.name = "CleanupBlockedError";
  }
}

function block(message) {
  throw new CleanupBlockedError(message);
}

function pathKey(value) {
  const normalized = path.normalize(path.resolve(value));
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function existingPath(value, label) {
  try {
    return realpathSync.native(path.resolve(value));
  } catch (error) {
    block(`${label} does not resolve to an existing path: ${error.message}`);
  }
}

export function createCommandRunner() {
  return ({ command, args, cwd, allowFailure = false }) => {
    const result = spawnSync(command, args, {
      cwd,
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    });
    if (result.error)
      block(`Could not run ${command}: ${result.error.message}`);

    const execution = {
      status: result.status ?? 1,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
    if (!allowFailure && execution.status !== 0) {
      const detail = execution.stderr.trim() || execution.stdout.trim();
      block(
        `${command} ${args.join(" ")} failed with exit code ${execution.status}` +
          (detail ? `: ${detail}` : "."),
      );
    }
    return execution;
  };
}

function git(runCommand, cwd, args, options = {}) {
  return runCommand({ command: "git", args, cwd, ...options });
}

function gitOutput(runCommand, cwd, args) {
  return git(runCommand, cwd, args).stdout.trim();
}

function parseWorktrees(output) {
  const entries = [];
  let current;
  for (const token of output.split("\0")) {
    if (token.startsWith("worktree ")) {
      if (current) entries.push(current);
      current = { path: token.slice("worktree ".length) };
    } else if (current && token.startsWith("HEAD ")) {
      current.head = token.slice("HEAD ".length);
    } else if (current && token.startsWith("branch ")) {
      current.branch = token.slice("branch ".length);
    } else if (current && token.startsWith("prunable ")) {
      current.prunable = true;
    }
  }
  if (current) entries.push(current);
  return entries;
}

function worktrees(runCommand, repoPath) {
  return parseWorktrees(
    git(runCommand, repoPath, ["worktree", "list", "--porcelain", "-z"]).stdout,
  );
}

const MAX_REPORTED_PATHS = 10;

function pathsFromNullDelimited(output) {
  return output.split("\0").filter(Boolean);
}

function formatPathList(paths) {
  const shown = paths.slice(0, MAX_REPORTED_PATHS).join(", ");
  const omitted = paths.length - MAX_REPORTED_PATHS;
  return omitted > 0 ? `${shown} (${omitted} more omitted)` : shown;
}

function assertClean(runCommand, worktreePath, label, includeIgnored) {
  const conflicts = gitOutput(runCommand, worktreePath, ["ls-files", "-u"]);
  if (conflicts) block(`${label} has unresolved conflicts.`);

  const status = gitOutput(runCommand, worktreePath, [
    "status",
    "--porcelain=v2",
    "--untracked-files=all",
  ]);
  if (status) {
    const untracked = status
      .split(/\r?\n/)
      .some((line) => line.startsWith("? "));
    block(
      untracked
        ? `${label} contains untracked files.`
        : `${label} contains tracked modifications.`,
    );
  }

  if (includeIgnored) {
    const ignored = git(runCommand, worktreePath, [
      "ls-files",
      "--others",
      "--ignored",
      "--exclude-standard",
      "--directory",
      "-z",
    ]).stdout;
    if (ignored) {
      const ignoredPaths = pathsFromNullDelimited(ignored);
      block(
        `${label} contains ignored files or directories that require human review before retirement: ${formatPathList(ignoredPaths)}.`,
      );
    }
  }
}

function assertNoAmbiguousStash(runCommand, repoPath, expectedBranch) {
  const stashes = gitOutput(runCommand, repoPath, [
    "stash",
    "list",
    "--format=%gd%x09%gs",
  ]);
  if (!stashes) return;

  const ambiguous = stashes.split(/\r?\n/).filter((line) => {
    const subject = line.slice(line.indexOf("\t") + 1);
    const recordedBranch = /^(?:WIP on|On) ([^:]+):/.exec(subject)?.[1];
    return (
      !recordedBranch ||
      recordedBranch === "(no branch)" ||
      recordedBranch === expectedBranch
    );
  });
  if (ambiguous.length > 0) {
    block(
      `A relevant or ambiguous retained stash requires human review: ${ambiguous.join(", ")}.`,
    );
  }
}

function parseJson(output, label) {
  try {
    return JSON.parse(output);
  } catch (error) {
    block(`${label} returned invalid JSON: ${error.message}`);
  }
}

export function createGitHubClient(runCommand, cwd) {
  return {
    getRepository() {
      return parseJson(
        runCommand({
          command: "gh",
          args: ["repo", "view", "--json", "nameWithOwner"],
          cwd,
        }).stdout,
        "gh repository query",
      );
    },
    getPullRequest(repository, number) {
      const pullRequest = parseJson(
        runCommand({
          command: "gh",
          args: ["api", `repos/${repository}/pulls/${number}`],
          cwd,
        }).stdout,
        "gh pull request query",
      );
      return {
        number: pullRequest.number,
        state:
          pullRequest.merged === true && pullRequest.merged_at
            ? "MERGED"
            : pullRequest.state,
        baseRepository: pullRequest.base?.repo?.full_name,
        baseBranch: pullRequest.base?.ref,
        headRepository: pullRequest.head?.repo?.full_name,
        headBranch: pullRequest.head?.ref,
        headSha: pullRequest.head?.sha,
        mergeCommitSha: pullRequest.merge_commit_sha,
      };
    },
    getRemoteBranchState(repository, branch) {
      const result = runCommand({
        command: "gh",
        args: [
          "api",
          `repos/${repository}/branches/${encodeURIComponent(branch)}`,
        ],
        cwd,
        allowFailure: true,
      });
      if (result.status === 0) return "present";
      return /(?:HTTP 404|Not Found)/i.test(
        `${result.stdout}\n${result.stderr}`,
      )
        ? "deleted"
        : "unknown";
    },
  };
}

function assertInputs(runCommand, repoPath, prNumber, expectedBranch) {
  if (!Number.isSafeInteger(prNumber) || prNumber <= 0) {
    block("PR number must be a positive integer.");
  }
  if (!expectedBranch || expectedBranch === "main") {
    block("Expected feature branch must be explicit and cannot be main.");
  }
  if (
    git(
      runCommand,
      repoPath,
      ["check-ref-format", "--branch", expectedBranch],
      {
        allowFailure: true,
      },
    ).status !== 0
  ) {
    block(`${expectedBranch} is not a valid explicit local branch name.`);
  }
}

function synchronizeMain(runCommand, repoPath) {
  assertClean(runCommand, repoPath, "Main worktree", false);
  git(runCommand, repoPath, ["fetch", "origin", "main"]);
  const local = gitOutput(runCommand, repoPath, [
    "rev-parse",
    "refs/heads/main",
  ]);
  const remote = gitOutput(runCommand, repoPath, [
    "rev-parse",
    "refs/remotes/origin/main",
  ]);
  if (
    git(runCommand, repoPath, ["merge-base", "--is-ancestor", local, remote], {
      allowFailure: true,
    }).status !== 0
  ) {
    block(
      "Local main has diverged from origin/main and cannot be fast-forwarded safely.",
    );
  }
  if (local !== remote)
    git(runCommand, repoPath, ["merge", "--ff-only", "origin/main"]);
  assertClean(runCommand, repoPath, "Main worktree", false);
  const synchronized = gitOutput(runCommand, repoPath, [
    "rev-parse",
    "refs/heads/main",
  ]);
  if (synchronized !== remote) {
    block("Local main did not synchronize exactly with origin/main.");
  }
  return synchronized;
}

function prove({
  runCommand,
  github,
  repoPath,
  prNumber,
  worktreePath,
  expectedBranch,
  mode,
}) {
  const repository = github.getRepository()?.nameWithOwner;
  if (typeof repository !== "string" || !repository.includes("/")) {
    block("gh could not identify the current GitHub repository.");
  }
  const pullRequest = github.getPullRequest(repository, prNumber);
  if (pullRequest.number !== prNumber || pullRequest.state !== "MERGED") {
    block(`PR #${prNumber} is not MERGED.`);
  }
  if (
    pullRequest.baseRepository !== repository ||
    pullRequest.baseBranch !== "main" ||
    pullRequest.headBranch !== expectedBranch ||
    !pullRequest.headRepository ||
    !pullRequest.headSha ||
    !pullRequest.mergeCommitSha
  ) {
    block(
      "The merged PR does not match the explicit Kaul repository, main, and branch inputs.",
    );
  }

  const entries = worktrees(runCommand, repoPath);
  const main = entries.find((entry) => entry.branch === "refs/heads/main");
  if (
    !main ||
    pathKey(existingPath(main.path, "Main worktree")) !== pathKey(repoPath)
  ) {
    block("Run this command from the root of the Kaul main worktree.");
  }

  const target = entries.find(
    (entry) => pathKey(entry.path) === pathKey(worktreePath),
  );
  if (!target && mode === "preflight") {
    block(
      "The exact target path is not a worktree registration in this Kaul repository.",
    );
  }
  if (target && pathKey(target.path) === pathKey(main.path)) {
    block("The main Kaul worktree cannot be cleaned.");
  }
  if (target && target.branch !== `refs/heads/${expectedBranch}`) {
    block(
      "The target worktree branch does not match the explicit expected branch.",
    );
  }
  if (
    entries
      .filter((entry) => entry.branch === `refs/heads/${expectedBranch}`)
      .some((entry) => !target || pathKey(entry.path) !== pathKey(target.path))
  ) {
    block(`Local branch ${expectedBranch} is active in another worktree.`);
  }

  const localHead = gitOutput(runCommand, repoPath, [
    "rev-parse",
    `refs/heads/${expectedBranch}`,
  ]);
  if (
    (target && target.head !== localHead) ||
    localHead !== pullRequest.headSha
  ) {
    block(
      "The target worktree, local branch, and merged PR head do not match.",
    );
  }
  assertNoAmbiguousStash(runCommand, repoPath, expectedBranch);

  if (mode === "preflight") {
    if (target.prunable || !existsSync(worktreePath)) {
      block(
        "Target worktree is already retired; run the prune command instead.",
      );
    }
    assertClean(runCommand, worktreePath, "Target worktree", true);
  } else if (target) {
    if (!target.prunable || existsSync(worktreePath)) {
      block(
        "Target worktree is not an exact prunable registration; this helper never deletes filesystem paths.",
      );
    }
    const prunable = entries.filter((entry) => entry.prunable);
    if (
      prunable.length !== 1 ||
      pathKey(prunable[0].path) !== pathKey(target.path)
    ) {
      block(
        `Git worktree prune would affect multiple registrations; review all prunable paths: ${prunable.map((entry) => entry.path).join(", ")}.`,
      );
    }
  }

  const mainHead = synchronizeMain(runCommand, repoPath);
  if (
    git(
      runCommand,
      repoPath,
      ["merge-base", "--is-ancestor", pullRequest.mergeCommitSha, mainHead],
      { allowFailure: true },
    ).status !== 0
  ) {
    block("The merged PR result is not present on current main.");
  }
  return {
    repository,
    pullRequest,
    target,
    localHead,
    phase: mode === "preflight" || target ? "manual-prune" : "branch-cleanup",
  };
}

function context(options) {
  if (typeof options.worktreePath !== "string" || !options.worktreePath) {
    block("Exact worktree path is required.");
  }
  const repoPath = existingPath(options.repoPath, "Repository path");
  const root = existingPath(
    gitOutput(options.runCommand, repoPath, ["rev-parse", "--show-toplevel"]),
    "Repository root",
  );
  if (pathKey(root) !== pathKey(repoPath)) {
    block("Run this command from the root of the Kaul main worktree.");
  }
  assertInputs(
    options.runCommand,
    repoPath,
    options.prNumber,
    options.expectedBranch,
  );
  return {
    ...options,
    repoPath,
    worktreePath: path.resolve(options.worktreePath),
    github: options.github ?? createGitHubClient(options.runCommand, repoPath),
  };
}

export function preflightMergedSlice(options) {
  const checked = context({
    ...options,
    runCommand: options.runCommand ?? createCommandRunner(),
  });
  const proof = prove({ ...checked, mode: "preflight" });
  const summary = {
    repository: proof.repository,
    prNumber: checked.prNumber,
    worktreePath: checked.worktreePath,
  };
  checked.log?.(
    "Preflight passed. Archive the Codex task manually before it retires the physical worktree.",
  );
  return summary;
}

export function pruneRetiredSlice(options) {
  const checked = context({
    ...options,
    runCommand: options.runCommand ?? createCommandRunner(),
  });
  const initialProof = prove({ ...checked, mode: "prune" });
  if (initialProof.phase === "manual-prune") {
    const summary = {
      repository: initialProof.repository,
      prNumber: checked.prNumber,
      prunableWorktree: checked.worktreePath,
      localBranchState: "preserved pending manual prune",
      nextAction: "git worktree prune -v",
    };
    checked.log?.(
      `Manual git worktree prune would currently affect only: ${checked.worktreePath}`,
    );
    checked.log?.(
      "Run git worktree prune -v explicitly, then rerun this helper. The helper never runs repository-wide prune automatically.",
    );
    return summary;
  }

  checked.log?.(
    "The intended registration is absent. Revalidating repository, merged PR, branch SHA, and current worktree ownership immediately before local branch deletion.",
  );
  const proof = prove({ ...checked, mode: "prune" });
  if (proof.phase !== "branch-cleanup") {
    block(
      "The intended worktree registration reappeared; local branch cleanup stopped.",
    );
  }

  const branch = git(
    checked.runCommand,
    checked.repoPath,
    ["show-ref", "--verify", `refs/heads/${checked.expectedBranch}`],
    { allowFailure: true },
  );
  let localBranchState = "already absent";
  if (branch.status === 0) {
    const currentHead = branch.stdout.trim().split(/\s+/)[0];
    if (currentHead !== proof.localHead) {
      block(
        `Local branch ${checked.expectedBranch} changed after final revalidation; it was not deleted.`,
      );
    }
    git(checked.runCommand, checked.repoPath, [
      "update-ref",
      "-d",
      `refs/heads/${checked.expectedBranch}`,
      proof.localHead,
    ]);
    localBranchState = "deleted";
  }

  git(checked.runCommand, checked.repoPath, ["fetch", "--prune"]);
  const originBranch = git(
    checked.runCommand,
    checked.repoPath,
    ["show-ref", "--verify", `refs/remotes/origin/${checked.expectedBranch}`],
    { allowFailure: true },
  );
  const summary = {
    repository: proof.repository,
    prNumber: checked.prNumber,
    prunedWorktree: checked.worktreePath,
    localBranchState,
    githubHeadBranchState: checked.github.getRemoteBranchState(
      proof.pullRequest.headRepository,
      checked.expectedBranch,
    ),
    originTrackingBranchState: originBranch.status === 0 ? "present" : "absent",
    finalWorktrees: gitOutput(checked.runCommand, checked.repoPath, [
      "worktree",
      "list",
    ]),
  };
  checked.log?.(
    `Confirmed absent worktree registration: ${summary.prunedWorktree}`,
  );
  checked.log?.(
    `Local branch ${checked.expectedBranch}: ${summary.localBranchState}`,
  );
  checked.log?.(`GitHub head branch: ${summary.githubHeadBranchState}`);
  checked.log?.(`Final worktrees:\n${summary.finalWorktrees}`);
  checked.log?.(
    "The finished Codex task is safe to archive manually if it is not already archived.",
  );
  return summary;
}

function parseArguments(args) {
  const [mode, ...flags] = args;
  const values = {};
  for (let index = 0; index < flags.length; index += 2) {
    const flag = flags[index];
    const value = flags[index + 1];
    if (
      !["--pr", "--worktree", "--branch"].includes(flag) ||
      !value ||
      values[flag]
    ) {
      block(
        "Usage: cleanup-merged-slice <preflight|prune> --pr <number> --worktree <path> --branch <name>",
      );
    }
    values[flag] = value;
  }
  if (
    !["preflight", "prune"].includes(mode) ||
    !/^[1-9]\d*$/.test(values["--pr"] ?? "") ||
    !values["--worktree"] ||
    !values["--branch"]
  ) {
    block(
      "Usage: cleanup-merged-slice <preflight|prune> --pr <number> --worktree <path> --branch <name>",
    );
  }
  return {
    mode,
    prNumber: Number(values["--pr"]),
    worktreePath: values["--worktree"],
    expectedBranch: values["--branch"],
  };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const { mode, ...options } = parseArguments(process.argv.slice(2));
    const run = mode === "preflight" ? preflightMergedSlice : pruneRetiredSlice;
    run({
      repoPath: process.cwd(),
      ...options,
      log: (message) => console.log(message),
    });
  } catch (error) {
    console.error(
      error instanceof CleanupBlockedError
        ? `Cleanup blocked: ${error.message}`
        : "Cleanup failed unexpectedly. No bypass was attempted.",
    );
    process.exitCode = 1;
  }
}
