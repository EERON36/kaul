import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { UserRole } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import {
  createUserAuditIntent,
  generateAuditOperationId,
} from "../audit/audit";
import { auth, createAuthentication } from "../authentication/auth";
import type { AdministratorUser } from "./authorization";
import {
  createStaffMemberForTest,
  deactivateStaffMemberForTest,
  reactivateStaffMemberForTest,
} from "./staff-management.test-support";

const administratorPassword = "Fictional administrator password 2030";
const staffPassword = "Fictional generated staff password 2030";

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

async function createAdministratorFixture(): Promise<Fixture> {
  const organisationId = randomUUID();
  await prisma.organisation.create({
    data: { id: organisationId, name: "Fiktiva Stafforganisationen" },
  });
  const created = await createAuthentication(prisma).api.createUser({
    body: {
      name: "Fiktiv Administratör",
      email: "slice5.administrator@example.test",
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
  const signIn = await auth.api.signInEmail({
    body: {
      email: "slice5.administrator@example.test",
      password: administratorPassword,
    },
    headers: new Headers({
      origin: "http://localhost:3000",
      "x-real-ip": "192.0.2.151",
    }),
    asResponse: true,
  });

  return {
    actor: {
      userId: created.user.id,
      name: "Fiktiv Administratör",
      email: "slice5.administrator@example.test",
      role: "ADMINISTRATOR",
      organisationId,
      organisationName: "Fiktiva Stafforganisationen",
      professionalTitle: "Fiktiv verksamhetsansvarig",
      mustChangePassword: false,
      credentialState: "APPLICATION_ALLOWED",
    },
    headers: new Headers({
      origin: "http://localhost:3000",
      cookie: cookiesFrom(signIn),
      "x-real-ip": "192.0.2.151",
    }),
  };
}

async function createStaff(fixture: Fixture, email: string) {
  return createStaffMemberForTest(
    {
      operationId: generateAuditOperationId(),
      name: "Fiktiv Medarbetare",
      email,
      professionalTitle: "Fiktiv behandlare",
    },
    fixture.actor,
    fixture.headers,
    {
      currentTime: () => new Date("2030-04-05T06:07:08.000Z"),
      generateCredential: () => staffPassword,
    },
  );
}

beforeEach(clearFixtures);
afterEach(clearFixtures);

describe("staff management with PostgreSQL", () => {
  it("creates a constrained Staff Member with a durable successful audit", async () => {
    const fixture = await createAdministratorFixture();
    const operationId = generateAuditOperationId();
    const result = await createStaffMemberForTest(
      {
        operationId,
        name: "Fiktiv Medarbetare",
        email: "slice5.staff@example.test",
        professionalTitle: "Fiktiv behandlare",
      },
      fixture.actor,
      fixture.headers,
      {
        currentTime: () => new Date("2030-04-05T06:07:08.000Z"),
        generateCredential: () => staffPassword,
      },
    );

    expect(result.temporaryCredential).toBe(staffPassword);
    expect(result.temporaryCredentialExpiresAt).toEqual(
      new Date("2030-04-06T06:07:08.000Z"),
    );
    await expect(
      prisma.user.findUniqueOrThrow({ where: { id: result.id } }),
    ).resolves.toMatchObject({
      role: UserRole.STAFF_MEMBER,
      organisationId: fixture.actor.organisationId,
      mustChangePassword: true,
      banned: false,
    });
    await expect(
      prisma.auditEvent.findUniqueOrThrow({
        where: { operationId_type: { operationId, type: "OUTCOME" } },
      }),
    ).resolves.toMatchObject({
      result: "SUCCEEDED",
      resolvedTargetId: result.id,
    });
    const auditRecords = await Promise.all([
      prisma.auditOperation.findUniqueOrThrow({ where: { id: operationId } }),
      prisma.auditEvent.findUniqueOrThrow({
        where: { operationId_type: { operationId, type: "OUTCOME" } },
      }),
    ]);
    expect(JSON.stringify(auditRecords)).not.toContain(staffPassword);

    const signIn = await auth.api.signInEmail({
      body: { email: result.email, password: staffPassword },
      headers: new Headers({
        origin: "http://localhost:3000",
        "x-real-ip": "192.0.2.152",
      }),
      asResponse: true,
    });
    expect(signIn.status).toBe(200);
  });

  it("records FAILED for duplicate email and creates no second account", async () => {
    const fixture = await createAdministratorFixture();
    await createStaff(fixture, "slice5.duplicate@example.test");
    const operationId = generateAuditOperationId();

    await expect(
      createStaffMemberForTest(
        {
          operationId,
          name: "Fiktiv Dubblett",
          email: "slice5.duplicate@example.test",
          professionalTitle: "Fiktiv behandlare",
        },
        fixture.actor,
        fixture.headers,
        { generateCredential: () => staffPassword },
      ),
    ).rejects.toMatchObject({ code: "DUPLICATE_EMAIL" });
    expect(
      await prisma.user.count({
        where: { email: "slice5.duplicate@example.test" },
      }),
    ).toBe(1);
    await expect(
      prisma.auditEvent.findUniqueOrThrow({
        where: { operationId_type: { operationId, type: "OUTCOME" } },
      }),
    ).resolves.toMatchObject({ result: "FAILED" });
  });

  it("rolls back User and Account while preserving intent and FAILED outcome", async () => {
    const fixture = await createAdministratorFixture();
    const operationId = generateAuditOperationId();

    await expect(
      createStaffMemberForTest(
        {
          operationId,
          name: "Fiktiv Återställd",
          email: "slice5.rollback@example.test",
          professionalTitle: "Fiktiv behandlare",
        },
        fixture.actor,
        fixture.headers,
        {
          generateCredential: () => staffPassword,
          afterAuthenticationMutation: () => {
            throw new Error("Deliberate fictional rollback");
          },
        },
      ),
    ).rejects.toMatchObject({ code: "INCONSISTENT_RESULT" });
    expect(
      await prisma.user.count({
        where: { email: "slice5.rollback@example.test" },
      }),
    ).toBe(0);
    expect(
      await prisma.account.count({
        where: { user: { email: "slice5.rollback@example.test" } },
      }),
    ).toBe(0);
    await expect(
      prisma.auditEvent.findUniqueOrThrow({
        where: { operationId_type: { operationId, type: "OUTCOME" } },
      }),
    ).resolves.toMatchObject({ result: "FAILED" });
  });

  it("records FAILED when work stops immediately after the durable intent", async () => {
    const fixture = await createAdministratorFixture();
    const operationId = generateAuditOperationId();

    await expect(
      createStaffMemberForTest(
        {
          operationId,
          name: "Fiktiv avbruten medarbetare",
          email: "slice5.after-intent@example.test",
          professionalTitle: "Fiktiv behandlare",
        },
        fixture.actor,
        fixture.headers,
        {
          afterAuditIntent: () => {
            throw new Error("Deliberate fictional failure after intent");
          },
        },
      ),
    ).rejects.toMatchObject({ code: "INCONSISTENT_RESULT" });
    expect(
      await prisma.user.count({
        where: { email: "slice5.after-intent@example.test" },
      }),
    ).toBe(0);
    await expect(
      prisma.auditEvent.findUniqueOrThrow({
        where: { operationId_type: { operationId, type: "OUTCOME" } },
      }),
    ).resolves.toMatchObject({ result: "FAILED" });
  });

  it("does not enter protected work when intent creation requires review", async () => {
    const fixture = await createAdministratorFixture();
    const operationId = generateAuditOperationId();
    await createUserAuditIntent({
      operationId,
      actor: fixture.actor,
      action: "STAFF_ACCOUNT_CREATED",
    });
    let protectedWorkStarted = false;

    await expect(
      createStaffMemberForTest(
        {
          operationId,
          name: "Fiktiv dubbelsändning",
          email: "slice5.review@example.test",
          professionalTitle: "Fiktiv behandlare",
        },
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
    expect(
      await prisma.user.count({
        where: { email: "slice5.review@example.test" },
      }),
    ).toBe(0);
  });

  it("deactivates, revokes sessions, reactivates, and preserves the credential", async () => {
    const fixture = await createAdministratorFixture();
    const staff = await createStaff(fixture, "slice5.lifecycle@example.test");
    const initialSignIn = await auth.api.signInEmail({
      body: { email: staff.email, password: staffPassword },
      headers: new Headers({
        origin: "http://localhost:3000",
        "x-real-ip": "192.0.2.153",
      }),
      asResponse: true,
    });
    expect(initialSignIn.status).toBe(200);
    expect(await prisma.session.count({ where: { userId: staff.id } })).toBe(1);

    const deactivateOperationId = generateAuditOperationId();
    await deactivateStaffMemberForTest(
      { operationId: deactivateOperationId, targetUserId: staff.id },
      fixture.actor,
      fixture.headers,
      {},
    );
    expect(await prisma.session.count({ where: { userId: staff.id } })).toBe(0);
    await expect(
      prisma.user.findUniqueOrThrow({ where: { id: staff.id } }),
    ).resolves.toMatchObject({ banned: true, banExpires: null });
    const deniedSignIn = await auth.api.signInEmail({
      body: { email: staff.email, password: staffPassword },
      headers: new Headers({
        origin: "http://localhost:3000",
        "x-real-ip": "192.0.2.156",
      }),
      asResponse: true,
    });
    expect(deniedSignIn.status).not.toBe(200);
    expect(
      await prisma.auditOperation.count({
        where: {
          action: "USER_SESSIONS_REVOKED",
          targetId: staff.id,
        },
      }),
    ).toBe(0);

    const reactivateOperationId = generateAuditOperationId();
    await reactivateStaffMemberForTest(
      { operationId: reactivateOperationId, targetUserId: staff.id },
      fixture.actor,
      fixture.headers,
      {},
    );
    await expect(
      prisma.user.findUniqueOrThrow({ where: { id: staff.id } }),
    ).resolves.toMatchObject({ banned: false });
    expect(await prisma.session.count({ where: { userId: staff.id } })).toBe(0);
    const signInAgain = await auth.api.signInEmail({
      body: { email: staff.email, password: staffPassword },
      headers: new Headers({
        origin: "http://localhost:3000",
        "x-real-ip": "192.0.2.154",
      }),
      asResponse: true,
    });
    expect(signInAgain.status).toBe(200);

    const events = await prisma.auditEvent.findMany({
      where: {
        operationId: { in: [deactivateOperationId, reactivateOperationId] },
      },
      orderBy: { operationId: "asc" },
    });
    expect(events).toHaveLength(2);
    expect(events.every((event) => event.result === "SUCCEEDED")).toBe(true);
  });

  it("rolls back deactivation, session revocation, and audit success together", async () => {
    const fixture = await createAdministratorFixture();
    const staff = await createStaff(
      fixture,
      "slice5.deactivate-rollback@example.test",
    );
    await auth.api.signInEmail({
      body: { email: staff.email, password: staffPassword },
      headers: new Headers({
        origin: "http://localhost:3000",
        "x-real-ip": "192.0.2.155",
      }),
    });
    const operationId = generateAuditOperationId();

    await expect(
      deactivateStaffMemberForTest(
        { operationId, targetUserId: staff.id },
        fixture.actor,
        fixture.headers,
        {
          afterAuthenticationMutation: () => {
            throw new Error("Deliberate fictional rollback");
          },
        },
      ),
    ).rejects.toMatchObject({ code: "INCONSISTENT_RESULT" });
    await expect(
      prisma.user.findUniqueOrThrow({ where: { id: staff.id } }),
    ).resolves.toMatchObject({ banned: false });
    expect(await prisma.session.count({ where: { userId: staff.id } })).toBe(1);
    await expect(
      prisma.auditEvent.findUniqueOrThrow({
        where: { operationId_type: { operationId, type: "OUTCOME" } },
      }),
    ).resolves.toMatchObject({ result: "FAILED" });
  });

  it("rolls back reactivation and records FAILED", async () => {
    const fixture = await createAdministratorFixture();
    const staff = await createStaff(
      fixture,
      "slice5.reactivate-rollback@example.test",
    );
    await deactivateStaffMemberForTest(
      {
        operationId: generateAuditOperationId(),
        targetUserId: staff.id,
      },
      fixture.actor,
      fixture.headers,
      {},
    );
    const operationId = generateAuditOperationId();

    await expect(
      reactivateStaffMemberForTest(
        { operationId, targetUserId: staff.id },
        fixture.actor,
        fixture.headers,
        {
          afterAuthenticationMutation: () => {
            throw new Error("Deliberate fictional reactivation rollback");
          },
        },
      ),
    ).rejects.toMatchObject({ code: "INCONSISTENT_RESULT" });
    await expect(
      prisma.user.findUniqueOrThrow({ where: { id: staff.id } }),
    ).resolves.toMatchObject({ banned: true });
    await expect(
      prisma.auditEvent.findUniqueOrThrow({
        where: { operationId_type: { operationId, type: "OUTCOME" } },
      }),
    ).resolves.toMatchObject({ result: "FAILED" });
  });

  it("serializes concurrent deactivation so one succeeds and one fails safely", async () => {
    const fixture = await createAdministratorFixture();
    const staff = await createStaff(fixture, "slice5.concurrent@example.test");
    const operationIds = [
      generateAuditOperationId(),
      generateAuditOperationId(),
    ] as const;

    const attempts = await Promise.allSettled(
      operationIds.map((operationId) =>
        deactivateStaffMemberForTest(
          { operationId, targetUserId: staff.id },
          fixture.actor,
          fixture.headers,
          {},
        ),
      ),
    );

    expect(
      attempts.filter(({ status }) => status === "fulfilled"),
    ).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === "rejected")).toHaveLength(
      1,
    );
    await expect(
      prisma.user.findUniqueOrThrow({ where: { id: staff.id } }),
    ).resolves.toMatchObject({ banned: true });
    const outcomes = await prisma.auditEvent.findMany({
      where: { operationId: { in: [...operationIds] }, type: "OUTCOME" },
      select: { result: true },
    });
    expect(outcomes.map(({ result }) => result).sort()).toEqual([
      "FAILED",
      "SUCCEEDED",
    ]);
  });

  it("denies a cross-organisation target before creating an audit intent", async () => {
    const fixture = await createAdministratorFixture();
    const otherOrganisationId = randomUUID();
    await prisma.organisation.create({
      data: { id: otherOrganisationId, name: "Annan fiktiv organisation" },
    });
    const otherUser = await prisma.user.create({
      data: {
        id: randomUUID(),
        name: "Fiktiv annan medarbetare",
        email: "slice5.other@example.test",
        organisationId: otherOrganisationId,
        professionalTitle: "Fiktiv behandlare",
      },
    });
    const operationId = generateAuditOperationId();

    await expect(
      deactivateStaffMemberForTest(
        { operationId, targetUserId: otherUser.id },
        fixture.actor,
        fixture.headers,
        {},
      ),
    ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });
    expect(
      await prisma.auditOperation.count({ where: { id: operationId } }),
    ).toBe(0);
  });

  it("uses the same unavailable response for an Administrator target", async () => {
    const fixture = await createAdministratorFixture();
    const operationId = generateAuditOperationId();

    await expect(
      deactivateStaffMemberForTest(
        { operationId, targetUserId: fixture.actor.userId },
        fixture.actor,
        fixture.headers,
        {},
      ),
    ).rejects.toMatchObject({ code: "TARGET_UNAVAILABLE" });
    expect(
      await prisma.auditOperation.count({ where: { id: operationId } }),
    ).toBe(0);
  });

  it("denies a stale actor whose database role is no longer Administrator", async () => {
    const fixture = await createAdministratorFixture();
    await prisma.user.update({
      where: { id: fixture.actor.userId },
      data: { role: UserRole.STAFF_MEMBER },
    });
    const operationId = generateAuditOperationId();

    await expect(
      createStaffMemberForTest(
        {
          operationId,
          name: "Fiktiv nekad medarbetare",
          email: "slice5.denied-actor@example.test",
          professionalTitle: "Fiktiv behandlare",
        },
        fixture.actor,
        fixture.headers,
        { generateCredential: () => staffPassword },
      ),
    ).rejects.toMatchObject({ code: "INCONSISTENT_RESULT" });
    expect(
      await prisma.user.count({
        where: { email: "slice5.denied-actor@example.test" },
      }),
    ).toBe(0);
    await expect(
      prisma.auditEvent.findUniqueOrThrow({
        where: { operationId_type: { operationId, type: "OUTCOME" } },
      }),
    ).resolves.toMatchObject({ result: "FAILED" });
  });
});
