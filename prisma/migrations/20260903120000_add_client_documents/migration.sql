-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DocumentScanResult" AS ENUM ('CLEAN');

-- CreateTable
CREATE TABLE "document" (
    "id" UUID NOT NULL,
    "organisationId" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,
    "archivedAt" TIMESTAMPTZ(3),
    "archivedByUserId" TEXT,

    CONSTRAINT "document_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "document_archive_state_check" CHECK (
        ("status" = 'ACTIVE' AND "archivedAt" IS NULL AND "archivedByUserId" IS NULL)
        OR
        ("status" = 'ARCHIVED' AND "archivedAt" IS NOT NULL AND "archivedByUserId" IS NOT NULL)
    )
);

-- CreateTable
CREATE TABLE "documentVersion" (
    "id" UUID NOT NULL,
    "organisationId" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "originalFilename" VARCHAR(255) NOT NULL,
    "displayFilename" VARCHAR(180) NOT NULL,
    "mediaType" VARCHAR(64) NOT NULL,
    "approvedExtension" VARCHAR(8) NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "storageKey" VARCHAR(64) NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "uploadedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedByUserId" TEXT NOT NULL,
    "malwareScanResult" "DocumentScanResult" NOT NULL DEFAULT 'CLEAN',
    "malwareScanner" VARCHAR(64) NOT NULL,
    "malwareScannerVersion" VARCHAR(64) NOT NULL,
    "malwareSignatureVersion" VARCHAR(64) NOT NULL,
    "malwareSignatureDate" TIMESTAMPTZ(3) NOT NULL,
    "malwareScannedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "documentVersion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "documentVersion_positive_version_check" CHECK ("versionNumber" > 0),
    CONSTRAINT "documentVersion_positive_size_check" CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 26214400),
    CONSTRAINT "documentVersion_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "documentVersion_storage_key_check" CHECK ("storageKey" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "documentVersion_media_type_check" CHECK ("mediaType" IN ('application/pdf', 'image/jpeg', 'image/png', 'text/plain')),
    CONSTRAINT "documentVersion_extension_check" CHECK ("approvedExtension" IN ('pdf', 'jpg', 'jpeg', 'png', 'txt'))
);

-- CreateIndex
CREATE UNIQUE INDEX "document_organisationId_clientId_id_key" ON "document"("organisationId", "clientId", "id");
CREATE INDEX "document_scope_status_created_idx" ON "document"("organisationId", "clientId", "status", "createdAt", "id");
CREATE UNIQUE INDEX "documentVersion_storageKey_key" ON "documentVersion"("storageKey");
CREATE UNIQUE INDEX "documentVersion_documentId_versionNumber_key" ON "documentVersion"("documentId", "versionNumber");
CREATE UNIQUE INDEX "documentVersion_organisationId_clientId_id_key" ON "documentVersion"("organisationId", "clientId", "id");
CREATE INDEX "documentVersion_scope_document_version_idx" ON "documentVersion"("organisationId", "clientId", "documentId", "versionNumber");

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document" ADD CONSTRAINT "document_scope_client_fkey" FOREIGN KEY ("organisationId", "clientId") REFERENCES "client"("organisationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document" ADD CONSTRAINT "document_scope_creator_fkey" FOREIGN KEY ("organisationId", "createdByUserId") REFERENCES "user"("organisationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document" ADD CONSTRAINT "document_scope_archive_actor_fkey" FOREIGN KEY ("organisationId", "archivedByUserId") REFERENCES "user"("organisationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documentVersion" ADD CONSTRAINT "documentVersion_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documentVersion" ADD CONSTRAINT "documentVersion_scope_client_fkey" FOREIGN KEY ("organisationId", "clientId") REFERENCES "client"("organisationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documentVersion" ADD CONSTRAINT "documentVersion_scope_document_fkey" FOREIGN KEY ("organisationId", "clientId", "documentId") REFERENCES "document"("organisationId", "clientId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documentVersion" ADD CONSTRAINT "documentVersion_scope_uploader_fkey" FOREIGN KEY ("organisationId", "uploadedByUserId") REFERENCES "user"("organisationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Accepted versions are immutable historical evidence. The application may add
-- another version, but ordinary roles cannot update, delete, or truncate one.
CREATE FUNCTION kaul_reject_document_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'document versions are immutable';
END;
$$;

CREATE TRIGGER "documentVersion_reject_update"
BEFORE UPDATE ON "documentVersion"
FOR EACH ROW EXECUTE FUNCTION kaul_reject_document_version_mutation();

CREATE TRIGGER "documentVersion_reject_delete"
BEFORE DELETE ON "documentVersion"
FOR EACH ROW EXECUTE FUNCTION kaul_reject_document_version_mutation();

CREATE TRIGGER "documentVersion_reject_truncate"
BEFORE TRUNCATE ON "documentVersion"
FOR EACH STATEMENT EXECUTE FUNCTION kaul_reject_document_version_mutation();
