import { z } from "zod";

export const AUDIT_ACTION_POLICY = {
  LOGIN_SUCCEEDED: {
    actorKinds: ["USER"],
    organisation: "REQUIRED",
    targetType: "AUTHENTICATION",
    targetId: "FORBIDDEN",
  },
  LOGIN_FAILED: {
    actorKinds: ["UNAUTHENTICATED"],
    organisation: "OPTIONAL",
    targetType: "AUTHENTICATION",
    targetId: "FORBIDDEN",
  },
  LOGOUT_SUCCEEDED: {
    actorKinds: ["USER"],
    organisation: "REQUIRED",
    targetType: "AUTHENTICATION",
    targetId: "FORBIDDEN",
  },
  INITIAL_ADMIN_CREATED: {
    actorKinds: ["SYSTEM"],
    organisation: "REQUIRED",
    targetType: "ORGANISATION",
    targetId: "REQUIRED",
    targetIdMustEqualOrganisationId: true,
  },
  STAFF_ACCOUNT_CREATED: {
    actorKinds: ["USER"],
    organisation: "REQUIRED",
    targetType: "USER",
    targetId: "OPTIONAL",
    resolvedTargetIdRequiredOnSuccess: true,
  },
  PASSWORD_CHANGED: {
    actorKinds: ["USER"],
    organisation: "REQUIRED",
    targetType: "USER",
    targetId: "REQUIRED",
    targetIdMustEqualActorUserId: true,
  },
  PASSWORD_RESET_BY_ADMIN: {
    actorKinds: ["USER"],
    organisation: "REQUIRED",
    targetType: "USER",
    targetId: "REQUIRED",
  },
  ACCOUNT_DEACTIVATED: {
    actorKinds: ["USER"],
    organisation: "REQUIRED",
    targetType: "USER",
    targetId: "REQUIRED",
  },
  ACCOUNT_REACTIVATED: {
    actorKinds: ["USER"],
    organisation: "REQUIRED",
    targetType: "USER",
    targetId: "REQUIRED",
  },
  USER_ROLE_CHANGED: {
    actorKinds: ["USER"],
    organisation: "REQUIRED",
    targetType: "USER",
    targetId: "REQUIRED",
  },
  USER_SESSIONS_REVOKED: {
    actorKinds: ["USER"],
    organisation: "REQUIRED",
    targetType: "USER",
    targetId: "REQUIRED",
  },
  CLIENT_CREATED: {
    actorKinds: ["USER"],
    organisation: "REQUIRED",
    targetType: "CLIENT",
    targetId: "REQUIRED",
  },
  CLIENT_UPDATED: {
    actorKinds: ["USER"],
    organisation: "REQUIRED",
    targetType: "CLIENT",
    targetId: "REQUIRED",
  },
  CLIENT_ARCHIVED: {
    actorKinds: ["USER"],
    organisation: "REQUIRED",
    targetType: "CLIENT",
    targetId: "REQUIRED",
  },
  ASSIGNMENT_CREATED: {
    actorKinds: ["USER"],
    organisation: "REQUIRED",
    targetType: "ASSIGNMENT",
    targetId: "REQUIRED",
  },
  ASSIGNMENT_ENDED: {
    actorKinds: ["USER"],
    organisation: "REQUIRED",
    targetType: "ASSIGNMENT",
    targetId: "REQUIRED",
  },
  JOURNAL_ENTRY_SIGNED: {
    actorKinds: ["USER"],
    organisation: "REQUIRED",
    targetType: "JOURNAL_ENTRY",
    targetId: "REQUIRED",
  },
  JOURNAL_CORRECTION_SIGNED: {
    actorKinds: ["USER"],
    organisation: "REQUIRED",
    targetType: "JOURNAL_ENTRY",
    targetId: "REQUIRED",
  },
  GOAL_COMPLETED: {
    actorKinds: ["USER"],
    organisation: "REQUIRED",
    targetType: "GOAL",
    targetId: "REQUIRED",
  },
  GOAL_ARCHIVED: {
    actorKinds: ["USER"],
    organisation: "REQUIRED",
    targetType: "GOAL",
    targetId: "REQUIRED",
  },
  FOLLOW_UP_REASSIGNED: {
    actorKinds: ["USER"],
    organisation: "REQUIRED",
    targetType: "FOLLOW_UP",
    targetId: "REQUIRED",
  },
  FOLLOW_UP_COMPLETED: {
    actorKinds: ["USER"],
    organisation: "REQUIRED",
    targetType: "FOLLOW_UP",
    targetId: "REQUIRED",
  },
  FOLLOW_UP_CANCELLED: {
    actorKinds: ["USER"],
    organisation: "REQUIRED",
    targetType: "FOLLOW_UP",
    targetId: "REQUIRED",
  },
  MONTHLY_REPORT_SIGNED: {
    actorKinds: ["USER"],
    organisation: "REQUIRED",
    targetType: "MONTHLY_REPORT",
    targetId: "REQUIRED",
  },
} as const;

