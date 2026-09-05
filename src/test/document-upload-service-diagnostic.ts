import { Buffer } from "node:buffer";
import { once } from "node:events";
import { lstat, mkdir, realpath } from "node:fs/promises";
import { createConnection, type Socket } from "node:net";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { Readable } from "node:stream";

import { requireApprovedDeclaredType } from "../modules/documents/document-input";
import {
  ClamAvDocumentScanner,
  type MalwareScanResult,
} from "../modules/documents/document-malware-scanner";
import {
  FileSystemDocumentStorage,
  generateDocumentStorageKey,
} from "../modules/documents/document-storage";
import {
  storeBoundedUpload,
  validateStoredUpload,
} from "../modules/documents/document-validation";
import {
  parseDocumentEnvironment,
  type DocumentEnvironment,
} from "../modules/documents/document-environment";
import { getTestEnvironment } from "./test-environment";

type DiagnosticEnvironmentValues = Record<string, string | undefined>;

export const documentUploadServiceDiagnosticStages = [
  "STORAGE_WRITE",
  "STORAGE_VALIDATE",
  "STORAGE_OPEN",
  "SCANNER_CONNECT",
  "SCANNER_VERSION_RESPONSE",
  "SCANNER_SIGNATURE_FRESHNESS",
  "SCANNER_STREAM_RESPONSE",
  "SCANNER_ADAPTER_SCAN",
  "STORAGE_PROMOTE",
] as const;

export type DocumentUploadServiceDiagnosticStage =
  (typeof documentUploadServiceDiagnosticStages)[number];

export type DocumentUploadServiceDiagnosticFailure =
  DocumentUploadServiceDiagnosticStage | "DIAGNOSTIC_UNAVAILABLE" | null;

export type DocumentUploadServiceDiagnosticReport = Readonly<{
  schemaVersion: 1;
  ticket: "KAUL-205";
  probe: "DOCUMENT_UPLOAD_SERVICE";
  completedStages: readonly DocumentUploadServiceDiagnosticStage[];
  failureStage: DocumentUploadServiceDiagnosticFailure;
}>;

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

class ProbeFailure {
  constructor(readonly stage: DocumentUploadServiceDiagnosticStage) {}
}

const months = new Map(
  [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ].map((month, index) => [month, index]),
);
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function isStrictlyContainedPath(root: string, candidate: string) {
  const pathFromRoot = relative(resolve(root), resolve(candidate));
  return (
    pathFromRoot.length > 0 &&
    pathFromRoot !== ".." &&
    !pathFromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromRoot)
  );
}

function parseVersionResponse(value: string) {
  const match = /^ClamAV\s+([^/]+)\/([^/]+)\/(.+)$/.exec(value);
  if (!match?.[1] || !match[2] || !match[3]) throw new Error();
  return match[3];
}

function parseClamAvUtcTimestamp(value: string) {
  const match =
    /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s{1,2}(\d{1,2}) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/.exec(
      value,
    );
  const month = match?.[2] ? months.get(match[2]) : undefined;
  if (!match || month === undefined) throw new Error();
  const [
    ,
    weekday,
    ,
    dayValue,
    hourValue,
    minuteValue,
    secondValue,
    yearValue,
  ] = match;
  const year = Number(yearValue);
  const day = Number(dayValue);
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  const second = Number(secondValue);
  const result = new Date(Date.UTC(year, month, day, hour, minute, second));
  if (
    result.getUTCFullYear() !== year ||
    result.getUTCMonth() !== month ||
    result.getUTCDate() !== day ||
    result.getUTCHours() !== hour ||
    result.getUTCMinutes() !== minute ||
    result.getUTCSeconds() !== second ||
    weekdays[result.getUTCDay()] !== weekday
  ) {
    throw new Error();
  }
  return result;
}

export function isFreshClamAvVersionResponse(
  value: string,
  now: Date,
  maxSignatureAgeHours: number,
) {
  const signatureDate = parseClamAvUtcTimestamp(parseVersionResponse(value));
  const ageMs = now.getTime() - signatureDate.getTime();
  return (
    !Number.isNaN(signatureDate.getTime()) &&
    ageMs >= -60 * 60 * 1000 &&
    ageMs <= maxSignatureAgeHours * 60 * 60 * 1000
  );
}

async function write(socket: Socket, value: Uint8Array) {
  if (!socket.write(value)) await once(socket, "drain");
}

