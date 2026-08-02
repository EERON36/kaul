import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { UserRole } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { auth } from "./auth";

const organisationIds = new Set<string>();
const rateLimitKeys = new Set<string>();

function fictionalId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

async function createFictionalOrganisation() {
  const id = fictionalId("org");
  organisationIds.add(id);

  return prisma.organisation.create({
    data: {
      id,
      name: `Fiktiv organisation ${id}`,
    },
  });
}

function fictionalUserData(organisationId: string, email: string) {
  return {
    id: fictionalId("user"),
    name: "Fiktiv Testperson",
    email,
    organisationId,
    professionalTitle: "Fiktiv behandlare",
  };
}

afterEach(async () => {
  const ids = [...organisationIds];
  const keys = [...rateLimitKeys];

  if (ids.length > 0) {
    await prisma.user.deleteMany({
      where: { organisationId: { in: ids } },
    });
    await prisma.organisation.deleteMany({ where: { id: { in: ids } } });
  }

  if (keys.length > 0) {
    await prisma.rateLimit.deleteMany({ where: { key: { in: keys } } });
  }

  organisationIds.clear();
  rateLimitKeys.clear();
});

describe("authentication foundation database schema", () => {
  it("exposes exactly the two canonical PostgreSQL role values", async () => {
    const rows = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'UserRole'
      ORDER BY e.enumsortorder
    `;

    expect(rows.map(({ enumlabel }) => enumlabel)).toEqual([
      "ADMINISTRATOR",
      "STAFF_MEMBER",
    ]);
  });

  it("rejects unsupported role values", async () => {
    const organisation = await createFictionalOrganisation();
    const user = fictionalUserData(
      organisation.id,
      `${fictionalId("unsupported-role")}@example.test`,
    );

    await expect(
      prisma.$executeRaw`
        INSERT INTO "user" (
          "id", "name", "email", "updatedAt", "role",
          "organisationId", "professionalTitle"
        )
        VALUES (
          ${user.id}, ${user.name}, ${user.email}, NOW(),
          ${"OWNER"}::"UserRole", ${organisation.id},
          ${user.professionalTitle}
        )
      `,
    ).rejects.toThrow();
  });

  it("requires organisationId and professionalTitle", async () => {
    const organisation = await createFictionalOrganisation();
    const missingOrganisationId = fictionalUserData(
      organisation.id,
      `${fictionalId("missing-org")}@example.test`,
    );
    const missingProfessionalTitle = fictionalUserData(
      organisation.id,
      `${fictionalId("missing-title")}@example.test`,
    );

    await expect(
      prisma.$executeRaw`
        INSERT INTO "user" (
          "id", "name", "email", "updatedAt", "professionalTitle"
        )
        VALUES (
          ${missingOrganisationId.id}, ${missingOrganisationId.name},
          ${missingOrganisationId.email}, NOW(),
          ${missingOrganisationId.professionalTitle}
        )
      `,
    ).rejects.toThrow();

    await expect(
      prisma.$executeRaw`
        INSERT INTO "user" (
          "id", "name", "email", "updatedAt", "organisationId"
        )
        VALUES (
          ${missingProfessionalTitle.id}, ${missingProfessionalTitle.name},
          ${missingProfessionalTitle.email}, NOW(), ${organisation.id}
        )
      `,
    ).rejects.toThrow();
  });

  it("enforces Organisation ownership and deletion behavior", async () => {
    const organisation = await createFictionalOrganisation();
    const invalidUser = fictionalUserData(
      fictionalId("missing-org"),
      `${fictionalId("invalid-fk")}@example.test`,
    );

    await expect(prisma.user.create({ data: invalidUser })).rejects.toThrow();

    const user = await prisma.user.create({
      data: fictionalUserData(
        organisation.id,
        `${fictionalId("restrict")}@example.test`,
      ),
    });

    await expect(
      prisma.organisation.delete({ where: { id: organisation.id } }),
    ).rejects.toThrow();

    await prisma.user.delete({ where: { id: user.id } });
    await expect(
      prisma.organisation.delete({ where: { id: organisation.id } }),
    ).resolves.toMatchObject({ id: organisation.id });
  });

  it("cascades Session and Account deletion with their User", async () => {
    const organisation = await createFictionalOrganisation();
    const user = await prisma.user.create({
      data: fictionalUserData(
        organisation.id,
        `${fictionalId("cascade")}@example.test`,
      ),
    });
    const sessionId = fictionalId("session");
    const accountId = fictionalId("account");

    await prisma.session.create({
      data: {
        id: sessionId,
        token: fictionalId("token"),
        expiresAt: new Date(Date.now() + 60_000),
        userId: user.id,
      },
    });
    await prisma.account.create({
      data: {
        id: accountId,
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
      },
    });

    await prisma.user.delete({ where: { id: user.id } });

    await expect(
      prisma.session.findUnique({ where: { id: sessionId } }),
    ).resolves.toBeNull();
    await expect(
      prisma.account.findUnique({ where: { id: accountId } }),
    ).resolves.toBeNull();
  });

  it("enforces unique email, session token, and rate-limit key values", async () => {
    const organisation = await createFictionalOrganisation();
    const email = `${fictionalId("unique-email")}@example.test`;
    const firstUser = await prisma.user.create({
      data: fictionalUserData(organisation.id, email),
    });

    await expect(
      prisma.user.create({
        data: fictionalUserData(organisation.id, email),
      }),
    ).rejects.toThrow();

    const token = fictionalId("unique-token");
    await prisma.session.create({
      data: {
        id: fictionalId("session"),
        token,
        expiresAt: new Date(Date.now() + 60_000),
        userId: firstUser.id,
      },
    });
    await expect(
      prisma.session.create({
        data: {
          id: fictionalId("session"),
          token,
          expiresAt: new Date(Date.now() + 60_000),
          userId: firstUser.id,
        },
      }),
    ).rejects.toThrow();

    const key = fictionalId("rate-limit");
    rateLimitKeys.add(key);
    await prisma.rateLimit.create({
      data: {
        id: fictionalId("rate"),
        key,
        count: 1,
        lastRequest: BigInt(1),
      },
    });
    await expect(
      prisma.rateLimit.create({
        data: {
          id: fictionalId("rate"),
          key,
          count: 1,
          lastRequest: BigInt(1),
        },
      }),
    ).rejects.toThrow();
  });
});

describe("Better Auth database compatibility", () => {
  it("persists both Kaul roles and credential accounts through the server API", async () => {
    const organisation = await createFictionalOrganisation();

    for (const role of [UserRole.STAFF_MEMBER, UserRole.ADMINISTRATOR]) {
      const expiresAt = new Date(Date.now() + 30 * 60_000);
      const email = `${fictionalId(role.toLowerCase())}@example.test`;

      // Headerless Admin API calls are privileged. This is test-only; production
      // account creation must use a validated Kaul-owned server wrapper.
      const result = await auth.api.createUser({
        body: {
          name: `Fiktiv ${role}`,
          email,
          password: "Fictional-Integration-Password-2026!",
          role,
          data: {
            organisationId: organisation.id,
            professionalTitle: "Fiktiv behandlare",
            mustChangePassword: true,
            temporaryCredentialExpiresAt: expiresAt,
          },
        },
      });

      const persistedUser = await prisma.user.findUniqueOrThrow({
        where: { id: result.user.id },
      });
      const credentialAccounts = await prisma.account.count({
        where: {
          userId: persistedUser.id,
          providerId: "credential",
          password: { not: null },
        },
      });

      expect(persistedUser).toMatchObject({
        email,
        organisationId: organisation.id,
        professionalTitle: "Fiktiv behandlare",
        role,
        mustChangePassword: true,
      });
      expect(persistedUser.temporaryCredentialExpiresAt).toEqual(expiresAt);
      expect(credentialAccounts).toBe(1);
    }
  });
});
