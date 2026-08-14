-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('PLANNED', 'COMPLETED', 'CANCELLED');

-- A Stockholm wall-clock minute is valid only when exactly one UTC instant
-- maps back to it. Scanning the narrow offset window catches both DST gaps
-- and overlaps without guessing which side of a transition the user meant.
CREATE FUNCTION "isValidUniqueStockholmDueTime"(
    due_date DATE,
    due_time TEXT,
    due_at TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
STRICT
AS $$
DECLARE
    local_wall_time TIMESTAMP;
    converted_instant TIMESTAMPTZ;
    matching_instants INTEGER;
BEGIN
    IF due_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
        RETURN FALSE;
    END IF;

    local_wall_time := due_date + due_time::time;
    converted_instant := local_wall_time AT TIME ZONE 'Europe/Stockholm';

    IF due_at IS DISTINCT FROM converted_instant
       OR (due_at AT TIME ZONE 'Europe/Stockholm') IS DISTINCT FROM local_wall_time THEN
        RETURN FALSE;
    END IF;

    SELECT count(*) INTO matching_instants
      FROM generate_series(
          converted_instant - INTERVAL '3 hours',
          converted_instant + INTERVAL '3 hours',
          INTERVAL '1 minute'
      ) AS candidate(instant)
     WHERE candidate.instant AT TIME ZONE 'Europe/Stockholm' = local_wall_time;

    RETURN matching_instants = 1;
END;
$$;

-- CreateTable
CREATE TABLE "goal" (
    "id" UUID NOT NULL,
    "organisationId" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" DATE NOT NULL,
    "targetDate" DATE,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "completedAt" TIMESTAMPTZ(3),
    "completedByUserId" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "archivedByUserId" TEXT,

    CONSTRAINT "goal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "goal_title_check" CHECK (length(btrim("title")) BETWEEN 1 AND 200),
    CONSTRAINT "goal_positive_version_check" CHECK ("version" >= 1),
    CONSTRAINT "goal_lifecycle_check" CHECK (
        ("status" IN ('ACTIVE', 'PAUSED') AND "completedAt" IS NULL AND "completedByUserId" IS NULL AND "archivedAt" IS NULL AND "archivedByUserId" IS NULL)
        OR ("status" = 'COMPLETED' AND "completedAt" IS NOT NULL AND "completedByUserId" IS NOT NULL AND "archivedAt" IS NULL AND "archivedByUserId" IS NULL)
        OR ("status" = 'ARCHIVED' AND "archivedAt" IS NOT NULL AND "archivedByUserId" IS NOT NULL AND "completedAt" IS NULL AND "completedByUserId" IS NULL)
    )
);

-- CreateTable
CREATE TABLE "followUp" (
    "id" UUID NOT NULL,
    "organisationId" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "dueDate" DATE NOT NULL,
    "dueTime" VARCHAR(5),
    "dueAt" TIMESTAMPTZ(3),
    "status" "FollowUpStatus" NOT NULL DEFAULT 'PLANNED',
    "goalId" UUID,
    "createdByUserId" TEXT NOT NULL,
    "responsibleUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "completedAt" TIMESTAMPTZ(3),
    "completedByUserId" TEXT,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelledByUserId" TEXT,

    CONSTRAINT "followUp_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "followUp_title_check" CHECK (length(btrim("title")) BETWEEN 1 AND 200),
    CONSTRAINT "followUp_positive_version_check" CHECK ("version" >= 1),
    CONSTRAINT "followUp_due_time_check" CHECK (
        ("dueTime" IS NULL AND "dueAt" IS NULL)
        OR (
            "dueTime" IS NOT NULL
            AND "dueAt" IS NOT NULL
            AND "isValidUniqueStockholmDueTime"("dueDate", "dueTime", "dueAt")
        )
    ),
    CONSTRAINT "followUp_lifecycle_check" CHECK (
        ("status" = 'PLANNED' AND "completedAt" IS NULL AND "completedByUserId" IS NULL AND "cancelledAt" IS NULL AND "cancelledByUserId" IS NULL)
        OR ("status" = 'COMPLETED' AND "completedAt" IS NOT NULL AND "completedByUserId" IS NOT NULL AND "cancelledAt" IS NULL AND "cancelledByUserId" IS NULL)
        OR ("status" = 'CANCELLED' AND "cancelledAt" IS NOT NULL AND "cancelledByUserId" IS NOT NULL AND "completedAt" IS NULL AND "completedByUserId" IS NULL)
    )
);

-- CreateTable
CREATE TABLE "followUpResponsibilityHistory" (
    "id" UUID NOT NULL,
    "organisationId" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "followUpId" UUID NOT NULL,
    "previousResponsibleUserId" TEXT NOT NULL,
    "newResponsibleUserId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "followUpVersion" INTEGER NOT NULL,
    "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "auditOperationId" UUID NOT NULL,

    CONSTRAINT "followUpResponsibilityHistory_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "followUpResponsibilityHistory_users_differ_check" CHECK ("previousResponsibleUserId" <> "newResponsibleUserId"),
    CONSTRAINT "followUpResponsibilityHistory_version_check" CHECK ("followUpVersion" >= 2)
);

-- CreateTable
CREATE TABLE "journalGoalReference" (
    "organisationId" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "journalEntryId" UUID NOT NULL,
    "goalId" UUID NOT NULL,
    "titleSnapshot" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journalGoalReference_pkey" PRIMARY KEY ("journalEntryId", "goalId")
);

-- CreateIndex
CREATE UNIQUE INDEX "goal_organisationId_clientId_id_key" ON "goal"("organisationId", "clientId", "id");
CREATE INDEX "goal_organisationId_clientId_status_startDate_id_idx" ON "goal"("organisationId", "clientId", "status", "startDate", "id");
CREATE UNIQUE INDEX "followUp_organisationId_clientId_id_key" ON "followUp"("organisationId", "clientId", "id");
CREATE INDEX "followUp_organisationId_clientId_status_dueDate_dueTime_id_idx" ON "followUp"("organisationId", "clientId", "status", "dueDate", "dueTime", "id");
CREATE INDEX "followUp_organisationId_responsible_status_due_idx" ON "followUp"("organisationId", "responsibleUserId", "status", "dueDate", "dueTime", "id");
CREATE INDEX "followUp_goalId_idx" ON "followUp"("goalId");
CREATE UNIQUE INDEX "followUpResponsibilityHistory_followUp_version_key" ON "followUpResponsibilityHistory"("followUpId", "followUpVersion");
CREATE UNIQUE INDEX "history_audit_operation_key" ON "followUpResponsibilityHistory"("auditOperationId");
CREATE INDEX "followUpResponsibilityHistory_scope_changed_idx" ON "followUpResponsibilityHistory"("organisationId", "clientId", "followUpId", "changedAt", "id");
CREATE INDEX "journalGoalReference_scope_goal_idx" ON "journalGoalReference"("organisationId", "clientId", "goalId");

-- AddForeignKey
ALTER TABLE "goal" ADD CONSTRAINT "goal_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goal" ADD CONSTRAINT "goal_scope_client_fkey" FOREIGN KEY ("organisationId", "clientId") REFERENCES "client"("organisationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goal" ADD CONSTRAINT "goal_scope_creator_fkey" FOREIGN KEY ("organisationId", "createdByUserId") REFERENCES "user"("organisationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goal" ADD CONSTRAINT "goal_scope_completed_actor_fkey" FOREIGN KEY ("organisationId", "completedByUserId") REFERENCES "user"("organisationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goal" ADD CONSTRAINT "goal_scope_archived_actor_fkey" FOREIGN KEY ("organisationId", "archivedByUserId") REFERENCES "user"("organisationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "followUp" ADD CONSTRAINT "followUp_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "followUp" ADD CONSTRAINT "followUp_scope_client_fkey" FOREIGN KEY ("organisationId", "clientId") REFERENCES "client"("organisationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "followUp" ADD CONSTRAINT "followUp_scope_goal_fkey" FOREIGN KEY ("organisationId", "clientId", "goalId") REFERENCES "goal"("organisationId", "clientId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "followUp" ADD CONSTRAINT "followUp_scope_creator_fkey" FOREIGN KEY ("organisationId", "createdByUserId") REFERENCES "user"("organisationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "followUp" ADD CONSTRAINT "followUp_scope_responsible_fkey" FOREIGN KEY ("organisationId", "responsibleUserId") REFERENCES "user"("organisationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "followUp" ADD CONSTRAINT "followUp_scope_completed_actor_fkey" FOREIGN KEY ("organisationId", "completedByUserId") REFERENCES "user"("organisationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "followUp" ADD CONSTRAINT "followUp_scope_cancelled_actor_fkey" FOREIGN KEY ("organisationId", "cancelledByUserId") REFERENCES "user"("organisationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "followUpResponsibilityHistory" ADD CONSTRAINT "history_scope_followUp_fkey" FOREIGN KEY ("organisationId", "clientId", "followUpId") REFERENCES "followUp"("organisationId", "clientId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "followUpResponsibilityHistory" ADD CONSTRAINT "history_scope_previous_user_fkey" FOREIGN KEY ("organisationId", "previousResponsibleUserId") REFERENCES "user"("organisationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "followUpResponsibilityHistory" ADD CONSTRAINT "history_scope_new_user_fkey" FOREIGN KEY ("organisationId", "newResponsibleUserId") REFERENCES "user"("organisationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "followUpResponsibilityHistory" ADD CONSTRAINT "history_scope_actor_fkey" FOREIGN KEY ("organisationId", "actorUserId") REFERENCES "user"("organisationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "followUpResponsibilityHistory" ADD CONSTRAINT "history_audit_operation_fkey" FOREIGN KEY ("auditOperationId") REFERENCES "auditOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "journalGoalReference" ADD CONSTRAINT "journalGoalReference_scope_entry_fkey" FOREIGN KEY ("organisationId", "clientId", "journalEntryId") REFERENCES "journalEntry"("organisationId", "clientId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "journalGoalReference" ADD CONSTRAINT "journalGoalReference_scope_goal_fkey" FOREIGN KEY ("organisationId", "clientId", "goalId") REFERENCES "goal"("organisationId", "clientId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Goal identity, creator, and terminal history are immutable. Every ordinary
-- update must advance the optimistic version exactly once.
CREATE FUNCTION "protectGoalLifecycle"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW."status" <> 'ACTIVE' OR NEW."version" <> 1 THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Goals must be created active at version one.';
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Goals cannot be deleted.';
    END IF;

    IF OLD."status" IN ('COMPLETED', 'ARCHIVED') THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Terminal Goals are immutable.';
    END IF;
    IF NEW."id" IS DISTINCT FROM OLD."id"
       OR NEW."organisationId" IS DISTINCT FROM OLD."organisationId"
       OR NEW."clientId" IS DISTINCT FROM OLD."clientId"
       OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId"
       OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
       OR NEW."version" <> OLD."version" + 1 THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Goal identity or version is invalid.';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "goal_protect_lifecycle"
BEFORE INSERT OR UPDATE OR DELETE ON "goal"
FOR EACH ROW EXECUTE FUNCTION "protectGoalLifecycle"();

CREATE FUNCTION "protectPlanningTruncate"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Retained planning records cannot be truncated.';
END;
$$;

CREATE TRIGGER "goal_prevent_truncate" BEFORE TRUNCATE ON "goal" FOR EACH STATEMENT EXECUTE FUNCTION "protectPlanningTruncate"();

-- Follow-up identity and creator are fixed. Only PLANNED rows can change and
-- each change advances the optimistic version exactly once.
CREATE FUNCTION "protectFollowUpLifecycle"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW."status" <> 'PLANNED' OR NEW."version" <> 1 THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Follow-ups must be created planned at version one.';
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Follow-ups cannot be deleted.';
    END IF;

    IF OLD."status" <> 'PLANNED' THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Terminal Follow-ups are immutable.';
    END IF;
    IF OLD."responsibleUserId" IS DISTINCT FROM NEW."responsibleUserId"
       AND OLD."status" IS DISTINCT FROM NEW."status" THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Follow-up reassignment and terminal transition must be separate actions.';
    END IF;
    IF NEW."id" IS DISTINCT FROM OLD."id"
       OR NEW."organisationId" IS DISTINCT FROM OLD."organisationId"
       OR NEW."clientId" IS DISTINCT FROM OLD."clientId"
       OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId"
       OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
       OR NEW."version" <> OLD."version" + 1 THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Follow-up identity or version is invalid.';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "followUp_protect_lifecycle"
BEFORE INSERT OR UPDATE OR DELETE ON "followUp"
FOR EACH ROW EXECUTE FUNCTION "protectFollowUpLifecycle"();
CREATE TRIGGER "followUp_prevent_truncate" BEFORE TRUNCATE ON "followUp" FOR EACH STATEMENT EXECUTE FUNCTION "protectPlanningTruncate"();

-- Direct history writes are forbidden. The only allowed INSERT is nested
-- inside the Follow-up transition trigger below.
CREATE FUNCTION "protectResponsibilityHistory"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' AND pg_trigger_depth() < 2 THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Responsibility history is created only by Follow-up reassignment.';
    END IF;
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Responsibility history is immutable.';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "history_protect_mutation"
BEFORE INSERT OR UPDATE OR DELETE ON "followUpResponsibilityHistory"
FOR EACH ROW EXECUTE FUNCTION "protectResponsibilityHistory"();
CREATE TRIGGER "history_prevent_truncate" BEFORE TRUNCATE ON "followUpResponsibilityHistory" FOR EACH STATEMENT EXECUTE FUNCTION "protectPlanningTruncate"();

CREATE FUNCTION "createFollowUpResponsibilityHistory"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    operation_text TEXT;
    operation_id UUID;
    operation_actor TEXT;
BEGIN
    IF OLD."responsibleUserId" IS NOT DISTINCT FROM NEW."responsibleUserId" THEN
        RETURN NEW;
    END IF;

    operation_text := nullif(current_setting('kaul.follow_up_reassignment_operation_id', true), '');
    IF operation_text IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Follow-up reassignment requires a unique audit operation.';
    END IF;
    BEGIN
        operation_id := operation_text::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Follow-up reassignment audit operation is invalid.';
    END;

    SELECT operation."actorUserId" INTO operation_actor
      FROM "auditOperation" operation
     WHERE operation."id" = operation_id
       AND operation."organisationId" = NEW."organisationId"
       AND operation."actorKind" = 'USER'
       AND operation."actorUserId" IS NOT NULL
       AND operation."action" = 'FOLLOW_UP_REASSIGNED'
       AND operation."targetType" = 'FOLLOW_UP'
       AND operation."targetId" = NEW."id"::text;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Follow-up reassignment audit operation does not match the transition.';
    END IF;

    INSERT INTO "followUpResponsibilityHistory" (
        "id", "organisationId", "clientId", "followUpId",
        "previousResponsibleUserId", "newResponsibleUserId", "actorUserId",
        "followUpVersion", "changedAt", "auditOperationId"
    ) VALUES (
        operation_id, NEW."organisationId", NEW."clientId", NEW."id",
        OLD."responsibleUserId", NEW."responsibleUserId", operation_actor,
        NEW."version", statement_timestamp(), operation_id
    );
    RETURN NEW;
END;
$$;

CREATE TRIGGER "followUp_create_responsibility_history"
AFTER UPDATE ON "followUp"
FOR EACH ROW EXECUTE FUNCTION "createFollowUpResponsibilityHistory"();

-- Journal Goal selections can change only while the author's entry is a
-- draft. A private transaction marker permits the signing trigger below to
-- fill the exact current Goal title and no other snapshot updates.
CREATE FUNCTION "protectJournalGoalReference"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    entry_status "JournalEntryStatus";
    current_goal_title TEXT;
    signing_entry_id TEXT;
BEGIN
    SELECT "status" INTO entry_status
      FROM "journalEntry"
     WHERE "organisationId" = COALESCE(NEW."organisationId", OLD."organisationId")
       AND "clientId" = COALESCE(NEW."clientId", OLD."clientId")
       AND "id" = COALESCE(NEW."journalEntryId", OLD."journalEntryId");

    IF NOT FOUND OR entry_status <> 'DRAFT' THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Signed Journal Goal references are immutable.';
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW."titleSnapshot" IS NOT NULL THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Draft Goal references cannot contain title snapshots.';
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    IF NEW."organisationId" IS DISTINCT FROM OLD."organisationId"
       OR NEW."clientId" IS DISTINCT FROM OLD."clientId"
       OR NEW."journalEntryId" IS DISTINCT FROM OLD."journalEntryId"
       OR NEW."goalId" IS DISTINCT FROM OLD."goalId"
       OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Journal Goal reference identity is immutable.';
    END IF;

    signing_entry_id := current_setting('kaul.signing_journal_id', true);
    SELECT "title" INTO current_goal_title
      FROM "goal"
     WHERE "organisationId" = NEW."organisationId"
       AND "clientId" = NEW."clientId"
       AND "id" = NEW."goalId";

    IF signing_entry_id IS DISTINCT FROM NEW."journalEntryId"::text
       OR OLD."titleSnapshot" IS NOT NULL
       OR NEW."titleSnapshot" IS DISTINCT FROM current_goal_title THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Journal Goal snapshots are created only by signing.';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "journalGoalReference_protect_mutation"
BEFORE INSERT OR UPDATE OR DELETE ON "journalGoalReference"
FOR EACH ROW EXECUTE FUNCTION "protectJournalGoalReference"();
CREATE TRIGGER "journalGoalReference_prevent_truncate" BEFORE TRUNCATE ON "journalGoalReference" FOR EACH STATEMENT EXECUTE FUNCTION "protectPlanningTruncate"();

CREATE FUNCTION "freezeJournalGoalReferences"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD."status" = 'DRAFT' AND NEW."status" = 'SIGNED' THEN
        PERFORM set_config('kaul.signing_journal_id', NEW."id"::text, true);
        UPDATE "journalGoalReference" reference
           SET "titleSnapshot" = goal."title"
          FROM "goal" goal
         WHERE reference."organisationId" = NEW."organisationId"
           AND reference."clientId" = NEW."clientId"
           AND reference."journalEntryId" = NEW."id"
           AND goal."organisationId" = reference."organisationId"
           AND goal."clientId" = reference."clientId"
           AND goal."id" = reference."goalId";
        PERFORM set_config('kaul.signing_journal_id', '', true);

        IF EXISTS (
            SELECT 1 FROM "journalGoalReference"
             WHERE "journalEntryId" = NEW."id" AND "titleSnapshot" IS NULL
        ) THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Signing must freeze every Goal title.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- Trigger names sort before the existing journalEntry_prevent_* trigger, so
-- snapshots are frozen before the reviewed Journal signing transition check.
CREATE TRIGGER "journalEntry_freeze_goal_references"
BEFORE UPDATE ON "journalEntry"
FOR EACH ROW EXECUTE FUNCTION "freezeJournalGoalReferences"();

-- Audited planning transitions must commit with their matching successful
-- immutable outcome. These deferred checks allow mutation before outcome
-- insertion inside one transaction.
CREATE FUNCTION "enforceGoalAuditEvidence"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    expected_action TEXT;
    expected_actor TEXT;
BEGIN
    IF OLD."status" = NEW."status" OR NEW."status" NOT IN ('COMPLETED', 'ARCHIVED') THEN
        RETURN NEW;
    END IF;
    expected_action := CASE WHEN NEW."status" = 'COMPLETED' THEN 'GOAL_COMPLETED' ELSE 'GOAL_ARCHIVED' END;
    expected_actor := CASE WHEN NEW."status" = 'COMPLETED' THEN NEW."completedByUserId" ELSE NEW."archivedByUserId" END;

    IF NOT EXISTS (
        SELECT 1 FROM "auditOperation" operation
        JOIN "auditEvent" event ON event."operationId" = operation."id"
        WHERE operation."organisationId" = NEW."organisationId"
          AND operation."actorKind" = 'USER'
          AND operation."actorUserId" = expected_actor
          AND operation."action" = expected_action
          AND operation."targetType" = 'GOAL'
          AND operation."targetId" = NEW."id"::text
          AND event."type" = 'OUTCOME'
          AND event."result" = 'SUCCEEDED'
          AND event."resolvedTargetId" = NEW."id"::text
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Terminal Goal transitions require successful audit evidence.';
    END IF;
    RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER "goal_require_transition_audit"
AFTER UPDATE ON "goal" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "enforceGoalAuditEvidence"();

CREATE FUNCTION "enforceFollowUpAuditEvidence"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    expected_action TEXT;
    expected_actor TEXT;
    history_operation_id UUID;
BEGIN
    IF OLD."responsibleUserId" IS DISTINCT FROM NEW."responsibleUserId"
       AND OLD."status" IS DISTINCT FROM NEW."status" THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Follow-up reassignment and terminal transition must be separate actions.';
    END IF;
    IF OLD."responsibleUserId" IS DISTINCT FROM NEW."responsibleUserId" THEN
        SELECT "auditOperationId", "actorUserId"
          INTO history_operation_id, expected_actor
          FROM "followUpResponsibilityHistory"
         WHERE "followUpId" = NEW."id" AND "followUpVersion" = NEW."version"
           AND "previousResponsibleUserId" = OLD."responsibleUserId"
           AND "newResponsibleUserId" = NEW."responsibleUserId";
        IF NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Follow-up reassignment requires immutable history.';
        END IF;
        expected_action := 'FOLLOW_UP_REASSIGNED';
    ELSIF OLD."status" IS DISTINCT FROM NEW."status" AND NEW."status" = 'COMPLETED' THEN
        expected_action := 'FOLLOW_UP_COMPLETED';
        expected_actor := NEW."completedByUserId";
    ELSIF OLD."status" IS DISTINCT FROM NEW."status" AND NEW."status" = 'CANCELLED' THEN
        expected_action := 'FOLLOW_UP_CANCELLED';
        expected_actor := NEW."cancelledByUserId";
    ELSE
        RETURN NEW;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM "auditOperation" operation
        JOIN "auditEvent" event ON event."operationId" = operation."id"
        WHERE operation."organisationId" = NEW."organisationId"
          AND (expected_action <> 'FOLLOW_UP_REASSIGNED' OR operation."id" = history_operation_id)
          AND operation."actorKind" = 'USER'
          AND operation."actorUserId" = expected_actor
          AND operation."action" = expected_action
          AND operation."targetType" = 'FOLLOW_UP'
          AND operation."targetId" = NEW."id"::text
          AND event."type" = 'OUTCOME'
          AND event."result" = 'SUCCEEDED'
          AND event."resolvedTargetId" = NEW."id"::text
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Protected Follow-up transitions require successful audit evidence.';
    END IF;
    RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER "followUp_require_transition_audit"
AFTER UPDATE ON "followUp" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "enforceFollowUpAuditEvidence"();
