-- CreateEnum
CREATE TYPE "AuditActorKind" AS ENUM ('USER', 'SYSTEM', 'UNAUTHENTICATED');

-- CreateEnum
CREATE TYPE "AuditEventType" AS ENUM ('OUTCOME', 'RECOVERY');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('SUCCEEDED', 'FAILED', 'AMBIGUOUS');

-- CreateTable
CREATE TABLE "auditOperation" (
    "id" UUID NOT NULL,
    "organisationId" TEXT,
    "actorKind" "AuditActorKind" NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditOperation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "auditOperation_actor_context_check" CHECK (
        (
            "actorKind" = 'USER'
            AND "actorUserId" IS NOT NULL
            AND "organisationId" IS NOT NULL
        )
        OR (
            "actorKind" IN ('SYSTEM', 'UNAUTHENTICATED')
            AND "actorUserId" IS NULL
        )
    ),
    CONSTRAINT "auditOperation_action_format_check" CHECK (
        "action" ~ '^[A-Z][A-Z0-9_]*$'
    ),
    CONSTRAINT "auditOperation_target_type_format_check" CHECK (
        "targetType" ~ '^[A-Z][A-Z0-9_]*$'
    ),
    CONSTRAINT "auditOperation_organisation_id_check" CHECK (
        "organisationId" IS NULL OR length("organisationId") BETWEEN 1 AND 200
    ),
    CONSTRAINT "auditOperation_actor_user_id_check" CHECK (
        "actorUserId" IS NULL OR length("actorUserId") BETWEEN 1 AND 200
    ),
    CONSTRAINT "auditOperation_target_id_check" CHECK (
        "targetId" IS NULL OR length("targetId") BETWEEN 1 AND 200
    )
);

-- CreateTable
CREATE TABLE "auditEvent" (
    "id" UUID NOT NULL,
    "operationId" UUID NOT NULL,
    "type" "AuditEventType" NOT NULL,
    "result" "AuditResult" NOT NULL,
    "resolvedTargetId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "auditEvent_type_result_check" CHECK (
        "type" = 'OUTCOME'
        OR ("type" = 'RECOVERY' AND "result" IN ('SUCCEEDED', 'FAILED'))
    ),
    CONSTRAINT "auditEvent_resolved_target_id_check" CHECK (
        "resolvedTargetId" IS NULL
        OR length("resolvedTargetId") BETWEEN 1 AND 200
    )
);

-- CreateIndex
CREATE INDEX "auditOperation_organisationId_createdAt_idx" ON "auditOperation"("organisationId", "createdAt");

-- CreateIndex
CREATE INDEX "auditOperation_actorUserId_createdAt_idx" ON "auditOperation"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "auditOperation_action_createdAt_idx" ON "auditOperation"("action", "createdAt");

-- CreateIndex
CREATE INDEX "auditOperation_targetType_targetId_idx" ON "auditOperation"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "auditEvent_operationId_occurredAt_idx" ON "auditEvent"("operationId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "auditEvent_operationId_type_key" ON "auditEvent"("operationId", "type");

-- AddForeignKey
ALTER TABLE "auditEvent" ADD CONSTRAINT "auditEvent_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "auditOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Audit history is immutable through ordinary application and maintenance
-- operations. A database owner can deliberately remove these protections, so
-- this is defence against accidental mutation rather than owner-level tampering.
CREATE FUNCTION "preventAuditRecordMutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'Audit records are immutable.';
END;
$$;

CREATE TRIGGER "auditOperation_prevent_update_delete"
BEFORE UPDATE OR DELETE ON "auditOperation"
FOR EACH ROW
EXECUTE FUNCTION "preventAuditRecordMutation"();

CREATE TRIGGER "auditOperation_prevent_truncate"
BEFORE TRUNCATE ON "auditOperation"
FOR EACH STATEMENT
EXECUTE FUNCTION "preventAuditRecordMutation"();

CREATE TRIGGER "auditEvent_prevent_update_delete"
BEFORE UPDATE OR DELETE ON "auditEvent"
FOR EACH ROW
EXECUTE FUNCTION "preventAuditRecordMutation"();

CREATE TRIGGER "auditEvent_prevent_truncate"
BEFORE TRUNCATE ON "auditEvent"
FOR EACH STATEMENT
EXECUTE FUNCTION "preventAuditRecordMutation"();
