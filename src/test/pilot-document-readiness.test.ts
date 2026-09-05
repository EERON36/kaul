import {
  mkdtemp,
  mkdir,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyPilotDocumentReadiness } from "../../scripts/pilot-document-readiness";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "kaul-readiness-"));
  roots.push(root);
  await mkdir(join(root, "objects"));
  await mkdir(join(root, "quarantine"));
  return {
    root,
    values: {
      DOCUMENT_STORAGE_ROOT: root,
      DOCUMENT_SCANNER_HOST: "127.0.0.1",
      DOCUMENT_SCANNER_PORT: "3310",
      DOCUMENT_SCANNER_TIMEOUT_MS: "15000",
      DOCUMENT_SCAN_MAX_SIGNATURE_AGE_HOURS: "24",
    },
  };
}
describe("Pilot Documents readiness", () => {
  it("proves storage write access and clean scanning without changing accepted objects", async () => {
    const { root, values } = await fixture();
    await writeFile(
      join(root, "objects", "retained-fictional-object"),
      "preserve",
    );
    const scan = vi.fn().mockResolvedValue({ status: "CLEAN" });
    const createScanner = vi.fn().mockReturnValue({ scan });
    await verifyPilotDocumentReadiness(values, createScanner);
    expect(createScanner).toHaveBeenCalledWith(
      expect.objectContaining({
        maxSignatureAgeHours: 24,
        host: "127.0.0.1",
        port: 3310,
      }),
    );
    expect(scan).toHaveBeenCalledOnce();
    expect(await readdir(join(root, "quarantine"))).toEqual([]);
    expect(await readdir(join(root, "objects"))).toEqual([
      "retained-fictional-object",
    ]);
  });
  it.each(["REJECTED", "FAILED"])(
    "refuses %s scanning and removes only its owned probe",
    async (status) => {
      const { root, values } = await fixture();
      await writeFile(
        join(root, "quarantine", "preserved-pending"),
        "preserve",
      );
      await expect(
        verifyPilotDocumentReadiness(values, () => ({
          scan: vi.fn().mockResolvedValue({ status }),
        })),
      ).rejects.toThrow();
      expect(await readdir(join(root, "quarantine"))).toEqual([
        "preserved-pending",
      ]);
    },
  );
  it("refuses unavailable scanning", async () => {
    const { values } = await fixture();
    await expect(
      verifyPilotDocumentReadiness(values, () => ({
        scan: vi.fn().mockRejectedValue(new Error("fictional failure")),
      })),
    ).rejects.toThrow();
  });
  it("refuses missing storage before contacting the scanner", async () => {
    const { root, values } = await fixture();
    await rm(join(root, "objects"), { recursive: true });
    const createScanner = vi.fn();
    await expect(
      verifyPilotDocumentReadiness(values, createScanner),
    ).rejects.toThrow();
    expect(createScanner).not.toHaveBeenCalled();
  });
  it("refuses a linked object directory", async () => {
    const { root, values } = await fixture();
    await rm(join(root, "objects"), { recursive: true });
    await symlink(
      join(root, "quarantine"),
      join(root, "objects"),
      process.platform === "win32" ? "junction" : "dir",
    );
    const createScanner = vi.fn();
    await expect(
      verifyPilotDocumentReadiness(values, createScanner),
    ).rejects.toThrow();
    expect(createScanner).not.toHaveBeenCalled();
  });
});