export const AUDIT_ACTIONS = [
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
  "MONTHLY_REPORT_SIGNED",
] as const satisfies readonly (keyof typeof AUDIT_ACTION_POLICY)[];

export const AUDIT_TARGET_TYPES = [
  "AUTHENTICATION",
  "ORGANISATION",
  "USER",
  "CLIENT",
  "ASSIGNMENT",
  "JOURNAL_ENTRY",
  "GOAL",
  "FOLLOW_UP",
  "MONTHLY_REPORT",
] as const;

export const auditActionSchema = z.enum(AUDIT_ACTIONS);
export const auditTargetTypeSchema = z.enum(AUDIT_TARGET_TYPES);
export const auditOperationIdSchema = z.uuid();

export const auditHistoricalIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(200);
const nullableHistoricalIdentifierSchema =
  auditHistoricalIdentifierSchema.nullable();

export const auditIntentContextSchema = z
  .object({
    operationId: auditOperationIdSchema,
    organisationId: nullableHistoricalIdentifierSchema,
    actorKind: z.enum(["USER", "SYSTEM", "UNAUTHENTICATED"]),
    actorUserId: nullableHistoricalIdentifierSchema,
    action: auditActionSchema,
    targetType: auditTargetTypeSchema,
    targetId: nullableHistoricalIdentifierSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const policy = AUDIT_ACTION_POLICY[value.action];

    if (!(policy.actorKinds as readonly string[]).includes(value.actorKind)) {
      context.addIssue({
        code: "custom",
        message: "Actor kind is not allowed for the audit action.",
        path: ["actorKind"],
      });
    }

    if (value.actorKind === "USER") {
      if (value.actorUserId === null) {
        context.addIssue({
          code: "custom",
          message: "A user actor requires an actor identifier.",
          path: ["actorUserId"],
        });
      }
      if (value.organisationId === null) {
        context.addIssue({
          code: "custom",
          message: "A user actor requires an organisation identifier.",
          path: ["organisationId"],
        });
      }
    } else if (value.actorUserId !== null) {
      context.addIssue({
        code: "custom",
        message: "This actor kind cannot have a user identifier.",
        path: ["actorUserId"],
      });
    }

    if (policy.organisation === "REQUIRED" && value.organisationId === null) {
      context.addIssue({
        code: "custom",
        message: "The audit action requires organisation context.",
        path: ["organisationId"],
      });
    }

    if (value.targetType !== policy.targetType) {
      context.addIssue({
        code: "custom",
        message: "Target type is not allowed for the audit action.",
        path: ["targetType"],
      });
    }

    if (policy.targetId === "REQUIRED" && value.targetId === null) {
      context.addIssue({
        code: "custom",
        message: "The audit action requires a target identifier.",
        path: ["targetId"],
      });
    }

    if (policy.targetId === "FORBIDDEN" && value.targetId !== null) {
      context.addIssue({
        code: "custom",
        message: "The audit action cannot have a target identifier.",
        path: ["targetId"],
      });
    }

    if (
      "targetIdMustEqualOrganisationId" in policy &&
      policy.targetIdMustEqualOrganisationId &&
      value.targetId !== value.organisationId
    ) {
      context.addIssue({
        code: "custom",
        message: "The target must match the operation organisation.",
        path: ["targetId"],
      });
    }

    if (
      "targetIdMustEqualActorUserId" in policy &&
      policy.targetIdMustEqualActorUserId &&
      value.targetId !== value.actorUserId
    ) {
      context.addIssue({
        code: "custom",
        message: "The target must match the acting user.",
        path: ["targetId"],
      });
    }
  });

export type AuditAction = z.infer<typeof auditActionSchema>;
export type AuditTargetType = z.infer<typeof auditTargetTypeSchema>;
export type AuditIntentContext = z.infer<typeof auditIntentContextSchema>;

export function getAuditActionPolicy(action: AuditAction) {
  return AUDIT_ACTION_POLICY[action];
}
