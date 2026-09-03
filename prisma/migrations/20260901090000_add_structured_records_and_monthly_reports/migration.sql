-- Structured Journal content is additive. Existing narrative rows keep their
-- original content bytes and are identified explicitly as legacy records.
CREATE TYPE "JournalContentFormat" AS ENUM ('LEGACY_NARRATIVE', 'STRUCTURED_V1');

CREATE TYPE "MonthlyReportStatus" AS ENUM ('DRAFT', 'SIGNED');

ALTER TABLE "client"
    ADD COLUMN "personalIdentityNumber" TEXT,
    ADD COLUMN "placingUnit" TEXT,
    ADD COLUMN "legalBasis" TEXT,
    ADD COLUMN "responsibleSocialWorkerName" TEXT,
    ADD COLUMN "responsibleSocialWorkerPhone" TEXT,
    ADD COLUMN "responsibleSocialWorkerEmail" TEXT;

ALTER TABLE "journalEntry"
    ADD COLUMN "contentFormat" "JournalContentFormat" NOT NULL DEFAULT 'LEGACY_NARRATIVE',
    ADD COLUMN "healthContent" TEXT,
    ADD COLUMN "educationOccupationContent" TEXT,
    ADD COLUMN "emotionsBehaviorContent" TEXT,
    ADD COLUMN "socialRelationsContent" TEXT,
    ADD COLUMN "dailyLivingIndependenceContent" TEXT,
    ADD COLUMN "otherContent" TEXT;

-- The original signing constraint required narrative content. Replace it with
-- an equivalent signer-state invariant that also accepts reviewed structured
-- content. Existing rows retain LEGACY_NARRATIVE through the additive default.
ALTER TABLE "journalEntry"
    DROP CONSTRAINT "journalEntry_signing_state_check",
    ADD CONSTRAINT "journalEntry_signing_state_check" CHECK (
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
            AND (
                (
                    "contentFormat" = 'LEGACY_NARRATIVE'
                    AND length(btrim("content")) > 0
                )
                OR
                (
                    "contentFormat" = 'STRUCTURED_V1'
                    AND (
                        btrim(COALESCE("healthContent", '')) <> ''
                        OR btrim(COALESCE("educationOccupationContent", '')) <> ''
                        OR btrim(COALESCE("emotionsBehaviorContent", '')) <> ''
                        OR btrim(COALESCE("socialRelationsContent", '')) <> ''
                        OR btrim(COALESCE("dailyLivingIndependenceContent", '')) <> ''
                        OR btrim(COALESCE("otherContent", '')) <> ''
                    )
                )
            )
        )
    );

ALTER TABLE "journalEntry"
    ADD CONSTRAINT "journalEntry_content_format_check" CHECK (
        (
            "contentFormat" = 'LEGACY_NARRATIVE'
            AND "healthContent" IS NULL
            AND "educationOccupationContent" IS NULL
            AND "emotionsBehaviorContent" IS NULL
            AND "socialRelationsContent" IS NULL
            AND "dailyLivingIndependenceContent" IS NULL
            AND "otherContent" IS NULL
        )
        OR
        (
            "contentFormat" = 'STRUCTURED_V1'
            AND "content" = ''
            AND (
                btrim(COALESCE("healthContent", '')) <> ''
                OR btrim(COALESCE("educationOccupationContent", '')) <> ''
                OR btrim(COALESCE("emotionsBehaviorContent", '')) <> ''
                OR btrim(COALESCE("socialRelationsContent", '')) <> ''
                OR btrim(COALESCE("dailyLivingIndependenceContent", '')) <> ''
                OR btrim(COALESCE("otherContent", '')) <> ''
            )
            AND (
                char_length(COALESCE("healthContent", ''))
                + char_length(COALESCE("educationOccupationContent", ''))
                + char_length(COALESCE("emotionsBehaviorContent", ''))
                + char_length(COALESCE("socialRelationsContent", ''))
                + char_length(COALESCE("dailyLivingIndependenceContent", ''))
                + char_length(COALESCE("otherContent", ''))
            ) <= 100000
        )
    );

-- Extend the existing database signing invariant to every structured field.
-- Existing signed rows are not updated by this migration.
CREATE OR REPLACE FUNCTION "preventSignedJournalEntryMutation"()
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
        OR NEW."contentFormat" IS DISTINCT FROM OLD."contentFormat"
        OR NEW."healthContent" IS DISTINCT FROM OLD."healthContent"
        OR NEW."educationOccupationContent" IS DISTINCT FROM OLD."educationOccupationContent"
        OR NEW."emotionsBehaviorContent" IS DISTINCT FROM OLD."emotionsBehaviorContent"
        OR NEW."socialRelationsContent" IS DISTINCT FROM OLD."socialRelationsContent"
        OR NEW."dailyLivingIndependenceContent" IS DISTINCT FROM OLD."dailyLivingIndependenceContent"
        OR NEW."otherContent" IS DISTINCT FROM OLD."otherContent"
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

