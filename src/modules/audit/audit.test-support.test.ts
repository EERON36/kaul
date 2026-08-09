import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  checkPasswordChangedIntentPersistenceFaultForTest,
  failPasswordChangedIntentPersistenceForOperationForTest,
  resetAuditTestStateForTest,
} from "./audit.test-support";

afterEach(() => {
  vi.unstubAllEnvs();
  resetAuditTestStateForTest();
});

describe("password-change audit persistence fault isolation", () => {
  it("does not let a different operation consume the armed fault", () => {
    const operationA = randomUUID();
    const operationB = randomUUID();
    failPasswordChangedIntentPersistenceForOperationForTest(operationA);

    expect(() =>
      checkPasswordChangedIntentPersistenceFaultForTest(operationB),
    ).not.toThrow();
    expect(() =>
      checkPasswordChangedIntentPersistenceFaultForTest(operationA),
    ).toThrow("Injected password-change audit intent persistence failure.");
  });

  it("consumes a matching operation fault exactly once", () => {
    const operationId = randomUUID();
    failPasswordChangedIntentPersistenceForOperationForTest(operationId);

    expect(() =>
      checkPasswordChangedIntentPersistenceFaultForTest(operationId),
    ).toThrow();
    expect(() =>
      checkPasswordChangedIntentPersistenceFaultForTest(operationId),
    ).not.toThrow();
  });

  it("isolates concurrently scheduled operation checks", async () => {
    const operationA = randomUUID();
    const operationB = randomUUID();
    failPasswordChangedIntentPersistenceForOperationForTest(operationA);

    const [attemptA, attemptB] = await Promise.allSettled([
      Promise.resolve().then(() =>
        checkPasswordChangedIntentPersistenceFaultForTest(operationA),
      ),
      Promise.resolve().then(() =>
        checkPasswordChangedIntentPersistenceFaultForTest(operationB),
      ),
    ]);

    expect(attemptA.status).toBe("rejected");
    expect(attemptB.status).toBe("fulfilled");
  });

  it("keeps an early-failing operation fault away from another request", () => {
    const earlyFailureOperation = randomUUID();
    const unrelatedOperation = randomUUID();
    failPasswordChangedIntentPersistenceForOperationForTest(
      earlyFailureOperation,
    );

    expect(() =>
      checkPasswordChangedIntentPersistenceFaultForTest(unrelatedOperation),
    ).not.toThrow();
    resetAuditTestStateForTest();
    expect(() =>
      checkPasswordChangedIntentPersistenceFaultForTest(earlyFailureOperation),
    ).not.toThrow();
  });

  it("rejects invalid operation IDs and production activation", () => {
    expect(() =>
      failPasswordChangedIntentPersistenceForOperationForTest("not-a-uuid"),
    ).toThrow();

    vi.stubEnv("NODE_ENV", "production");
    expect(() =>
      failPasswordChangedIntentPersistenceForOperationForTest(randomUUID()),
    ).toThrow("Audit test support requires NODE_ENV=test.");
  });
});
