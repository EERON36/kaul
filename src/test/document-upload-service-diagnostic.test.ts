import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer, type Server, type Socket } from "node:net";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  inspectCiDocumentStorageDirectories,
  isFreshClamAvVersionResponse,
  isStrictlyContainedPath,
  runDocumentUploadServiceDiagnostic,
} from "./document-upload-service-diagnostic";

describe("KAUL-205 service diagnostic guards", () => {
  it("accepts only strict descendants of the runner temp directory", () => {
    const root = resolve("fictional-runner-temp");
    expect(isStrictlyContainedPath(root, resolve(root, "diagnostic"))).toBe(
      true,
    );
    expect(isStrictlyContainedPath(root, root)).toBe(false);
    expect(isStrictlyContainedPath(root, resolve(root, ".."))).toBe(false);
    expect(
      isStrictlyContainedPath(root, resolve(`${root}-sibling`, "diagnostic")),
    ).toBe(false);
  });

  it("uses the production freshness boundary without retaining version data", () => {
    const now = new Date("2026-09-05T12:00:00.000Z");
    expect(
      isFreshClamAvVersionResponse(
        "ClamAV 1.4.6/27700/Fri Sep 4 13:00:00 2026",
        now,
        24,
      ),
    ).toBe(true);
    expect(
      isFreshClamAvVersionResponse(
        "ClamAV 1.4.6/27700/Fri Sep 4 11:59:59 2026",
        now,
        24,
      ),
    ).toBe(false);
    expect(() =>
      isFreshClamAvVersionResponse("untrusted raw reply", now, 24),
    ).toThrow();
  });
});
function ciEnvironment(
  runnerTemp: string,
  storageRoot: string,
  scannerPort = 3310,
) {
  return {
    GITHUB_ACTIONS: "true",
    CI: "true",
    DEPLOYMENT_ENV: "test",
    KAUL_TEST_ID: "ci",
    KAUL_TEST_PORT: "3101",
    DATABASE_URL: "postgresql://kaul:fictional@127.0.0.1:5432/kaul_test_ci",
    INTEGRATION_DATABASE_URL:
      "postgresql://kaul:fictional@127.0.0.1:5432/kaul_test_ci",
    BETTER_AUTH_URL: "http://127.0.0.1:3101",
    DOCUMENT_STORAGE_ROOT: storageRoot,
    DOCUMENT_SCANNER_HOST: "127.0.0.1",
    DOCUMENT_SCANNER_PORT: String(scannerPort),
    DOCUMENT_SCANNER_TIMEOUT_MS: "15000",
    DOCUMENT_SCAN_MAX_SIGNATURE_AGE_HOURS: "24",
    RUNNER_TEMP: runnerTemp,
  };
}

describe("KAUL-205 post-failure storage snapshot", () => {
  it("reports only bounded existence booleans for validated CI temp paths", async () => {
    const runnerTemp = await mkdtemp(resolve(tmpdir(), "kaul-runner-temp-"));
    const storageRoot = resolve(runnerTemp, "documents");
    try {
      await expect(
        inspectCiDocumentStorageDirectories(
          ciEnvironment(runnerTemp, storageRoot),
        ),
      ).resolves.toEqual({
        inspectionAvailable: true,
        rootExists: false,
        objectsExists: false,
        quarantineExists: false,
      });

      await mkdir(resolve(storageRoot, "objects"), { recursive: true });
      await expect(
        inspectCiDocumentStorageDirectories(
          ciEnvironment(runnerTemp, storageRoot),
        ),
      ).resolves.toEqual({
        inspectionAvailable: true,
        rootExists: true,
        objectsExists: true,
        quarantineExists: false,
      });

      await mkdir(resolve(storageRoot, "quarantine"));
      await expect(
        inspectCiDocumentStorageDirectories(
          ciEnvironment(runnerTemp, storageRoot),
        ),
      ).resolves.toEqual({
        inspectionAvailable: true,
        rootExists: true,
        objectsExists: true,
        quarantineExists: true,
      });
    } finally {
      await rm(runnerTemp, { recursive: true, force: true });
    }
  });

  it("refuses storage roots outside the validated runner temp", async () => {
    const runnerTemp = await mkdtemp(resolve(tmpdir(), "kaul-runner-temp-"));
    try {
      await expect(
        inspectCiDocumentStorageDirectories(
          ciEnvironment(runnerTemp, resolve(runnerTemp, "..", "outside")),
        ),
      ).resolves.toEqual({
        inspectionAvailable: false,
        rootExists: null,
        objectsExists: null,
        quarantineExists: null,
      });
    } finally {
      await rm(runnerTemp, { recursive: true, force: true });
    }
  });
});
describe("KAUL-205 execution guard", () => {
  it("refuses non-CI execution before creating diagnostic output", async () => {
    const runnerTemp = await mkdtemp(resolve(tmpdir(), "kaul-runner-temp-"));
    try {
      await expect(
        runDocumentUploadServiceDiagnostic({
          RUNNER_TEMP: runnerTemp,
          GITHUB_ACTIONS: "false",
          CI: "false",
          DEPLOYMENT_ENV: "test",
        }),
      ).rejects.toThrow();
      await expect(readdir(runnerTemp)).resolves.toEqual([]);
    } finally {
      await rm(runnerTemp, { recursive: true, force: true });
    }
  });
});
function currentClamAvTimestamp() {
  const value = new Date();
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
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
  ];
  return `${weekdays[value.getUTCDay()]} ${months[value.getUTCMonth()]} ${value.getUTCDate()} ${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}:${String(value.getUTCSeconds()).padStart(2, "0")} ${value.getUTCFullYear()}`;
}

