import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  assertReviewSnapshotMatches,
  captureReviewSnapshot,
  compareReviewSnapshot,
  isInside,
} from "./reviewed-slice-snapshot.mjs";

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function git(cwd, args, encoding = "utf8") {
  const result = spawnSync("git", args, {
    cwd,
    encoding,
    shell: false,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${String(result.stderr ?? result.stdout)}`,
    );
  }
  return result.stdout;
}

function createDetachedFixture() {
  const repository = mkdtempSync(path.join(os.tmpdir(), "kaul-review-test-"));
  temporaryRoots.push(repository);
  git(repository, ["init", "--initial-branch=main"]);
  git(repository, ["config", "user.name", "Fictional Kaul Reviewer"]);
  git(repository, ["config", "user.email", "reviewer@example.invalid"]);
  writeFileSync(path.join(repository, ".gitignore"), "ignored.local\n");
  writeFileSync(path.join(repository, "tracked.txt"), "baseline\n");
  git(repository, ["add", ".gitignore", "tracked.txt"]);
  git(repository, ["commit", "-m", "Create fictional baseline"]);
  git(repository, ["switch", "--detach"]);
  writeFileSync(
    path.join(repository, "tracked.txt"),
    "reviewed tracked change\n",
  );
  mkdirSync(path.join(repository, "nested folder"));
  writeFileSync(path.join(repository, "review note.txt"), "reviewed one\n");
  writeFileSync(
    path.join(repository, "nested folder", "räksmörgås.txt"),
    "reviewed two\n",
  );
  writeFileSync(path.join(repository, "ignored.local"), "not reviewed\n");
  return repository;
}

describe("reviewed slice snapshot", () => {
  describe("snapshot destination containment", () => {
    it.each([
      ["/projects/kaul", "/projects/kaul", true],
      ["/projects/kaul", "/projects/kaul/review.json", true],
      ["/projects/kaul", "/projects/kaul/../review.json", false],
      ["/projects/kaul", "/projects/kaul-other/review.json", false],
      ["/projects/kaul", "/projects", false],
    ])("classifies POSIX destination %s -> %s", (root, destination, inside) => {
      expect(isInside(root, destination, path.posix)).toBe(inside);
    });
    it.each([
      ["C:\\Projects\\kaul", "C:\\Projects\\kaul", true],
      ["C:\\Projects\\kaul", "c:\\projects\\kaul\\review.json", true],
      ["C:\\Projects\\kaul", "C:\\Projects\\review.json", false],
      ["C:\\Projects\\kaul", "C:\\Projects\\kaul-other\\review.json", false],
      ["C:\\Projects\\kaul", "D:\\review.json", false],
      ["C:\\Projects\\kaul", "\\\\review-host\\snapshots\\review.json", false],
      ["\\\\host\\share\\kaul", "\\\\host\\other-share\\review.json", false],
    ])(
      "classifies Windows destination %s -> %s",
      (root, destination, inside) => {
        expect(isInside(root, destination, path.win32)).toBe(inside);
      },
    );
  });
  it(
    "invalidates detached-HEAD review when only untracked content changes",
    () => {
      const repository = createDetachedFixture();
      expect(String(git(repository, ["branch", "--show-current"])).trim()).toBe(
        "",
      );
      const snapshot = captureReviewSnapshot(repository);
      const statusBefore = git(
        repository,
        ["status", "--porcelain=v2", "--untracked-files=all", "-z"],
        null,
      );

      expect(snapshot.untracked.map((entry) => entry.path)).toEqual([
        "nested folder/räksmörgås.txt",
        "review note.txt",
      ]);
      expect(
        snapshot.untracked.some((entry) => entry.path === "ignored.local"),
      ).toBe(false);
      assertReviewSnapshotMatches(snapshot, repository);

      writeFileSync(
        path.join(repository, "review note.txt"),
        "changed after review\n",
      );
      const statusAfter = git(
        repository,
        ["status", "--porcelain=v2", "--untracked-files=all", "-z"],
        null,
      );
      expect(statusAfter).toEqual(statusBefore);
      expect(compareReviewSnapshot(snapshot, repository)).toMatchObject({
        matches: false,
        differences: ["untracked content (review note.txt)"],
      });
      expect(() => assertReviewSnapshotMatches(snapshot, repository)).toThrow(
        "untracked content (review note.txt)",
      );

      writeFileSync(path.join(repository, "review note.txt"), "reviewed one\n");
      expect(compareReviewSnapshot(snapshot, repository).matches).toBe(true);
      // This real-Git case performs repeated fixture/capture subprocesses. Measured
      // Windows runs take 5.7-9.4 seconds; pure path cases keep Vitest's default.
    },
    process.platform === "win32" ? 15_000 : 5_000,
  );
});
