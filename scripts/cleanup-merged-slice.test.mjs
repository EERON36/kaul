import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  createCommandRunner,
  preflightMergedSlice,
  pruneRetiredSlice,
} from "./cleanup-merged-slice.mjs";

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function git(cwd, args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${result.stderr || result.stdout}`,
    );
  }
  return result;
}

function gitOutput(cwd, args) {
  return git(cwd, args).stdout.trim();
}

function createFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "kaul-cleanup-test-"));
  temporaryRoots.push(root);
  const origin = path.join(root, "origin.git");
  const main = path.join(root, "main");
  const feature = path.join(root, "feature worktree");
  const unrelated = path.join(root, "unrelated");
  const branch = "feature/safe-cleanup";

  git(root, ["init", "--bare", origin]);
  mkdirSync(main);
  git(main, ["init", "--initial-branch=main"]);
  git(main, ["config", "user.name", "Fictional Kaul Tester"]);
  git(main, ["config", "user.email", "tester@example.invalid"]);
  writeFileSync(path.join(main, "shared.txt"), "base\n");
  git(main, ["add", "shared.txt"]);
  git(main, ["commit", "-m", "Create fictional baseline"]);
  const baseSha = gitOutput(main, ["rev-parse", "HEAD"]);
  git(main, ["remote", "add", "origin", origin]);
  git(main, ["push", "-u", "origin", "main"]);

  git(main, ["worktree", "add", "-b", branch, feature]);
  writeFileSync(path.join(feature, "shared.txt"), "feature\n");
  writeFileSync(path.join(feature, "slice.txt"), "reviewed slice\n");
  git(feature, ["add", "shared.txt", "slice.txt"]);
  git(feature, ["commit", "-m", "Add fictional slice"]);
  const headSha = gitOutput(feature, ["rev-parse", "HEAD"]);
  git(feature, ["push", "-u", "origin", branch]);

  git(main, ["merge", "--squash", branch]);
  git(main, ["commit", "-m", "Merge fictional slice"]);
  const mergeCommitSha = gitOutput(main, ["rev-parse", "HEAD"]);
  git(main, ["push", "origin", "main"]);
  git(main, ["push", "origin", "--delete", branch]);
  git(main, ["update-ref", `refs/remotes/origin/${branch}`, headSha]);

  mkdirSync(unrelated);
  writeFileSync(path.join(unrelated, "keep.txt"), "must remain\n");
  return {
    root,
    main,
    feature,
    unrelated,
    branch,
    baseSha,
    headSha,
    mergeCommitSha,
  };
}

function createGithub(fixture, override = {}) {
  const calls = { pullRequest: 0, remoteBranch: 0 };
  return {
    calls,
    client: {
      getRepository: () => ({ nameWithOwner: "fictional/kaul" }),
      getPullRequest: () => {
        calls.pullRequest += 1;
        return {
          number: 17,
          state: "MERGED",
          baseRepository: "fictional/kaul",
          baseBranch: "main",
          headRepository: "fictional/kaul",
          headBranch: fixture.branch,
          headSha: fixture.headSha,
          mergeCommitSha: fixture.mergeCommitSha,
          ...override,
        };
      },
      getRemoteBranchState: () => {
        calls.remoteBranch += 1;
        return "deleted";
      },
    },
  };
}

function run(fixture, action, options = {}) {
  const events = [];
  const baseRunner = createCommandRunner();
  const runCommand = (request) => {
    events.push({ command: request.command, args: [...request.args] });
    return options.intercept?.(request, baseRunner) ?? baseRunner(request);
  };
  const result = action({
    repoPath: fixture.main,
    prNumber: 17,
    worktreePath: fixture.feature,
    expectedBranch: fixture.branch,
    runCommand,
    github: options.github ?? createGithub(fixture).client,
    log: options.log,
  });
  return { result, events };
}

function expectBlocked(fixture, action, message, options = {}) {
  const { events } = (() => {
    const events = [];
    const baseRunner = createCommandRunner();
    const runCommand = (request) => {
      events.push({ command: request.command, args: [...request.args] });
      return options.intercept?.(request, baseRunner) ?? baseRunner(request);
    };
    expect(() =>
      action({
        repoPath: fixture.main,
        prNumber: 17,
        worktreePath: options.worktreePath ?? fixture.feature,
        expectedBranch: options.expectedBranch ?? fixture.branch,
        runCommand,
        github: options.github ?? createGithub(fixture).client,
      }),
    ).toThrow(message);
    return { events };
  })();

  expect(
    events.some(
      (event) =>
        event.command === "git" && event.args.join(" ") === "worktree prune",
    ),
  ).toBe(false);
  expect(
    events.some(
      (event) =>
        event.command === "git" && event.args.join(" ") === "fetch --prune",
    ),
  ).toBe(false);
}

function retireWithCodex(fixture) {
  rmSync(fixture.feature, { recursive: true, force: true });
  expect(existsSync(fixture.feature)).toBe(false);
  expect(
    gitOutput(fixture.main, ["worktree", "list", "--porcelain"]),
  ).toContain("prunable");
}

describe("cleanup merged slice", () => {
  it("requires manual prune before deleting the intended retired slice branch", () => {
    const fixture = createFixture();
    const github = createGithub(fixture);
    const logs = [];

    run(fixture, preflightMergedSlice, { github: github.client });
    retireWithCodex(fixture);
    const pending = run(fixture, pruneRetiredSlice, {
      github: github.client,
      log: (message) => logs.push(message),
    });

    expect(pending.result.localBranchState).toBe(
      "preserved pending manual prune",
    );
    expect(pending.result.prunableWorktree).toBe(path.resolve(fixture.feature));
    expect(pending.result.nextAction).toBe("git worktree prune -v");
    expect(
      pending.events.some((event) => event.args.join(" ") === "worktree prune"),
    ).toBe(false);
    expect(
      gitOutput(fixture.main, ["worktree", "list", "--porcelain"]),
    ).toContain(fixture.feature.replaceAll("\\", "/"));
    expect(
      git(
        fixture.main,
        ["show-ref", "--verify", `refs/heads/${fixture.branch}`],
        { allowFailure: true },
      ).status,
    ).toBe(0);
    expect(logs.join("\n")).toContain(fixture.feature);

    git(fixture.main, ["worktree", "prune", "-v"]);
    const { result, events } = run(fixture, pruneRetiredSlice, {
      github: github.client,
      log: (message) => logs.push(message),
    });

    expect(existsSync(path.join(fixture.unrelated, "keep.txt"))).toBe(true);
    expect(gitOutput(fixture.main, ["worktree", "list"])).toContain(
      fixture.main.replaceAll("\\", "/"),
    );
    expect(
      git(
        fixture.main,
        ["show-ref", "--verify", `refs/heads/${fixture.branch}`],
        {
          allowFailure: true,
        },
      ).status,
    ).not.toBe(0);
    expect(result.localBranchState).toBe("deleted");
    expect(result.githubHeadBranchState).toBe("deleted");
    expect(result.originTrackingBranchState).toBe("absent");
    expect(github.calls.pullRequest).toBe(4);
    expect(
      events.some((event) => event.args.join(" ") === "worktree prune"),
    ).toBe(false);
    expect(logs.at(-1)).toContain("safe to archive manually");
  }, 15_000);

  it("rejects an unmerged PR before any cleanup", () => {
    const fixture = createFixture();
    const github = createGithub(fixture, { state: "OPEN" });
    expectBlocked(fixture, preflightMergedSlice, "not MERGED", {
      github: github.client,
    });
  });

  it("rejects a merged PR from another repository", () => {
    const fixture = createFixture();
    const github = createGithub(fixture, {
      baseRepository: "fictional/other-repository",
    });
    expectBlocked(fixture, preflightMergedSlice, "does not match", {
      github: github.client,
    });
  });

  it("rejects tracked changes", () => {
    const fixture = createFixture();
    writeFileSync(path.join(fixture.feature, "slice.txt"), "changed later\n");
    expectBlocked(fixture, preflightMergedSlice, "tracked modifications");
  });

  it("rejects untracked files", () => {
    const fixture = createFixture();
    writeFileSync(path.join(fixture.feature, "untracked.txt"), "local work\n");
    expectBlocked(fixture, preflightMergedSlice, "untracked files");
  });

  it("rejects ignored files before any physical retirement", () => {
    const fixture = createFixture();
    writeFileSync(
      path.join(fixture.feature, ".gitignore"),
      "ignored space.txt\nräksmörgås.txt\nnested/ignored note.txt\n",
    );
    git(fixture.feature, ["add", ".gitignore"]);
    git(fixture.feature, ["commit", "-m", "Ignore fictional local file"]);
    const github = createGithub(fixture, {
      headSha: gitOutput(fixture.feature, ["rev-parse", "HEAD"]),
    });
    mkdirSync(path.join(fixture.feature, "nested"));
    for (const relativePath of [
      "ignored space.txt",
      "räksmörgås.txt",
      "nested/ignored note.txt",
    ]) {
      writeFileSync(
        path.join(fixture.feature, relativePath),
        "fictional=true\n",
      );
    }
    expect(() =>
      run(fixture, preflightMergedSlice, { github: github.client }),
    ).toThrow(/ignored space\.txt.*(?:nested\/|nested\\).*räksmörgås\.txt/s);
    expect(existsSync(path.join(fixture.feature, "räksmörgås.txt"))).toBe(true);
  });

  it("limits ignored path diagnostics and reports the omitted count", () => {
    const fixture = createFixture();
    writeFileSync(path.join(fixture.feature, ".gitignore"), "*.tmp\n");
    git(fixture.feature, ["add", ".gitignore"]);
    git(fixture.feature, ["commit", "-m", "Ignore fictional local files"]);
    const github = createGithub(fixture, {
      headSha: gitOutput(fixture.feature, ["rev-parse", "HEAD"]),
    });
    for (let index = 1; index <= 12; index += 1) {
      writeFileSync(
        path.join(
          fixture.feature,
          `ignored-${String(index).padStart(2, "0")}.tmp`,
        ),
        "fictional=true\n",
      );
    }
    expect(() =>
      run(fixture, preflightMergedSlice, { github: github.client }),
    ).toThrow("2 more omitted");
  });

  it("rejects unresolved conflicts", () => {
    const fixture = createFixture();
    const other = path.join(fixture.root, "conflict source");
    git(fixture.main, [
      "worktree",
      "add",
      "-b",
      "test/conflict",
      other,
      fixture.baseSha,
    ]);
    writeFileSync(path.join(other, "shared.txt"), "other\n");
    git(other, ["add", "shared.txt"]);
    git(other, ["commit", "-m", "Create fictional conflict"]);
    expect(
      git(fixture.feature, ["merge", "test/conflict"], { allowFailure: true })
        .status,
    ).not.toBe(0);
    expectBlocked(fixture, preflightMergedSlice, "unresolved conflicts");
  });

  it("rejects main as the requested target", () => {
    const fixture = createFixture();
    expectBlocked(fixture, preflightMergedSlice, "main Kaul worktree", {
      worktreePath: fixture.main,
    });
  });

  it("rejects another repository and arbitrary filesystem paths", () => {
    const fixture = createFixture();
    const otherRepository = path.join(fixture.root, "other repository");
    mkdirSync(otherRepository);
    git(otherRepository, ["init", "--initial-branch=main"]);
    expectBlocked(
      fixture,
      preflightMergedSlice,
      "not a worktree registration",
      {
        worktreePath: otherRepository,
      },
    );
    expectBlocked(
      fixture,
      preflightMergedSlice,
      "not a worktree registration",
      {
        worktreePath: fixture.unrelated,
      },
    );
    expect(readFileSync(path.join(fixture.unrelated, "keep.txt"), "utf8")).toBe(
      "must remain\n",
    );
  });

  it("rejects a branch and worktree mismatch", () => {
    const fixture = createFixture();
    const expectedBranch = "feature/other-slice";
    const github = createGithub(fixture, { headBranch: expectedBranch });
    expectBlocked(fixture, preflightMergedSlice, "does not match", {
      expectedBranch,
      github: github.client,
    });
  });

  it("rejects an active duplicate branch worktree", () => {
    const fixture = createFixture();
    const duplicate = path.join(fixture.root, "duplicate worktree");
    expectBlocked(fixture, preflightMergedSlice, "active in another worktree", {
      intercept(request, baseRunner) {
        if (
          request.command === "git" &&
          request.args.join(" ") === "worktree list --porcelain -z"
        ) {
          const result = baseRunner(request);
          return {
            ...result,
            stdout:
              result.stdout +
              `worktree ${duplicate}\0HEAD ${fixture.headSha}\0branch refs/heads/${fixture.branch}\0`,
          };
        }
      },
    });
  });

  it("rejects an ambiguous retained stash and preserves it", () => {
    const fixture = createFixture();
    writeFileSync(path.join(fixture.feature, "slice.txt"), "safety copy\n");
    git(fixture.feature, ["stash", "push", "-m", "retain slice safety"]);
    expectBlocked(
      fixture,
      preflightMergedSlice,
      "retained stash requires human review",
    );
    expect(gitOutput(fixture.main, ["stash", "list"])).toContain(
      "retain slice safety",
    );
  });

  it("reports every prunable registration and refuses ambiguous manual prune", () => {
    const fixture = createFixture();
    run(fixture, preflightMergedSlice);
    const other = path.join(fixture.root, "another retired worktree");
    git(fixture.main, [
      "worktree",
      "add",
      "-b",
      "test/other",
      other,
      fixture.baseSha,
    ]);
    retireWithCodex(fixture);
    rmSync(other, { recursive: true, force: true });
    let blocker;
    try {
      run(fixture, pruneRetiredSlice);
    } catch (error) {
      blocker = error;
    }
    expect(blocker?.message).toContain(fixture.feature.replaceAll("\\", "/"));
    expect(blocker?.message).toContain(other.replaceAll("\\", "/"));
    expect(
      gitOutput(fixture.main, ["worktree", "list", "--porcelain"]),
    ).toContain("prunable");
  });

  it("never prunes a registration that becomes stale after impact reporting", () => {
    const fixture = createFixture();
    const other = path.join(fixture.root, "later retired worktree");
    git(fixture.main, [
      "worktree",
      "add",
      "-b",
      "test/later-retired",
      other,
      fixture.baseSha,
    ]);
    retireWithCodex(fixture);

    const { events } = run(fixture, pruneRetiredSlice);
    rmSync(other, { recursive: true, force: true });

    expect(
      events.some((event) => event.args.join(" ") === "worktree prune"),
    ).toBe(false);
    const registrations = gitOutput(fixture.main, [
      "worktree",
      "list",
      "--porcelain",
    ]);
    expect(registrations).toContain(fixture.feature.replaceAll("\\", "/"));
    expect(registrations).toContain(other.replaceAll("\\", "/"));
  });

  it("refuses branch deletion when another worktree starts using it", () => {
    const fixture = createFixture();
    const branchUser = path.join(fixture.root, "late branch user");
    run(fixture, preflightMergedSlice);
    retireWithCodex(fixture);
    git(fixture.main, ["worktree", "prune", "-v"]);
    let worktreeLists = 0;

    expectBlocked(fixture, pruneRetiredSlice, "active in another worktree", {
      intercept(request, baseRunner) {
        if (
          request.command === "git" &&
          request.args.join(" ") === "worktree list --porcelain -z"
        ) {
          worktreeLists += 1;
          if (worktreeLists === 2) {
            git(fixture.main, ["worktree", "add", branchUser, fixture.branch]);
          }
        }
        return baseRunner(request);
      },
    });
    expect(existsSync(branchUser)).toBe(true);
    expect(
      git(
        fixture.main,
        ["show-ref", "--verify", `refs/heads/${fixture.branch}`],
        { allowFailure: true },
      ).status,
    ).toBe(0);
  }, 15_000);

  it("documents a detached-HEAD branch gate before staging", () => {
    const skill = readFileSync(
      path.resolve(".agents/skills/reviewed-slice-handoff/SKILL.md"),
      "utf8",
    );
    expect(skill.indexOf("git switch -c <branch>")).toBeGreaterThan(
      skill.indexOf("git branch --show-current"),
    );
    expect(skill.indexOf("review:snapshot -- verify")).toBeGreaterThan(
      skill.indexOf("git switch -c <branch>"),
    );
    expect(skill).toContain("untracked non-ignored path set");
    expect(skill).toContain("content hash for every untracked regular");
  });
});
