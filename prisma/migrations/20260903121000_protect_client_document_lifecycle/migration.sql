-- A Document may make exactly one terminal ACTIVE -> ARCHIVED transition.
-- Identity, content metadata, creator evidence, and archived history cannot be
-- edited directly or removed after creation.
CREATE FUNCTION kaul_protect_document_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'documents cannot be deleted';
  END IF;

  IF OLD."status" <> 'ACTIVE'
    OR NEW."status" <> 'ARCHIVED'
    OR NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."organisationId" IS DISTINCT FROM OLD."organisationId"
    OR NEW."clientId" IS DISTINCT FROM OLD."clientId"
    OR NEW."title" IS DISTINCT FROM OLD."title"
    OR NEW."description" IS DISTINCT FROM OLD."description"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId"
    OR NEW."archivedAt" IS NULL
    OR NEW."archivedByUserId" IS NULL
  THEN
    RAISE EXCEPTION 'document lifecycle is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "document_protect_update"
BEFORE UPDATE ON "document"
FOR EACH ROW EXECUTE FUNCTION kaul_protect_document_lifecycle();

CREATE TRIGGER "document_reject_delete"
BEFORE DELETE ON "document"
FOR EACH ROW EXECUTE FUNCTION kaul_protect_document_lifecycle();

CREATE TRIGGER "document_reject_truncate"
BEFORE TRUNCATE ON "document"
FOR EACH STATEMENT EXECUTE FUNCTION kaul_reject_document_version_mutation();

-- An update lock serialises a direct insert with the terminal archive update.
-- New versions are never accepted for an already archived Document.
CREATE FUNCTION kaul_require_active_document_for_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_status "DocumentStatus";
BEGIN
  SELECT "status"
    INTO parent_status
    FROM "document"
   WHERE "id" = NEW."documentId"
     AND "organisationId" = NEW."organisationId"
     AND "clientId" = NEW."clientId"
   FOR UPDATE;

  IF parent_status IS DISTINCT FROM 'ACTIVE'::"DocumentStatus" THEN
    RAISE EXCEPTION 'document versions require an active document';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "documentVersion_require_active_document"
BEFORE INSERT ON "documentVersion"
FOR EACH ROW EXECUTE FUNCTION kaul_require_active_document_for_version();