async function listenToFictionalClamAv(
  firstVersionTimestamp?: string,
): Promise<{
  server: Server;
  sockets: Set<Socket>;
  port: number;
}> {
  const sockets = new Set<Socket>();
  let versionResponses = 0;
  const versionCommand = Buffer.from("zVERSION\0");
  const streamCommand = Buffer.from("zINSTREAM\0");
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    let received = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      received = Buffer.concat([received, chunk]);
      if (received.subarray(0, versionCommand.length).equals(versionCommand)) {
        const timestamp =
          versionResponses === 0 && firstVersionTimestamp
            ? firstVersionTimestamp
            : currentClamAvTimestamp();
        versionResponses += 1;
        socket.end(`ClamAV 1.4.6/27700/${timestamp}\0`);
        return;
      }
      if (!received.subarray(0, streamCommand.length).equals(streamCommand)) {
        return;
      }
      let offset = streamCommand.length;
      while (received.length >= offset + 4) {
        const length = received.readUInt32BE(offset);
        offset += 4;
        if (length === 0) {
          socket.end("stream: OK\0");
          return;
        }
        if (received.length < offset + length) return;
        offset += length;
      }
    });
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error();
  return { server, sockets, port: address.port };
}

describe("KAUL-205 service probe", () => {
  it("uses the real adapters and removes only its generated objects", async () => {
    const runnerTemp = await mkdtemp(resolve(tmpdir(), "kaul-runner-temp-"));
    const storageRoot = resolve(runnerTemp, "documents");
    await mkdir(storageRoot);
    const { server, sockets, port } = await listenToFictionalClamAv();
    try {
      const { artifactDirectory, report } =
        await runDocumentUploadServiceDiagnostic(
          ciEnvironment(runnerTemp, storageRoot, port),
        );

      expect(report).toEqual({
        schemaVersion: 1,
        ticket: "KAUL-205",
        probe: "DOCUMENT_UPLOAD_SERVICE",
        completedStages: [
          "STORAGE_WRITE",
          "STORAGE_VALIDATE",
          "STORAGE_OPEN",
          "SCANNER_CONNECT",
          "SCANNER_VERSION_RESPONSE",
          "SCANNER_SIGNATURE_FRESHNESS",
          "SCANNER_STREAM_RESPONSE",
          "SCANNER_ADAPTER_SCAN",
          "STORAGE_PROMOTE",
        ],
        failureStage: null,
      });
      await expect(readdir(resolve(storageRoot, "objects"))).resolves.toEqual(
        [],
      );
      await expect(
        readdir(resolve(storageRoot, "quarantine")),
      ).resolves.toEqual([]);
      expect(isStrictlyContainedPath(runnerTemp, artifactDirectory)).toBe(true);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolveClose) =>
        server.close(() => resolveClose()),
      );
      await rm(runnerTemp, { recursive: true, force: true });
    }
  });
  it("confirms the actual adapter after a raw freshness failure and does not promote", async () => {
    const runnerTemp = await mkdtemp(resolve(tmpdir(), "kaul-runner-temp-"));
    const storageRoot = resolve(runnerTemp, "documents");
    await mkdir(storageRoot);
    const { server, sockets, port } = await listenToFictionalClamAv(
      "Sat Jan 1 00:00:00 2000",
    );
    try {
      const { report } = await runDocumentUploadServiceDiagnostic(
        ciEnvironment(runnerTemp, storageRoot, port),
      );

      expect(report).toEqual({
        schemaVersion: 1,
        ticket: "KAUL-205",
        probe: "DOCUMENT_UPLOAD_SERVICE",
        completedStages: [
          "STORAGE_WRITE",
          "STORAGE_VALIDATE",
          "STORAGE_OPEN",
          "SCANNER_CONNECT",
          "SCANNER_VERSION_RESPONSE",
          "SCANNER_STREAM_RESPONSE",
          "SCANNER_ADAPTER_SCAN",
        ],
        failureStage: "SCANNER_SIGNATURE_FRESHNESS",
      });
      await expect(readdir(resolve(storageRoot, "objects"))).resolves.toEqual(
        [],
      );
      await expect(
        readdir(resolve(storageRoot, "quarantine")),
      ).resolves.toEqual([]);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolveClose) =>
        server.close(() => resolveClose()),
      );
      await rm(runnerTemp, { recursive: true, force: true });
    }
  });
});