async function connect(options: DocumentEnvironment) {
  const socket = createConnection({
    host: options.DOCUMENT_SCANNER_HOST,
    port: options.DOCUMENT_SCANNER_PORT,
  });
  socket.setTimeout(options.DOCUMENT_SCANNER_TIMEOUT_MS);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      once(socket, "connect"),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error()),
          options.DOCUMENT_SCANNER_TIMEOUT_MS,
        );
      }),
    ]);
    return socket;
  } catch {
    socket.destroy();
    throw new Error();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function response(socket: Socket, timeoutMs: number) {
  return new Promise<string>((resolveResponse, rejectResponse) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const settle = (value?: string) => {
      if (settled) return;
      settled = true;
      if (value === undefined) rejectResponse(new Error());
      else resolveResponse(value);
    };
    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      settle();
    });
    socket.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 8_192) {
        socket.destroy();
        settle();
        return;
      }
      chunks.push(chunk);
      if (chunk.includes(0) || chunk.includes(10)) {
        settle(
          Buffer.concat(chunks)
            .toString("utf8")
            .replace(/[\0\r\n]+$/g, ""),
        );
      }
    });
    socket.once("error", () => settle());
    socket.once("end", () => {
      settle(
        chunks.length > 0
          ? Buffer.concat(chunks)
              .toString("utf8")
              .replace(/[\0\r\n]+$/g, "")
          : undefined,
      );
    });
  });
}

async function versionProbe(
  options: DocumentEnvironment,
  complete: (
    stage: DocumentUploadServiceDiagnosticStage,
    operation: () => Promise<void>,
  ) => Promise<void>,
) {
  let socket: Socket | undefined;
  await complete("SCANNER_CONNECT", async () => {
    socket = await connect(options);
  });
  if (!socket) throw new Error();
  const connectedSocket = socket;
  try {
    let signatureDate = "";
    await complete("SCANNER_VERSION_RESPONSE", async () => {
      const pending = response(
        connectedSocket,
        options.DOCUMENT_SCANNER_TIMEOUT_MS,
      );
      void pending.catch(() => undefined);
      await write(connectedSocket, Buffer.from("zVERSION\0"));
      const value = await pending;
      signatureDate = parseVersionResponse(value);
    });
    await complete("SCANNER_SIGNATURE_FRESHNESS", async () => {
      const value = parseClamAvUtcTimestamp(signatureDate);
      const ageMs = Date.now() - value.getTime();
      if (
        Number.isNaN(value.getTime()) ||
        ageMs < -60 * 60 * 1000 ||
        ageMs > options.DOCUMENT_SCAN_MAX_SIGNATURE_AGE_HOURS * 60 * 60 * 1000
      ) {
        throw new Error();
      }
    });
  } finally {
    connectedSocket.destroy();
  }
}

async function streamProbe(
  options: DocumentEnvironment,
  bytes: Buffer,
  complete: (
    stage: DocumentUploadServiceDiagnosticStage,
    operation: () => Promise<void>,
  ) => Promise<void>,
) {
  await complete("SCANNER_STREAM_RESPONSE", async () => {
    const socket = await connect(options);
    try {
      const pending = response(socket, options.DOCUMENT_SCANNER_TIMEOUT_MS);
      void pending.catch(() => undefined);
      await write(socket, Buffer.from("zINSTREAM\0"));
      const length = Buffer.allocUnsafe(4);
      length.writeUInt32BE(bytes.length);
      await write(socket, length);
      await write(socket, bytes);
      await write(socket, Buffer.alloc(4));
      if ((await pending) !== "stream: OK") throw new Error();
    } finally {
      socket.destroy();
    }
  });
}

function body(bytes: Buffer) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

