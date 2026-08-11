import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { UserRole } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { getTestEnvironment } from "../../test/test-environment";
import {
  createUserAuditIntent,
  generateAuditOperationId,
} from "../audit/audit";
import { auth, createAuthentication } from "../authentication/auth";
import type { AdministratorUser } from "./authorization";
import { resetStaffPasswordForTest } from "./staff-password-reset.test-support";

const administratorPassword = "Fictional administrator password reset 2032";
const staffPassword = "Fictional chosen staff password before reset 2032";
const temporaryPassword = "Fictional temporary staff password reset 2032";
const replacementPassword = "Fictional replacement staff password 2032";
const currentTime = new Date("2032-02-03T04:05:06.000Z");
const testOrigin = getTestEnvironment().origin;

type Fixture = Readonly<{
  actor: AdministratorUser;
  headers: Headers;
}>;

async function clearFixtures(): Promise<void> {
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organisation.deleteMany();
  await prisma.verification.deleteMany();
  await prisma.rateLimit.deleteMany();
}

function cookiesFrom(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";", 1)[0])
    .join("; ");
}

function signInHeaders(ipAddress: string): Headers {
  return new Headers({
    origin: testOrigin,
    "x-real-ip": ipAddress,
  });
}

async function signIn(
  email: string,
  password: string,
  ipAddress: string,
): Promise<Response> {
  return auth.api.signInEmail({
    body: { email, password },
    headers: signInHeaders(ipAddress),
    asResponse: true,
  });
}

async function createAdministratorFixture(): Promise<Fixture> {
  const organisationId = randomUUID();
  await prisma.organisation.create({
    data: { id: organisationId, name: "Fiktiva Resetorganisationen" },
  });
  const administrator = await createAuthentication(prisma).api.createUser({
    body: {
      name: "Fiktiv Administratör",
      email: "reset.administrator@example.test",
      password: administratorPassword,
      role: UserRole.ADMINISTRATOR,
      data: {
        organisationId,
        professionalTitle: "Fiktiv verksamhetsansvarig",
        mustChangePassword: false,
        temporaryCredentialExpiresAt: null,
      },
    },
  });
  const administratorSignIn = await signIn(
    "reset.administrator@example.test",
    administratorPassword,
    "192.0.2.181",
  );

  return {
    actor: {
      userId: administrator.user.id,
      name: "Fiktiv Administratör",
      email: "reset.administrator@example.test",
      role: "ADMINISTRATOR",
      organisationId,
      organisationName: "Fiktiva Resetorganisationen",
      professionalTitle: "Fiktiv verksamhetsansvarig",
      mustChangePassword: false,
      credentialState: "APPLICATION_ALLOWED",
    },
    headers: new Headers({
      origin: testOrigin,
      cookie: cookiesFrom(administratorSignIn),
      "x-real-ip": "192.0.2.181",
    }),
  };
}

async function createStaff(
  fixture: Fixture,
  options?: Readonly<{
    email?: string;
    banned?: boolean | null;
    mustChangePassword?: boolean;
    temporaryCredentialExpiresAt?: Date | null;
  }>,
) {
  const email = options?.email ?? "reset.staff@example.test";
  const staff = await createAuthentication(prisma).api.createUser({
    body: {
      name: "Fiktiv Resetmedarbetare",
      email,
      password: staffPassword,
      role: UserRole.STAFF_MEMBER,
      data: {
        organisationId: fixture.actor.organisationId,
        professionalTitle: "Fiktiv behandlare",
        mustChangePassword: options?.mustChangePassword ?? false,
        temporaryCredentialExpiresAt:
          options?.temporaryCredentialExpiresAt ?? null,
      },
    },
  });

  if (options?.banned !== undefined) {
    await prisma.user.update({
      where: { id: staff.user.id },
      data: {
        banned: options.banned,
        banReason: options.banned === true ? "Fiktiv inaktivering" : null,
      },
    });
  }

  return { id: staff.user.id, email };
}

function resetInput(targetUserId: string) {
  return { operationId: generateAuditOperationId(), targetUserId };
}

beforeEach(clearFixtures);
afterEach(clearFixtures);

