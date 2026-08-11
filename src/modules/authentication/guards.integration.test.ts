import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

const requestContext = vi.hoisted(() => ({ headers: new Headers() }));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => requestContext.headers),
}));

import { UserRole } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { getTestEnvironment } from "../../test/test-environment";
import { auth } from "./auth";
import { AuthenticationGuardError, requireApplicationUser } from "./guards";

const organisationIds = new Set<string>();
const userEmails = new Set<string>();
const testOrigin = getTestEnvironment().origin;

function fictionalId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

afterEach(async () => {
  if (userEmails.size > 0) {
    await prisma.user.deleteMany({
      where: { email: { in: [...userEmails] } },
    });
  }

  if (organisationIds.size > 0) {
    await prisma.organisation.deleteMany({
      where: { id: { in: [...organisationIds] } },
    });
  }

  userEmails.clear();
  organisationIds.clear();
  requestContext.headers = new Headers();
});

async function createOrganisation(name: string) {
  const id = fictionalId("org");
  organisationIds.add(id);

  return prisma.organisation.create({ data: { id, name } });
}

describe("authentication guards with PostgreSQL sessions", () => {
  it("revalidates role, organisation, profile and account activity on every call", async () => {
    const firstOrganisation = await createOrganisation(
      "Fiktiv första organisation",
    );
    const secondOrganisation = await createOrganisation(
      "Fiktiv andra organisation",
    );
    const email = `${fictionalId("guard-user")}@example.test`;
    userEmails.add(email);

    // Headerless Admin API calls are privileged. This is test-only; production
    // account creation must use a validated Kaul-owned server wrapper.
    await auth.api.createUser({
      body: {
        name: "Fiktiv Guardperson",
        email,
        password: "Fictional-Guard-Password-2026!",
        role: UserRole.STAFF_MEMBER,
        data: {
          organisationId: firstOrganisation.id,
          professionalTitle: "Fiktiv behandlare",
          mustChangePassword: false,
          temporaryCredentialExpiresAt: null,
        },
      },
    });

    const signInResponse = await auth.api.signInEmail({
      body: {
        email,
        password: "Fictional-Guard-Password-2026!",
      },
      headers: new Headers({
        origin: testOrigin,
        "x-real-ip": "192.0.2.71",
      }),
      asResponse: true,
    });

    expect(signInResponse.status).toBe(200);
    const cookieHeader = signInResponse.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";", 1)[0])
      .join("; ");
    requestContext.headers = new Headers({
      cookie: cookieHeader,
      origin: testOrigin,
      "x-real-ip": "192.0.2.71",
    });

    const staffContext = await requireApplicationUser();
    expect(staffContext).toMatchObject({
      role: "STAFF_MEMBER",
      organisationId: firstOrganisation.id,
      organisationName: firstOrganisation.name,
      professionalTitle: "Fiktiv behandlare",
    });

    await prisma.user.update({
      where: { id: staffContext.userId },
      data: {
        role: UserRole.ADMINISTRATOR,
        organisationId: secondOrganisation.id,
        professionalTitle: "Fiktiv verksamhetsansvarig",
      },
    });

    await expect(requireApplicationUser()).resolves.toMatchObject({
      userId: staffContext.userId,
      role: "ADMINISTRATOR",
      organisationId: secondOrganisation.id,
      professionalTitle: "Fiktiv verksamhetsansvarig",
    });

    await prisma.user.update({
      where: { id: staffContext.userId },
      data: { banned: true },
    });
    await expect(requireApplicationUser()).rejects.toMatchObject({
      code: "ACCOUNT_INACTIVE",
    });

    await prisma.user.update({
      where: { id: staffContext.userId },
      data: { banned: false },
    });
    await prisma.session.deleteMany({ where: { userId: staffContext.userId } });
    await expect(requireApplicationUser()).rejects.toBeInstanceOf(
      AuthenticationGuardError,
    );
    await expect(requireApplicationUser()).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });

    expect(Object.keys(staffContext).sort()).toEqual(
      [
        "credentialState",
        "email",
        "mustChangePassword",
        "name",
        "organisationId",
        "organisationName",
        "professionalTitle",
        "role",
        "userId",
      ].sort(),
    );
  });
});
