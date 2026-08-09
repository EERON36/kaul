-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('INACTIVE', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AssignmentResponsibility" AS ENUM ('PRIMARY', 'SECONDARY');

-- CreateTable
CREATE TABLE "client" (
    "id" UUID NOT NULL,
    "organisationId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "personIdentifier" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" "ClientStatus" NOT NULL DEFAULT 'INACTIVE',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "client_archive_status_check" CHECK (
        ("status" = 'ARCHIVED' AND "archivedAt" IS NOT NULL)
        OR
        ("status" IN ('INACTIVE', 'ACTIVE') AND "archivedAt" IS NULL)
    )
);

-- CreateTable
CREATE TABLE "assignment" (
    "id" UUID NOT NULL,
    "organisationId" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "staffUserId" TEXT NOT NULL,
    "responsibility" "AssignmentResponsibility" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "assignment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assignment_end_after_start_check" CHECK (
        "endedAt" IS NULL OR "endedAt" >= "startedAt"
    )
);

-- CreateIndex
CREATE INDEX "client_organisationId_status_lastName_firstName_personIdent_idx" ON "client"("organisationId", "status", "lastName", "firstName", "personIdentifier");

-- CreateIndex
CREATE UNIQUE INDEX "client_organisationId_personIdentifier_key" ON "client"("organisationId", "personIdentifier");

-- CreateIndex
CREATE UNIQUE INDEX "client_organisationId_id_key" ON "client"("organisationId", "id");

-- CreateIndex
CREATE INDEX "assignment_organisationId_clientId_endedAt_idx" ON "assignment"("organisationId", "clientId", "endedAt");

-- CreateIndex
CREATE INDEX "assignment_organisationId_staffUserId_endedAt_idx" ON "assignment"("organisationId", "staffUserId", "endedAt");

-- One Client can have at most one active PRIMARY assignment.
CREATE UNIQUE INDEX "assignment_one_active_primary_per_client_key"
ON "assignment"("organisationId", "clientId")
WHERE "endedAt" IS NULL AND "responsibility" = 'PRIMARY';

-- One Staff Member can have at most one active responsibility per Client.
CREATE UNIQUE INDEX "assignment_one_active_staff_per_client_key"
ON "assignment"("organisationId", "clientId", "staffUserId")
WHERE "endedAt" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "user_organisationId_id_key" ON "user"("organisationId", "id");

-- AddForeignKey
ALTER TABLE "client" ADD CONSTRAINT "client_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_organisationId_clientId_fkey" FOREIGN KEY ("organisationId", "clientId") REFERENCES "client"("organisationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_organisationId_staffUserId_fkey" FOREIGN KEY ("organisationId", "staffUserId") REFERENCES "user"("organisationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_organisationId_createdByUserId_fkey" FOREIGN KEY ("organisationId", "createdByUserId") REFERENCES "user"("organisationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