describe("Administrator-assisted Staff password reset with PostgreSQL", () => {
  it("changes the password, forces change, revokes sessions, and audits success atomically", async () => {
    const fixture = await createAdministratorFixture();
    const staff = await createStaff(fixture);
    await signIn(staff.email, staffPassword, "192.0.2.182");
    await signIn(staff.email, staffPassword, "192.0.2.183");
    expect(await prisma.session.count({ where: { userId: staff.id } })).toBe(2);
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: staff.id },
    });
    const input = resetInput(staff.id);

    const result = await resetStaffPasswordForTest(
      input,
      fixture.actor,
      fixture.headers,
      {
        currentTime: () => currentTime,
        generateCredential: () => temporaryPassword,
      },
    );

    expect(result).toEqual({
      temporaryCredential: temporaryPassword,
      temporaryCredentialExpiresAt: new Date("2032-02-04T04:05:06.000Z"),
    });
    await expect(
      prisma.user.findUniqueOrThrow({ where: { id: staff.id } }),
    ).resolves.toMatchObject({
      name: before.name,
      email: before.email,
      organisationId: before.organisationId,
      professionalTitle: before.professionalTitle,
      role: before.role,
      banned: before.banned,
      mustChangePassword: true,
      temporaryCredentialExpiresAt: new Date("2032-02-04T04:05:06.000Z"),
    });
    expect(await prisma.session.count({ where: { userId: staff.id } })).toBe(0);
    expect(
      await signIn(staff.email, staffPassword, "192.0.2.184"),
    ).toHaveProperty("status", 401);
    expect(
      await signIn(staff.email, temporaryPassword, "192.0.2.185"),
    ).toHaveProperty("status", 200);

    await expect(
      prisma.auditOperation.findUniqueOrThrow({
        where: { id: input.operationId },
      }),
    ).resolves.toMatchObject({
      action: "PASSWORD_RESET_BY_ADMIN",
      targetId: staff.id,
    });
    await expect(
      prisma.auditEvent.findUniqueOrThrow({
        where: {
          operationId_type: {
            operationId: input.operationId,
            type: "OUTCOME",
          },
        },
      }),
    ).resolves.toMatchObject({
      result: "SUCCEEDED",
      resolvedTargetId: staff.id,
    });
    expect(
      await prisma.auditOperation.count({
        where: { action: "USER_SESSIONS_REVOKED", targetId: staff.id },
      }),
    ).toBe(0);
    const auditRecords = await Promise.all([
      prisma.auditOperation.findUniqueOrThrow({
        where: { id: input.operationId },
      }),
      prisma.auditEvent.findMany({ where: { operationId: input.operationId } }),
    ]);
    expect(JSON.stringify(auditRecords)).not.toContain(temporaryPassword);
  });

  it("rolls back password, state, sessions, and success audit after session revocation", async () => {
    const fixture = await createAdministratorFixture();
    const staff = await createStaff(fixture, {
      email: "reset.rollback@example.test",
    });
    await signIn(staff.email, staffPassword, "192.0.2.186");
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: staff.id },
    });
    const input = resetInput(staff.id);

    await expect(
      resetStaffPasswordForTest(input, fixture.actor, fixture.headers, {
        currentTime: () => currentTime,
        generateCredential: () => temporaryPassword,
        afterSessionRevocation: () => {
          throw new Error("Deliberate fictional reset rollback");
        },
      }),
    ).rejects.toMatchObject({ code: "INCONSISTENT_RESULT" });

    await expect(
      prisma.user.findUniqueOrThrow({ where: { id: staff.id } }),
    ).resolves.toMatchObject({
      mustChangePassword: before.mustChangePassword,
      temporaryCredentialExpiresAt: before.temporaryCredentialExpiresAt,
    });
    expect(await prisma.session.count({ where: { userId: staff.id } })).toBe(1);
    expect(
      await signIn(staff.email, staffPassword, "192.0.2.187"),
    ).toHaveProperty("status", 200);
    expect(
      await signIn(staff.email, temporaryPassword, "192.0.2.188"),
    ).toHaveProperty("status", 401);
    await expect(
      prisma.auditEvent.findUniqueOrThrow({
        where: {
          operationId_type: {
            operationId: input.operationId,
            type: "OUTCOME",
          },
        },
      }),
    ).resolves.toMatchObject({ result: "FAILED" });
  });

  it("denies inactive, Administrator, and cross-Organisation targets before intent", async () => {
    const fixture = await createAdministratorFixture();
    const inactive = await createStaff(fixture, {
      email: "reset.inactive@example.test",
      banned: true,
    });
    const otherOrganisationId = randomUUID();
    await prisma.organisation.create({
      data: {
        id: otherOrganisationId,
        name: "Fiktiva Andra Resetorganisationen",
      },
    });
    const foreign = await createAuthentication(prisma).api.createUser({
      body: {
        name: "Fiktiv Utländsk Medarbetare",
        email: "reset.foreign@example.test",
        password: staffPassword,
        data: {
          organisationId: otherOrganisationId,
          professionalTitle: "Fiktiv behandlare",
          mustChangePassword: false,
          temporaryCredentialExpiresAt: null,
        },
      },
    });

    for (const targetUserId of [
      inactive.id,
      fixture.actor.userId,
      foreign.user.id,
    ]) {
      const input = resetInput(targetUserId);
      await expect(
        resetStaffPasswordForTest(input, fixture.actor, fixture.headers, {}),
      ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });
      expect(
        await prisma.auditOperation.count({ where: { id: input.operationId } }),
      ).toBe(0);
    }
  });

  it("denies an existing valid reset without generating a replacement credential", async () => {
    const fixture = await createAdministratorFixture();
    const futureExpiry = new Date(currentTime.getTime() + 60_000);
    const staff = await createStaff(fixture, {
      email: "reset.pending@example.test",
      mustChangePassword: true,
      temporaryCredentialExpiresAt: futureExpiry,
    });
    let credentialGenerated = false;
    const input = resetInput(staff.id);

    await expect(
      resetStaffPasswordForTest(input, fixture.actor, fixture.headers, {
        currentTime: () => currentTime,
        generateCredential: () => {
          credentialGenerated = true;
          return temporaryPassword;
        },
      }),
    ).rejects.toMatchObject({ code: "RESET_ALREADY_PENDING" });
    expect(credentialGenerated).toBe(false);
    expect(
      await signIn(staff.email, staffPassword, "192.0.2.189"),
    ).toHaveProperty("status", 200);
    await expect(
      prisma.auditEvent.findUniqueOrThrow({
        where: {
          operationId_type: {
            operationId: input.operationId,
            type: "OUTCOME",
          },
        },
      }),
    ).resolves.toMatchObject({ result: "FAILED" });
  });

  it.each([
    ["expired reset", true, new Date(currentTime.getTime() - 1), null],
    [
      "stale expiry with no forced change",
      false,
      new Date(currentTime.getTime() + 60_000),
      false,
    ],
  ] as const)(
    "allows a new reset for %s",
    async (_label, mustChangePassword, expiry, banned) => {
      const fixture = await createAdministratorFixture();
      const staff = await createStaff(fixture, {
        email: `reset.allowed-${mustChangePassword}@example.test`,
        banned,
        mustChangePassword,
        temporaryCredentialExpiresAt: expiry,
      });

      await expect(
        resetStaffPasswordForTest(
          resetInput(staff.id),
          fixture.actor,
          fixture.headers,
          {
            currentTime: () => currentTime,
            generateCredential: () => replacementPassword,
          },
        ),
      ).resolves.toMatchObject({ temporaryCredential: replacementPassword });
    },
  );

  it("does not enter protected work when audit intent creation requires review", async () => {
    const fixture = await createAdministratorFixture();
    const staff = await createStaff(fixture, {
      email: "reset.review@example.test",
    });
    const operationId = generateAuditOperationId();
    await createUserAuditIntent({
      operationId,
      actor: fixture.actor,
      action: "PASSWORD_RESET_BY_ADMIN",
      target: { targetId: staff.id },
    });
    let protectedWorkStarted = false;

    await expect(
      resetStaffPasswordForTest(
        { operationId, targetUserId: staff.id },
        fixture.actor,
        fixture.headers,
        {
          afterAuditIntent: () => {
            protectedWorkStarted = true;
          },
        },
      ),
    ).rejects.toMatchObject({ code: "OPERATION_REQUIRES_REVIEW" });
    expect(protectedWorkStarted).toBe(false);
  });

  it("serializes simultaneous resets so exactly one credential succeeds", async () => {
    const fixture = await createAdministratorFixture();
    const staff = await createStaff(fixture, {
      email: "reset.concurrent@example.test",
    });
    const credentials = [
      "Fictional concurrent temporary credential alpha 2032",
      "Fictional concurrent temporary credential beta 2032",
    ] as const;
    const operationIds = [
      generateAuditOperationId(),
      generateAuditOperationId(),
    ] as const;

    const attempts = await Promise.allSettled(
      operationIds.map((operationId, index) =>
        resetStaffPasswordForTest(
          { operationId, targetUserId: staff.id },
          fixture.actor,
          fixture.headers,
          {
            currentTime: () => currentTime,
            generateCredential: () => credentials[index],
          },
        ),
      ),
    );

    const successes = attempts.filter(
      (
        attempt,
      ): attempt is PromiseFulfilledResult<
        Awaited<ReturnType<typeof resetStaffPasswordForTest>>
      > => attempt.status === "fulfilled",
    );
    const failures = attempts.filter(
      (attempt) => attempt.status === "rejected",
    );
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      reason: { code: "RESET_ALREADY_PENDING" },
    });

    for (const [index, credential] of credentials.entries()) {
      const response = await signIn(
        staff.email,
        credential,
        `192.0.2.${190 + index}`,
      );
      expect(response.status).toBe(
        credential === successes[0]?.value.temporaryCredential ? 200 : 401,
      );
    }
    const outcomes = await prisma.auditEvent.findMany({
      where: { operationId: { in: [...operationIds] }, type: "OUTCOME" },
      select: { result: true },
    });
    expect(outcomes.map(({ result }) => result).sort()).toEqual([
      "FAILED",
      "SUCCEEDED",
    ]);
  });
});
