import { describe, expect, it } from "vitest";

import {
  AuditError,
  createLoginSucceededAuditIntent,
  createPasswordChangedAuditIntent,
  createUnauthenticatedAuditIntent,
  createUserAuditIntent,
  generateAuditOperationId,
  recordAuditRecovery,
} from "./audit";
import { auditOperationIdSchema } from "./audit-vocabulary";
import type { AuthenticatedUser } from "../authentication/guards";

describe("audit service boundary", () => {
  it("keeps LOGIN_SUCCEEDED action and target context server-owned", async () => {
    const input = {
      operationId: "123e4567-e89b-42d3-a456-426614174000",
      actor: {
        userId: "123e4567-e89b-42d3-a456-426614174001",
        organisationId: "123e4567-e89b-42d3-a456-426614174002",
      },
    };

    await expect(
      createLoginSucceededAuditIntent({
        ...input,
        action: "ACCOUNT_DEACTIVATED",
      } as never),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      createLoginSucceededAuditIntent({
        ...input,
        target: { targetId: "browser-target" },
      } as never),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });

    if (false) {
      createLoginSucceededAuditIntent({
        ...input,
        // @ts-expect-error Login callers cannot select the audit action.
        action: "LOGIN_SUCCEEDED",
      });
    }
  });

  it("keeps forced-password users outside the generic application audit boundary", () => {
    if (false) {
      const forcedUser = {} as AuthenticatedUser;
      createPasswordChangedAuditIntent({
        operationId: "123e4567-e89b-42d3-a456-426614174000",
        actor: forcedUser,
      });
      createUserAuditIntent({
        operationId: "123e4567-e89b-42d3-a456-426614174000",
        // @ts-expect-error Generic user audit requires an ApplicationUser.
        actor: forcedUser,
        action: "ACCOUNT_DEACTIVATED",
        target: { targetId: "user-2" },
      });
      createPasswordChangedAuditIntent({
        operationId: "123e4567-e89b-42d3-a456-426614174000",
        actor: forcedUser,
        // @ts-expect-error Password-change callers cannot select an action.
        action: "ACCOUNT_DEACTIVATED",
      });
    }
    expect(true).toBe(true);
  });
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
