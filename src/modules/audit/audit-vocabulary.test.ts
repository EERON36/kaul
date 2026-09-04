import { describe, expect, it } from "vitest";

import {
  AUDIT_ACTION_POLICY,
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
  auditIntentContextSchema,
  auditOperationIdSchema,
} from "./audit-vocabulary";

const operationId = "123e4567-e89b-42d3-a456-426614174000";

function userContext(overrides: Record<string, unknown> = {}) {
  return {
    operationId,
    organisationId: "organisation-1",
    actorKind: "USER",
    actorUserId: "user-1",
    action: "ACCOUNT_DEACTIVATED",
    targetType: "USER",
    targetId: "user-2",
    ...overrides,
  };
}

describe("audit vocabulary", () => {
  it("defines the reviewed Client and Assignment mutation policies", () => {
    expect(AUDIT_ACTION_POLICY.CLIENT_CREATED).toEqual({
      actorKinds: ["USER"],
      organisation: "REQUIRED",
      targetType: "CLIENT",
      targetId: "REQUIRED",
    });
    expect(AUDIT_ACTION_POLICY.CLIENT_UPDATED).toEqual({
      actorKinds: ["USER"],
      organisation: "REQUIRED",
      targetType: "CLIENT",
      targetId: "REQUIRED",
    });
    expect(AUDIT_ACTION_POLICY.CLIENT_ARCHIVED).toEqual({
      actorKinds: ["USER"],
      organisation: "REQUIRED",
      targetType: "CLIENT",
      targetId: "REQUIRED",
    });
    expect(AUDIT_ACTION_POLICY.ASSIGNMENT_CREATED.targetType).toBe(
      "ASSIGNMENT",
    );
    expect(AUDIT_ACTION_POLICY.ASSIGNMENT_ENDED.targetType).toBe("ASSIGNMENT");
    expect(AUDIT_ACTION_POLICY.JOURNAL_ENTRY_SIGNED).toEqual({
      actorKinds: ["USER"],
      organisation: "REQUIRED",
      targetType: "JOURNAL_ENTRY",
      targetId: "REQUIRED",
    });
    expect(AUDIT_ACTION_POLICY.JOURNAL_CORRECTION_SIGNED).toEqual({
      actorKinds: ["USER"],
      organisation: "REQUIRED",
      targetType: "JOURNAL_ENTRY",
      targetId: "REQUIRED",
    });
  });
  it("contains only the accepted UPPER_SNAKE_CASE actions", () => {
    expect(AUDIT_ACTIONS).toEqual([
      "LOGIN_SUCCEEDED",
      "LOGIN_FAILED",
      "LOGOUT_SUCCEEDED",
      "INITIAL_ADMIN_CREATED",
      "STAFF_ACCOUNT_CREATED",
      "PASSWORD_CHANGED",
      "PASSWORD_RESET_BY_ADMIN",
      "ACCOUNT_DEACTIVATED",
      "ACCOUNT_REACTIVATED",
      "USER_ROLE_CHANGED",
      "USER_SESSIONS_REVOKED",
      "CLIENT_CREATED",
      "CLIENT_UPDATED",
      "CLIENT_ARCHIVED",
      "ASSIGNMENT_CREATED",
      "ASSIGNMENT_ENDED",
      "JOURNAL_ENTRY_SIGNED",
      "JOURNAL_CORRECTION_SIGNED",
      "GOAL_COMPLETED",
      "GOAL_ARCHIVED",
      "FOLLOW_UP_REASSIGNED",
      "FOLLOW_UP_COMPLETED",
      "FOLLOW_UP_CANCELLED",
      "DOCUMENT_UPLOADED",
      "DOCUMENT_VERSION_CREATED",
      "DOCUMENT_ARCHIVED",
      "DOCUMENT_SCAN_REJECTED",
      "DOCUMENT_DOWNLOAD_AUTHORISED",
    ]);
    expect(
      AUDIT_ACTIONS.every((action) => /^[A-Z][A-Z0-9_]*$/.test(action)),
    ).toBe(true);
  });

  it("uses only the reviewed target vocabulary", () => {
    expect(AUDIT_TARGET_TYPES).toEqual([
      "AUTHENTICATION",
      "ORGANISATION",
      "USER",
      "CLIENT",
      "ASSIGNMENT",
      "JOURNAL_ENTRY",
      "GOAL",
      "FOLLOW_UP",
      "DOCUMENT",
      "DOCUMENT_VERSION",
    ]);
    expect(
      auditIntentContextSchema.safeParse(
        userContext({ targetType: "ARBITRARY_RECORD" }),
      ).success,
    ).toBe(false);
  });

  it("defines the reviewed Documents policies without free-text metadata", () => {
    expect(AUDIT_ACTION_POLICY.DOCUMENT_UPLOADED.targetType).toBe("DOCUMENT");
    expect(AUDIT_ACTION_POLICY.DOCUMENT_VERSION_CREATED.targetType).toBe(
      "DOCUMENT",
    );
    expect(AUDIT_ACTION_POLICY.DOCUMENT_ARCHIVED.targetType).toBe("DOCUMENT");
    expect(AUDIT_ACTION_POLICY.DOCUMENT_SCAN_REJECTED.targetType).toBe(
      "DOCUMENT",
    );
    expect(AUDIT_ACTION_POLICY.DOCUMENT_DOWNLOAD_AUTHORISED.targetType).toBe(
      "DOCUMENT_VERSION",
    );
  });

  it("requires user actors to have both user and organisation identifiers", () => {
    expect(auditIntentContextSchema.safeParse(userContext()).success).toBe(
      true,
    );
    expect(
      auditIntentContextSchema.safeParse(userContext({ actorUserId: null }))
        .success,
    ).toBe(false);
    expect(
      auditIntentContextSchema.safeParse(userContext({ organisationId: null }))
        .success,
    ).toBe(false);
  });

  it("rejects user identifiers for system and unauthenticated actors", () => {
    expect(
      auditIntentContextSchema.safeParse({
        ...userContext({
          actorKind: "SYSTEM",
          actorUserId: "fake-user",
          action: "INITIAL_ADMIN_CREATED",
          targetType: "ORGANISATION",
          targetId: "organisation-1",
        }),
      }).success,
    ).toBe(false);
    expect(
      auditIntentContextSchema.safeParse({
        ...userContext({
          actorKind: "UNAUTHENTICATED",
          actorUserId: "fake-user",
          action: "LOGIN_FAILED",
          targetType: "AUTHENTICATION",
          targetId: null,
        }),
      }).success,
    ).toBe(false);
  });

  it("allows an unauthenticated event with no known organisation", () => {
    expect(
      auditIntentContextSchema.safeParse({
        operationId,
        organisationId: null,
        actorKind: "UNAUTHENTICATED",
        actorUserId: null,
        action: "LOGIN_FAILED",
        targetType: "AUTHENTICATION",
        targetId: null,
      }).success,
    ).toBe(true);
  });

  it("rejects invalid action, actor, target and target-id combinations", () => {
    expect(
      auditIntentContextSchema.safeParse(
        userContext({ action: "LOGIN_FAILED" }),
      ).success,
    ).toBe(false);
    expect(
      auditIntentContextSchema.safeParse(
        userContext({ targetType: "ORGANISATION" }),
      ).success,
    ).toBe(false);
    expect(
      auditIntentContextSchema.safeParse(userContext({ targetId: null }))
        .success,
    ).toBe(false);
    expect(
      auditIntentContextSchema.safeParse(
        userContext({
          action: "PASSWORD_CHANGED",
          targetId: "different-user",
        }),
      ).success,
    ).toBe(false);
    expect(
      auditIntentContextSchema.safeParse({
        operationId,
        organisationId: "organisation-1",
        actorKind: "SYSTEM",
        actorUserId: null,
        action: "INITIAL_ADMIN_CREATED",
        targetType: "ORGANISATION",
        targetId: "different-organisation",
      }).success,
    ).toBe(false);
  });

  it("strictly rejects arbitrary metadata and sensitive-looking fields", () => {
    for (const field of [
      "metadata",
      "password",
      "cookie",
      "databaseUrl",
      "requestBody",
      "exception",
    ]) {
      expect(
        auditIntentContextSchema.safeParse(
          userContext({ [field]: "fictional-sensitive-value" }),
        ).success,
      ).toBe(false);
    }
  });

  it("accepts only strict UUID operation identifiers", () => {
    expect(auditOperationIdSchema.safeParse(operationId).success).toBe(true);
    expect(auditOperationIdSchema.safeParse("not-a-uuid").success).toBe(false);
    expect(auditOperationIdSchema.safeParse("123").success).toBe(false);
  });
});