CREATE TABLE "monthlyReport" (
    "id" UUID NOT NULL,
    "reference" VARCHAR(40) NOT NULL,
    "organisationId" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "calendarYear" INTEGER NOT NULL,
    "calendarMonth" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "replacesReportId" UUID,
    "status" "MonthlyReportStatus" NOT NULL DEFAULT 'DRAFT',
    "healthContent" TEXT,
    "educationOccupationContent" TEXT,
    "emotionsBehaviorContent" TEXT,
    "socialRelationsContent" TEXT,
    "dailyLivingIndependenceContent" TEXT,
    "otherContent" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "signedAt" TIMESTAMPTZ(3),
    "signerUserId" TEXT,
    "signerName" TEXT,
    "signerProfessionalTitle" TEXT,
    "signerRole" "UserRole",

    CONSTRAINT "monthlyReport_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "monthlyReport_reference_format_check" CHECK (
        "reference" ~ '^MRP-[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$'
    ),
    CONSTRAINT "monthlyReport_calendar_check" CHECK (
        "calendarYear" BETWEEN 1900 AND 9999
        AND "calendarMonth" BETWEEN 1 AND 12
    ),
    CONSTRAINT "monthlyReport_positive_revision_version_check" CHECK (
        "revision" >= 1 AND "version" >= 1
    ),
    CONSTRAINT "monthlyReport_signing_state_check" CHECK (
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
            AND "signerUserId" IS NOT NULL
            AND "signerName" IS NOT NULL
            AND "signerProfessionalTitle" IS NOT NULL
            AND "signerRole" IS NOT NULL
        )
    ),
    CONSTRAINT "monthlyReport_signed_content_check" CHECK (
        "status" <> 'SIGNED'
        OR (
            (
                btrim(COALESCE("healthContent", '')) <> ''
                OR btrim(COALESCE("educationOccupationContent", '')) <> ''
                OR btrim(COALESCE("emotionsBehaviorContent", '')) <> ''
                OR btrim(COALESCE("socialRelationsContent", '')) <> ''
                OR btrim(COALESCE("dailyLivingIndependenceContent", '')) <> ''
                OR btrim(COALESCE("otherContent", '')) <> ''
            )
            AND (
                char_length(COALESCE("healthContent", ''))
                + char_length(COALESCE("educationOccupationContent", ''))
                + char_length(COALESCE("emotionsBehaviorContent", ''))
                + char_length(COALESCE("socialRelationsContent", ''))
                + char_length(COALESCE("dailyLivingIndependenceContent", ''))
                + char_length(COALESCE("otherContent", ''))
            ) <= 100000
        )
    )
);

CREATE UNIQUE INDEX "monthlyReport_reference_key" ON "monthlyReport"("reference");
CREATE UNIQUE INDEX "monthlyReport_scope_id_key" ON "monthlyReport"("organisationId", "clientId", "calendarYear", "calendarMonth", "id");
CREATE UNIQUE INDEX "monthlyReport_scope_revision_key" ON "monthlyReport"("organisationId", "clientId", "calendarYear", "calendarMonth", "revision");
CREATE UNIQUE INDEX "monthlyReport_replacement_link_key" ON "monthlyReport"("organisationId", "clientId", "calendarYear", "calendarMonth", "replacesReportId");
CREATE UNIQUE INDEX "monthlyReport_one_root_per_month_key"
    ON "monthlyReport"("organisationId", "clientId", "calendarYear", "calendarMonth")
    WHERE "replacesReportId" IS NULL;
CREATE UNIQUE INDEX "monthlyReport_one_draft_per_month_key"
    ON "monthlyReport"("organisationId", "clientId", "calendarYear", "calendarMonth")
    WHERE "status" = 'DRAFT';
CREATE INDEX "monthlyReport_scope_status_revision_idx"
    ON "monthlyReport"("organisationId", "clientId", "calendarYear", "calendarMonth", "status", "revision");

