import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { UserRole } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { auth } from "../authentication/auth";
import {
  bootstrapInitialAdministrator,
  InitialAdministratorBootstrapError,
} from "./initial-administrator";
import { bootstrapInitialAdministratorForTest } from "./initial-administrator.test-support";

const fictionalMetadata = {
  organisationName: "Fiktiva Omsorgen",
  administratorName: "Fiktiv Administratör",
  administratorEmail: "Initial.Admin@Example.Test",
  professionalTitle: "Fiktiv verksamhetsansvarig",
};

async function clearAuthenticationFoundation(): Promise<void> {
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organisation.deleteMany();
  await prisma.verification.deleteMany();
  await prisma.rateLimit.deleteMany();
}

async function foundationCounts() {
  const [organisations, users, accounts, administrators] = await Promise.all([
    prisma.organisation.count(),
    prisma.user.count(),
    prisma.account.count(),
    prisma.user.count({ where: { role: UserRole.ADMINISTRATOR } }),
  ]);

  return { organisations, users, accounts, administrators };
}

beforeEach(clearAuthenticationFoundation);
afterEach(clearAuthenticationFoundation);

describe("initial Administrator bootstrap with PostgreSQL", () => {
  it("creates and authenticates exactly one constrained initial Administrator", async () => {
    const creationTime = new Date("2030-01-02T03:04:05.000Z");
    const result = await bootstrapInitialAdministratorForTest(
      fictionalMetadata,
      {
        currentTime: () => creationTime,
      },
    );

    expect(await foundationCounts()).toEqual({
      organisations: 1,
      users: 1,
      accounts: 1,
      administrators: 1,
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: result.administratorEmail },
      select: {
        name: true,
        email: true,
        role: true,
        organisationId: true,
        professionalTitle: true,
        mustChangePassword: true,
        temporaryCredentialExpiresAt: true,
      },
    });
    const credentialAccountCount = await prisma.account.count({
      where: {
        user: { email: result.administratorEmail },
        providerId: "credential",
        password: { not: null },
      },
    });

    expect(user).toMatchObject({
      name: fictionalMetadata.administratorName,
      email: "initial.admin@example.test",
      role: UserRole.ADMINISTRATOR,
      professionalTitle: fictionalMetadata.professionalTitle,
      mustChangePassword: true,
    });
    expect(user.organisationId).not.toBe("");
    expect(user.temporaryCredentialExpiresAt).toEqual(
      new Date("2030-01-03T03:04:05.000Z"),
    );
    expect(credentialAccountCount).toBe(1);

    const signIn = await auth.api.signInEmail({
      body: {
        email: result.administratorEmail,
        password: result.temporaryCredential,
      },
      headers: new Headers({
        origin: "http://localhost:3000",
        "x-real-ip": "192.0.2.81",
      }),
      asResponse: true,
    });

    expect(signIn.status).toBe(200);

    await expect(
      bootstrapInitialAdministrator({
        ...fictionalMetadata,
        administratorEmail: "second.admin@example.test",
      }),
    ).rejects.toMatchObject({ code: "INSTALLATION_NOT_EMPTY" });
    expect(await foundationCounts()).toEqual({
      organisations: 1,
      users: 1,
      accounts: 1,
      administrators: 1,
    });
  });

  it("refuses an existing Organisation with no writes", async () => {
    await prisma.organisation.create({
      data: { id: randomUUID(), name: "Befintlig fiktiv organisation" },
    });

    await expect(
      bootstrapInitialAdministrator(fictionalMetadata),
    ).rejects.toBeInstanceOf(InitialAdministratorBootstrapError);
    expect(await foundationCounts()).toEqual({
      organisations: 1,
      users: 0,
      accounts: 0,
      administrators: 0,
    });
  });

  it("refuses existing User and Organisation state with no writes", async () => {
    const organisationId = randomUUID();
    await prisma.organisation.create({
      data: { id: organisationId, name: "Befintlig fiktiv organisation" },
    });
    await prisma.user.create({
      data: {
        id: randomUUID(),
        name: "Befintlig fiktiv användare",
        email: "existing.user@example.test",
        organisationId,
        professionalTitle: "Fiktiv behandlare",
      },
    });

    await expect(
      bootstrapInitialAdministrator(fictionalMetadata),
    ).rejects.toMatchObject({ code: "INSTALLATION_NOT_EMPTY" });
    expect(await foundationCounts()).toEqual({
      organisations: 1,
      users: 1,
      accounts: 0,
      administrators: 0,
    });
  });

  it("creates no records when metadata is invalid", async () => {
    const invalidMetadata = {
      ...fictionalMetadata,
      role: UserRole.STAFF_MEMBER,
    };

    await expect(
      bootstrapInitialAdministrator(invalidMetadata),
    ).rejects.toThrow();

    expect(await foundationCounts()).toEqual({
      organisations: 0,
      users: 0,
      accounts: 0,
      administrators: 0,
    });
  });

  it("rolls back Organisation, User, and Account after Better Auth succeeds", async () => {
    await expect(
      bootstrapInitialAdministratorForTest(fictionalMetadata, {
        afterAuthenticationCreate: () => {
          throw new Error("Deliberate pre-commit integration failure");
        },
      }),
    ).rejects.toThrow("Deliberate pre-commit integration failure");

    expect(await foundationCounts()).toEqual({
      organisations: 0,
      users: 0,
      accounts: 0,
      administrators: 0,
    });
  });

  it("serializes concurrent attempts so exactly one succeeds", async () => {
    let waitingOperations = 0;
    let releaseOperations: (() => void) | undefined;
    const bothReady = new Promise<void>((resolve) => {
      releaseOperations = resolve;
    });
    const waitForBothPreflights = async () => {
      waitingOperations += 1;

      if (waitingOperations === 2) {
        releaseOperations?.();
      }

      await bothReady;
    };

    const attempts = await Promise.allSettled([
      bootstrapInitialAdministratorForTest(fictionalMetadata, {
        beforeTransaction: waitForBothPreflights,
      }),
      bootstrapInitialAdministratorForTest(
        {
          ...fictionalMetadata,
          administratorEmail: "concurrent.admin@example.test",
        },
        { beforeTransaction: waitForBothPreflights },
      ),
    ]);

    expect(
      attempts.filter(({ status }) => status === "fulfilled"),
    ).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(
      1,
    );
    expect(await foundationCounts()).toEqual({
      organisations: 1,
      users: 1,
      accounts: 1,
      administrators: 1,
    });
  });
});
