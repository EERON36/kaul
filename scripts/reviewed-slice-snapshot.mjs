import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export class ReviewSnapshotError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReviewSnapshotError";
  }
}

function fail(message) {
  throw new ReviewSnapshotError(message);
}

function git(repoPath, args, encoding = "utf8") {
  const result = spawnSync("git", args, {
    cwd: repoPath,
    encoding,
    shell: false,
    windowsHide: true,
  });
  if (result.error) fail(`Could not run git: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = String(result.stderr ?? result.stdout ?? "").trim();
    fail(`git ${args.join(" ")} failed${detail ? `: ${detail}` : "."}`);
  }
  return result.stdout;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function splitNullDelimited(buffer) {
  const values = [];
  let start = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] !== 0) continue;
    if (index > start)
      values.push(buffer.subarray(start, index).toString("utf8"));
    start = index + 1;
  }
  if (start < buffer.length)
    values.push(buffer.subarray(start).toString("utf8"));
  return values;
}

function bytewisePathOrder(left, right) {
  return Buffer.compare(
    Buffer.from(left.path, "utf8"),
    Buffer.from(right.path, "utf8"),
  );
}

function fileIdentity(repositoryRoot, relativePath) {
  const absolutePath = path.resolve(repositoryRoot, relativePath);
  const entry = lstatSync(absolutePath);
  if (entry.isFile()) {
    return {
      path: relativePath,
      type: "file",
      sha256: sha256(readFileSync(absolutePath)),
    };
  }
  if (entry.isSymbolicLink()) {
    return {
      path: relativePath,
      type: "symbolic-link",
      sha256: sha256(Buffer.from(readlinkSync(absolutePath), "utf8")),
    };
  }
  fail(
    `Untracked path is not a regular file or symbolic link: ${relativePath}`,
  );
}

export function captureReviewSnapshot(repoPath = process.cwd()) {
  const repositoryRoot = realpathSync.native(
    String(git(repoPath, ["rev-parse", "--show-toplevel"])).trim(),
  );
  const head = String(git(repositoryRoot, ["rev-parse", "HEAD"])).trim();
  const trackedDiff = git(
    repositoryRoot,
    ["diff", "--binary", "--full-index", "--no-ext-diff", "HEAD", "--"],
    null,
  );
  const untrackedPaths = splitNullDelimited(
    git(
      repositoryRoot,
      ["ls-files", "--others", "--exclude-standard", "-z"],
      null,
    ),
  );
  const untracked = untrackedPaths
    .map((relativePath) => fileIdentity(repositoryRoot, relativePath))
    .sort(bytewisePathOrder);

  return {
    version: 1,
    repositoryRoot,
    head,
    trackedDiffSha256: sha256(trackedDiff),
    untracked,
  };
}

function validateSnapshot(snapshot) {
  if (
    snapshot?.version !== 1 ||
    typeof snapshot.repositoryRoot !== "string" ||
    typeof snapshot.head !== "string" ||
    !/^[a-f0-9]{64}$/.test(snapshot.trackedDiffSha256 ?? "") ||
    !Array.isArray(snapshot.untracked) ||
    snapshot.untracked.some(
      (entry) =>
        typeof entry?.path !== "string" ||
        !["file", "symbolic-link"].includes(entry.type) ||
        !/^[a-f0-9]{64}$/.test(entry.sha256 ?? ""),
    )
  ) {
    fail("Review snapshot file is invalid.");
  }
  return snapshot;
}

export function compareReviewSnapshot(snapshot, repoPath = process.cwd()) {
  const reviewed = validateSnapshot(snapshot);
  const current = captureReviewSnapshot(repoPath);
  const differences = [];
  if (current.repositoryRoot !== reviewed.repositoryRoot)
    differences.push("repository identity");
  if (current.head !== reviewed.head) differences.push("HEAD");
  if (current.trackedDiffSha256 !== reviewed.trackedDiffSha256)
    differences.push("tracked diff");

  const reviewedByPath = new Map(
    reviewed.untracked.map((entry) => [entry.path, entry]),
  );
  const currentByPath = new Map(
    current.untracked.map((entry) => [entry.path, entry]),
  );
  for (const relativePath of new Set([
    ...reviewedByPath.keys(),
    ...currentByPath.keys(),
  ])) {
    const before = reviewedByPath.get(relativePath);
    const after = currentByPath.get(relativePath);
    if (!before || !after) {
      differences.push(`untracked path set (${relativePath})`);
    } else if (before.type !== after.type || before.sha256 !== after.sha256) {
      differences.push(`untracked content (${relativePath})`);
    }
  }
  return { matches: differences.length === 0, differences, current };
}

export function assertReviewSnapshotMatches(
  snapshot,
  repoPath = process.cwd(),
) {
  const comparison = compareReviewSnapshot(snapshot, repoPath);
  if (!comparison.matches) {
    fail(`Reviewed slice changed: ${comparison.differences.join(", ")}.`);
  }
  return comparison.current;
}

function isInside(repositoryRoot, candidate) {
  const relative = path.relative(repositoryRoot, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== "..")
  );
}

function parseArguments(args) {
  const [mode, flag, value] = args;
  if (
    !value ||
    !(
      (mode === "capture" && flag === "--output") ||
      (mode === "verify" && flag === "--snapshot")
    ) ||
    args.length !== 3
  ) {
    fail(
      "Usage: reviewed-slice-snapshot <capture --output|verify --snapshot> <snapshot-file>",
    );
  }
  return { mode, snapshotPath: path.resolve(value) };
}

function main() {
  const { mode, snapshotPath } = parseArguments(process.argv.slice(2));
  const snapshot = captureReviewSnapshot();
  if (isInside(snapshot.repositoryRoot, snapshotPath)) {
    fail("Store the review snapshot outside the repository worktree.");
  }
  if (mode === "capture") {
    writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    console.log(`Review snapshot captured at ${snapshotPath}.`);
    return;
  }
  assertReviewSnapshotMatches(
    JSON.parse(readFileSync(snapshotPath, "utf8")),
    snapshot.repositoryRoot,
  );
  console.log("Reviewed slice snapshot matches.");
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(
      error instanceof ReviewSnapshotError
        ? `Review snapshot blocked: ${error.message}`
        : "Review snapshot failed unexpectedly.",
    );
    process.exitCode = 1;
  }
}