ALTER TABLE "monthlyReport" ADD CONSTRAINT "monthlyReport_organisationId_fkey"
    FOREIGN KEY ("organisationId") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "monthlyReport" ADD CONSTRAINT "monthlyReport_scope_client_fkey"
    FOREIGN KEY ("organisationId", "clientId") REFERENCES "client"("organisationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "monthlyReport" ADD CONSTRAINT "monthlyReport_scope_creator_fkey"
    FOREIGN KEY ("organisationId", "createdByUserId") REFERENCES "user"("organisationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "monthlyReport" ADD CONSTRAINT "monthlyReport_scope_updater_fkey"
    FOREIGN KEY ("organisationId", "updatedByUserId") REFERENCES "user"("organisationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "monthlyReport" ADD CONSTRAINT "monthlyReport_scope_replacement_fkey"
    FOREIGN KEY ("organisationId", "clientId", "calendarYear", "calendarMonth", "replacesReportId")
    REFERENCES "monthlyReport"("organisationId", "clientId", "calendarYear", "calendarMonth", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "validateMonthlyReportIdentityAndReplacement"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    replaced_status "MonthlyReportStatus";
    replaced_revision INTEGER;
BEGIN
    IF TG_OP = 'UPDATE' AND (
        NEW."id" IS DISTINCT FROM OLD."id"
        OR NEW."reference" IS DISTINCT FROM OLD."reference"
        OR NEW."organisationId" IS DISTINCT FROM OLD."organisationId"
        OR NEW."clientId" IS DISTINCT FROM OLD."clientId"
        OR NEW."calendarYear" IS DISTINCT FROM OLD."calendarYear"
        OR NEW."calendarMonth" IS DISTINCT FROM OLD."calendarMonth"
        OR NEW."revision" IS DISTINCT FROM OLD."revision"
        OR NEW."replacesReportId" IS DISTINCT FROM OLD."replacesReportId"
        OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId"
        OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Monthly report identity is immutable.';
    END IF;

    IF NEW."replacesReportId" IS NULL THEN
        IF NEW."revision" <> 1 THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A root monthly report must have revision one.';
        END IF;
        RETURN NEW;
    END IF;

    SELECT "status", "revision"
      INTO replaced_status, replaced_revision
      FROM "monthlyReport"
     WHERE "organisationId" = NEW."organisationId"
       AND "clientId" = NEW."clientId"
       AND "calendarYear" = NEW."calendarYear"
       AND "calendarMonth" = NEW."calendarMonth"
       AND "id" = NEW."replacesReportId"
     FOR KEY SHARE;

    IF NOT FOUND OR replaced_status <> 'SIGNED' OR NEW."revision" <> replaced_revision + 1 THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A monthly report replacement must extend the signed lineage.';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "monthlyReport_validate_identity_and_replacement"
BEFORE INSERT OR UPDATE ON "monthlyReport"
FOR EACH ROW EXECUTE FUNCTION "validateMonthlyReportIdentityAndReplacement"();

CREATE FUNCTION "preventSignedMonthlyReportMutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW."status" = 'SIGNED' THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Monthly reports must be created as drafts.';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD."status" = 'SIGNED' THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Signed monthly reports are immutable.';
    END IF;

    IF TG_OP = 'UPDATE' AND NEW."status" = 'SIGNED' AND (
        OLD."status" <> 'DRAFT'
        OR NEW."id" IS DISTINCT FROM OLD."id"
        OR NEW."reference" IS DISTINCT FROM OLD."reference"
        OR NEW."organisationId" IS DISTINCT FROM OLD."organisationId"
        OR NEW."clientId" IS DISTINCT FROM OLD."clientId"
        OR NEW."calendarYear" IS DISTINCT FROM OLD."calendarYear"
        OR NEW."calendarMonth" IS DISTINCT FROM OLD."calendarMonth"
        OR NEW."revision" IS DISTINCT FROM OLD."revision"
        OR NEW."replacesReportId" IS DISTINCT FROM OLD."replacesReportId"
        OR NEW."healthContent" IS DISTINCT FROM OLD."healthContent"
        OR NEW."educationOccupationContent" IS DISTINCT FROM OLD."educationOccupationContent"
        OR NEW."emotionsBehaviorContent" IS DISTINCT FROM OLD."emotionsBehaviorContent"
        OR NEW."socialRelationsContent" IS DISTINCT FROM OLD."socialRelationsContent"
        OR NEW."dailyLivingIndependenceContent" IS DISTINCT FROM OLD."dailyLivingIndependenceContent"
        OR NEW."otherContent" IS DISTINCT FROM OLD."otherContent"
        OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId"
        OR NEW."updatedByUserId" IS DISTINCT FROM OLD."updatedByUserId"
        OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
        OR NEW."version" <> OLD."version" + 1
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Signing must preserve the reviewed monthly report draft.';
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER "monthlyReport_prevent_signed_update_delete"
BEFORE INSERT OR UPDATE OR DELETE ON "monthlyReport"
FOR EACH ROW EXECUTE FUNCTION "preventSignedMonthlyReportMutation"();

CREATE FUNCTION "preventMonthlyReportTruncate"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Monthly reports cannot be truncated.';
END;
$$;

CREATE TRIGGER "monthlyReport_prevent_truncate"
BEFORE TRUNCATE ON "monthlyReport"
FOR EACH STATEMENT EXECUTE FUNCTION "preventMonthlyReportTruncate"();

CREATE FUNCTION "enforceSignedMonthlyReportAuditEvidence"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW."status" <> 'SIGNED' THEN
        RETURN NEW;
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM "auditOperation" operation
          JOIN "auditEvent" event ON event."operationId" = operation."id"
         WHERE operation."organisationId" = NEW."organisationId"
           AND operation."actorKind" = 'USER'
           AND operation."actorUserId" = NEW."signerUserId"
           AND operation."action" = 'MONTHLY_REPORT_SIGNED'
           AND operation."targetType" = 'MONTHLY_REPORT'
           AND operation."targetId" = NEW."id"::text
           AND event."type" = 'OUTCOME'
           AND event."result" = 'SUCCEEDED'
           AND event."resolvedTargetId" = NEW."id"::text
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Signed monthly reports require successful audit evidence.';
    END IF;

    RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER "monthlyReport_require_signing_audit"
AFTER INSERT OR UPDATE ON "monthlyReport"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "enforceSignedMonthlyReportAuditEvidence"();
