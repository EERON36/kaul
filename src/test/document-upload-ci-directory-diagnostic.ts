import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { getTestEnvironment } from "./test-environment";

type DiagnosticEnvironmentValues = Record<string, string | undefined>;

export type DocumentStorageDirectoryState = Readonly<{
  inspectionAvailable: boolean;
  rootExists: boolean | null;
  objectsExists: boolean | null;
  quarantineExists: boolean | null;
}>;

const unavailableDirectoryState: DocumentStorageDirectoryState = {
  inspectionAvailable: false,
  rootExists: null,
  objectsExists: null,
  quarantineExists: null,
};

export function isStrictlyContainedPath(root: string, candidate: string) {
  const pathFromRoot = relative(resolve(root), resolve(candidate));
  return (
    pathFromRoot.length > 0 &&
    pathFromRoot !== ".." &&
    !pathFromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromRoot)
  );
}

async function directoryExistsWithin(
  runnerTemp: string,
  candidate: string,
): Promise<boolean> {
  if (!isStrictlyContainedPath(runnerTemp, candidate)) throw new Error();
  try {
    const value = await lstat(candidate);
    if (!value.isDirectory() || value.isSymbolicLink()) throw new Error();
    const resolved = await realpath(candidate);
    if (!isStrictlyContainedPath(runnerTemp, resolved)) throw new Error();
    return true;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return false;
    }
    throw error;
  }
}

export async function inspectCiDocumentStorageDirectories(
  values: DiagnosticEnvironmentValues = process.env,
): Promise<DocumentStorageDirectoryState> {
  try {
    if (
      values.GITHUB_ACTIONS !== "true" ||
      values.CI !== "true" ||
      values.DEPLOYMENT_ENV !== "test"
    ) {
      throw new Error();
    }
    const testEnvironment = getTestEnvironment(values);
    if (testEnvironment.testId !== "ci") throw new Error();

    const runnerTemp = values.RUNNER_TEMP;
    const storageRootValue = values.DOCUMENT_STORAGE_ROOT;
    if (
      !runnerTemp ||
      !isAbsolute(runnerTemp) ||
      !storageRootValue ||
      !isAbsolute(storageRootValue)
    ) {
      throw new Error();
    }
    const runner = await realpath(runnerTemp);
    const storageRoot = resolve(storageRootValue);
    if (!isStrictlyContainedPath(runner, storageRoot)) throw new Error();

    return {
      inspectionAvailable: true,
      rootExists: await directoryExistsWithin(runner, storageRoot),
      objectsExists: await directoryExistsWithin(
        runner,
        resolve(storageRoot, "objects"),
      ),
      quarantineExists: await directoryExistsWithin(
        runner,
        resolve(storageRoot, "quarantine"),
      ),
    };
  } catch {
    return unavailableDirectoryState;
  }
}