async function runProbe(
  environment: DocumentEnvironment,
  storageRoot: string,
): Promise<DocumentUploadServiceDiagnosticReport> {
  const completedStages: DocumentUploadServiceDiagnosticStage[] = [];
  let failureStage: DocumentUploadServiceDiagnosticFailure = null;
  const complete = async (
    stage: DocumentUploadServiceDiagnosticStage,
    operation: () => Promise<void>,
  ) => {
    try {
      await operation();
      completedStages.push(stage);
    } catch {
      failureStage ??= stage;
      throw new ProbeFailure(stage);
    }
  };
  const bytes = Buffer.from("Fiktivt KAUL-205 diagnostikdokument\n", "utf8");
  const storage = new FileSystemDocumentStorage(storageRoot);
  let quarantineKey: string | undefined;
  let storageKey: string | undefined;
  let promoted = false;

  try {
    let upload: Awaited<ReturnType<typeof storeBoundedUpload>> | undefined;
    try {
      await complete("STORAGE_WRITE", async () => {
        upload = await storeBoundedUpload(
          storage,
          body(bytes),
          String(bytes.length),
        );
        quarantineKey = upload.quarantineKey;
      });
      await complete("STORAGE_VALIDATE", async () => {
        if (!upload) throw new Error();
        await validateStoredUpload(
          storage,
          upload,
          requireApprovedDeclaredType("diagnostik.txt", "text/plain"),
        );
      });
      await complete("STORAGE_OPEN", async () => {
        if (!upload) throw new Error();
        const handle = await storage.openQuarantine(upload.quarantineKey);
        await handle.close();
      });
    } catch {}

    try {
      await versionProbe(environment, complete);
    } catch {}
    try {
      await streamProbe(environment, bytes, complete);
    } catch {}
    try {
      await complete("SCANNER_ADAPTER_SCAN", async () => {
        const scanner = new ClamAvDocumentScanner({
          host: environment.DOCUMENT_SCANNER_HOST,
          port: environment.DOCUMENT_SCANNER_PORT,
          timeoutMs: environment.DOCUMENT_SCANNER_TIMEOUT_MS,
          maxSignatureAgeHours:
            environment.DOCUMENT_SCAN_MAX_SIGNATURE_AGE_HOURS,
        });
        const result: MalwareScanResult = await scanner.scan(
          Readable.from([bytes]),
        );
        if (result.status !== "CLEAN") throw new Error();
      });
    } catch {}

    if (failureStage === null) {
      await complete("STORAGE_PROMOTE", async () => {
        if (!quarantineKey) throw new Error();
        storageKey = generateDocumentStorageKey();
        await storage.promote(quarantineKey, storageKey);
        quarantineKey = undefined;
        promoted = true;
        const stored = await storage.stat(storageKey);
        if (stored.size !== bytes.length) throw new Error();
      });
    }

    return {
      schemaVersion: 1,
      ticket: "KAUL-205",
      probe: "DOCUMENT_UPLOAD_SERVICE",
      completedStages,
      failureStage,
    };
  } catch (error) {
    return {
      schemaVersion: 1,
      ticket: "KAUL-205",
      probe: "DOCUMENT_UPLOAD_SERVICE",
      completedStages,
      failureStage:
        failureStage ??
        (error instanceof ProbeFailure
          ? error.stage
          : "DIAGNOSTIC_UNAVAILABLE"),
    };
  } finally {
    if (quarantineKey) {
      await storage.removeQuarantine(quarantineKey).catch(() => undefined);
    }
    if (promoted && storageKey) {
      await storage.removeUnreferenced(storageKey).catch(() => undefined);
    }
  }
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
    if (!runnerTemp || !isAbsolute(runnerTemp)) throw new Error();
    const runner = await realpath(runnerTemp);
    const environment = parseDocumentEnvironment(values);
    const storageRoot = environment.DOCUMENT_STORAGE_ROOT;
    if (!isStrictlyContainedPath(runner, storageRoot)) throw new Error();

    const rootExists = await directoryExistsWithin(runner, storageRoot);
    const objectsExists = await directoryExistsWithin(
      runner,
      resolve(storageRoot, "objects"),
    );
    const quarantineExists = await directoryExistsWithin(
      runner,
      resolve(storageRoot, "quarantine"),
    );
    return {
      inspectionAvailable: true,
      rootExists,
      objectsExists,
      quarantineExists,
    };
  } catch {
    return unavailableDirectoryState;
  }
}

async function requireRegularContainedDirectory(
  runnerTemp: string,
  candidate: string,
  create: boolean,
) {
  const runner = await realpath(runnerTemp);
  if (!isStrictlyContainedPath(runner, candidate)) throw new Error();
  if (create) await mkdir(candidate, { recursive: true, mode: 0o700 });
  const value = await lstat(candidate);
  if (!value.isDirectory() || value.isSymbolicLink()) throw new Error();
  const resolved = await realpath(candidate);
  if (!isStrictlyContainedPath(runner, resolved)) throw new Error();
  return resolved;
}

export async function runDocumentUploadServiceDiagnostic(
  values: DiagnosticEnvironmentValues = process.env,
): Promise<
  Readonly<{
    artifactDirectory: string;
    report: DocumentUploadServiceDiagnosticReport;
  }>
> {
  if (
    values.GITHUB_ACTIONS !== "true" ||
    values.CI !== "true" ||
    values.DEPLOYMENT_ENV !== "test"
  ) {
    throw new Error();
  }
  const testEnvironment = getTestEnvironment(values);
  if (testEnvironment.testId !== "ci") throw new Error();
  const environment = parseDocumentEnvironment(values);
  if (
    environment.DOCUMENT_SCANNER_HOST !== "127.0.0.1" &&
    environment.DOCUMENT_SCANNER_HOST !== "localhost"
  ) {
    throw new Error();
  }
  const runnerTemp = values.RUNNER_TEMP;
  if (!runnerTemp || !isAbsolute(runnerTemp)) throw new Error();
  const artifactDirectory = await requireRegularContainedDirectory(
    runnerTemp,
    resolve(runnerTemp, "kaul-205-service-diagnostic"),
    true,
  );

  try {
    const storageRoot = await requireRegularContainedDirectory(
      runnerTemp,
      environment.DOCUMENT_STORAGE_ROOT,
      false,
    );
    return {
      artifactDirectory,
      report: await runProbe(environment, storageRoot),
    };
  } catch {
    return {
      artifactDirectory,
      report: {
        schemaVersion: 1,
        ticket: "KAUL-205",
        probe: "DOCUMENT_UPLOAD_SERVICE",
        completedStages: [],
        failureStage: "DIAGNOSTIC_UNAVAILABLE",
      },
    };
  }
}
