import { describe, expect, it } from "vitest";

import {
  AuditError,
  createUnauthenticatedAuditIntent,
  generateAuditOperationId,
  recordAuditRecovery,
} from "./audit";
import { auditOperationIdSchema } from "./audit-vocabulary";

describe("audit service boundary", () => {
  it("generates a valid random operation UUID", () => {
    const first = generateAuditOperationId();
    const second = generateAuditOperationId();

    expect(auditOperationIdSchema.safeParse(first).success).toBe(true);
    expect(auditOperationIdSchema.safeParse(second).success).toBe(true);
    expect(first).not.toBe(second);
  });

  it("uses a generic error message without raw internal text", () => {
    const error = new AuditError(
      "OUTCOME_PERSISTENCE_FAILED",
      "123e4567-e89b-42d3-a456-426614174000",
    );

    expect(error.message).toBe("Audit requirement not satisfied.");
    expect(error.message).not.toContain("Prisma");
    expect(error.message).not.toContain("postgresql://");
    expect(error.message).not.toContain("Audit records are immutable");
  });

  it("rejects AMBIGUOUS as a recovery result before database access", () => {
    expect(() =>
      recordAuditRecovery(
        "123e4567-e89b-42d3-a456-426614174000",
        "AMBIGUOUS" as "SUCCEEDED",
      ),
    ).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
  });

  it("does not accept unauthenticated organisation attribution", () => {
    const input = {
      operationId: "123e4567-e89b-42d3-a456-426614174000",
      action: "LOGIN_FAILED" as const,
    };

    expect(input).not.toHaveProperty("organisationId");
    expect(() =>
      createUnauthenticatedAuditIntent({
        ...input,
        organisationId: "browser-controlled-organisation",
      } as never),
    ).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));

    if (false) {
      createUnauthenticatedAuditIntent({
        ...input,
        // @ts-expect-error Unauthenticated callers cannot attribute an Organisation.
        organisationId: "organisation-1",
      });
    }
  });

  it("continues to enforce action and target policy for unauthenticated intent", () => {
    expect(() =>
      createUnauthenticatedAuditIntent({
        operationId: "123e4567-e89b-42d3-a456-426614174000",
        action: "LOGIN_SUCCEEDED",
      }),
    ).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
    expect(() =>
      createUnauthenticatedAuditIntent({
        operationId: "123e4567-e89b-42d3-a456-426614174000",
        action: "LOGIN_FAILED",
        target: { targetId: "browser-controlled-target" },
      } as never),
    ).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
  });
});
