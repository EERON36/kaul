-- CreateEnum
CREATE TYPE "JournalEntryStatus" AS ENUM ('DRAFT', 'SIGNED');

-- CreateEnum
CREATE TYPE "JournalEntryType" AS ENUM (
    'DAILY_NOTE',
    'CONVERSATION',
    'PHONE_CALL',
    'MEETING',
    'HOME_VISIT',
    'SCHOOL_CONTACT',
    'OBSERVATION',
    'OTHER'
);

-- CreateTable
CREATE TABLE "journalEntry" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(40) NOT NULL,
    "organisationId" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "status" "JournalEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "entryType" "JournalEntryType" NOT NULL,
    "eventOccurredAt" TIMESTAMPTZ(3) NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "signedAt" TIMESTAMPTZ(3),
    "signerUserId" TEXT,
    "signerName" TEXT,
    "signerProfessionalTitle" TEXT,
    "signerRole" "UserRole",
    "correctionOfId" UUID,

    CONSTRAINT "journalEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "journalEntry_reference_format_check" CHECK (
        "reference" ~ '^JRN-[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$'
    ),
    CONSTRAINT "journalEntry_positive_version_check" CHECK ("version" >= 1),
    CONSTRAINT "journalEntry_signing_state_check" CHECK (
        (
            "status" = 'DRAFT'
            AND "signedAt" IS NULL
            AND "signerUserId" IS NULL
            AND "signerName" IS NULL
            AND "signerProfessionalTitle" IS NULL
            AND "signerRole" IS NULL
        )
        OR
        (
            "status" = 'SIGNED'
            AND "signedAt" IS NOT NULL
            AND "signerUserId" = "authorUserId"
            AND "signerName" IS NOT NULL
            AND "signerProfessionalTitle" IS NOT NULL
            AND "signerRole" IS NOT NULL
            AND length(btrim("content")) > 0
        )
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "journalEntry_reference_key" ON "journalEntry"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "journalEntry_organisationId_clientId_id_key" ON "journalEntry"("organisationId", "clientId", "id");

-- CreateIndex
CREATE INDEX "journalEntry_organisationId_clientId_status_eventOccurred_idx" ON "journalEntry"("organisationId", "clientId", "status", "eventOccurredAt", "signedAt", "id");

-- CreateIndex
CREATE INDEX "journalEntry_organisationId_authorUserId_status_idx" ON "journalEntry"("organisationId", "authorUserId", "status");

-- CreateIndex
CREATE INDEX "journalEntry_correctionOfId_idx" ON "journalEntry"("correctionOfId");

-- One author can have at most one unfinished entry of any kind for a Client.
CREATE UNIQUE INDEX "journalEntry_one_open_draft_per_author_client_key"
ON "journalEntry"("organisationId", "clientId", "authorUserId")
WHERE "status" = 'DRAFT';

-- AddForeignKey
ALTER TABLE "journalEntry" ADD CONSTRAINT "journalEntry_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journalEntry" ADD CONSTRAINT "journalEntry_organisationId_clientId_fkey" FOREIGN KEY ("organisationId", "clientId") REFERENCES "client"("organisationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journalEntry" ADD CONSTRAINT "journalEntry_organisationId_authorUserId_fkey" FOREIGN KEY ("organisationId", "authorUserId") REFERENCES "user"("organisationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journalEntry" ADD CONSTRAINT "journalEntry_organisationId_clientId_correctionOfId_fkey" FOREIGN KEY ("organisationId", "clientId", "correctionOfId") REFERENCES "journalEntry"("organisationId", "clientId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Journal identity and correction linkage are fixed when the row is created.
-- A correction must point to a signed, non-correction original in the same
-- Organisation and Client. The composite foreign key supplies the scope proof.
CREATE FUNCTION "validateJournalEntryIdentityAndCorrection"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    target_status "JournalEntryStatus";
    target_correction_id UUID;
BEGIN
    IF TG_OP = 'UPDATE' AND (
        NEW."id" IS DISTINCT FROM OLD."id"
        OR NEW."reference" IS DISTINCT FROM OLD."reference"
        OR NEW."organisationId" IS DISTINCT FROM OLD."organisationId"
        OR NEW."clientId" IS DISTINCT FROM OLD."clientId"
        OR NEW."authorUserId" IS DISTINCT FROM OLD."authorUserId"
        OR NEW."correctionOfId" IS DISTINCT FROM OLD."correctionOfId"
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = 'Journal entry identity is immutable.';
    END IF;

    IF NEW."correctionOfId" IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT "status", "correctionOfId"
    INTO target_status, target_correction_id
    FROM "journalEntry"
    WHERE "organisationId" = NEW."organisationId"
      AND "clientId" = NEW."clientId"
      AND "id" = NEW."correctionOfId";

    IF NOT FOUND OR target_status <> 'SIGNED' OR target_correction_id IS NOT NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'A correction must reference a signed original journal entry in the same scope.';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "journalEntry_validate_identity_and_correction"
BEFORE INSERT OR UPDATE ON "journalEntry"
FOR EACH ROW
EXECUTE FUNCTION "validateJournalEntryIdentityAndCorrection"();

-- A Journal entry must be created as a DRAFT. The one legitimate completion
-- update is an exact DRAFT -> SIGNED transition that preserves the reviewed
-- draft payload and increments the optimistic version once. Once OLD is
-- SIGNED, no lower-level UPDATE or DELETE may alter it.
CREATE FUNCTION "preventSignedJournalEntryMutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW."status" = 'SIGNED' THEN
            RAISE EXCEPTION USING
                ERRCODE = '23514',
                MESSAGE = 'Journal entries must be created as drafts.';
        END IF;

        RETURN NEW;
    END IF;

    IF OLD."status" = 'SIGNED' THEN
        RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = 'Signed journal entries are immutable.';
    END IF;

    IF TG_OP = 'UPDATE' AND NEW."status" = 'SIGNED' AND (
        OLD."status" <> 'DRAFT'
        OR NEW."id" IS DISTINCT FROM OLD."id"
        OR NEW."reference" IS DISTINCT FROM OLD."reference"
        OR NEW."organisationId" IS DISTINCT FROM OLD."organisationId"
        OR NEW."clientId" IS DISTINCT FROM OLD."clientId"
        OR NEW."authorUserId" IS DISTINCT FROM OLD."authorUserId"
        OR NEW."entryType" IS DISTINCT FROM OLD."entryType"
        OR NEW."eventOccurredAt" IS DISTINCT FROM OLD."eventOccurredAt"
        OR NEW."content" IS DISTINCT FROM OLD."content"
        OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
        OR NEW."correctionOfId" IS DISTINCT FROM OLD."correctionOfId"
        OR NEW."version" <> OLD."version" + 1
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'Signing must preserve the reviewed journal draft.';
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER "journalEntry_prevent_signed_update_delete"
BEFORE INSERT OR UPDATE OR DELETE ON "journalEntry"
FOR EACH ROW
EXECUTE FUNCTION "preventSignedJournalEntryMutation"();

CREATE FUNCTION "preventJournalEntryTruncate"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'Journal entries cannot be truncated.';
END;
$$;

CREATE TRIGGER "journalEntry_prevent_truncate"
BEFORE TRUNCATE ON "journalEntry"
FOR EACH STATEMENT
EXECUTE FUNCTION "preventJournalEntryTruncate"();

-- A signed record and its immutable successful signing audit evidence must
-- become visible in the same commit. This deferred check permits the Journal
-- service to update the row before appending the outcome in its transaction.
CREATE FUNCTION "enforceSignedJournalAuditEvidence"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    expected_action TEXT;
BEGIN
    IF NEW."status" <> 'SIGNED' THEN
        RETURN NEW;
    END IF;

    expected_action := CASE
        WHEN NEW."correctionOfId" IS NULL THEN 'JOURNAL_ENTRY_SIGNED'
        ELSE 'JOURNAL_CORRECTION_SIGNED'
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM "auditOperation" operation
        JOIN "auditEvent" event ON event."operationId" = operation."id"
        WHERE operation."organisationId" = NEW."organisationId"
          AND operation."actorKind" = 'USER'
          AND operation."actorUserId" = NEW."authorUserId"
          AND operation."action" = expected_action
          AND operation."targetType" = 'JOURNAL_ENTRY'
          AND operation."targetId" = NEW."id"::text
          AND event."type" = 'OUTCOME'
          AND event."result" = 'SUCCEEDED'
          AND event."resolvedTargetId" = NEW."id"::text
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'Signed journal entries require successful audit evidence.';
    END IF;

    RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER "journalEntry_require_signing_audit"
AFTER INSERT OR UPDATE ON "journalEntry"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "enforceSignedJournalAuditEvidence"();
