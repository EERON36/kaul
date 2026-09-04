import { describe, expect, it } from "vitest";

import {
  archiveClientInputSchema,
  canonicalizePersonIdentifier,
  clientSearchInputSchema,
  createAssignmentInputSchema,
  createClientInputSchema,
  endAssignmentInputSchema,
  updateClientInputSchema,
} from "./client-input";

const operationId = "123e4567-e89b-42d3-a456-426614174000";
const emptyOptionalClientInformation = {
  personalIdentityNumber: null,
  placingUnit: null,
  legalBasis: null,
  responsibleSocialWorkerName: null,
  responsibleSocialWorkerPhone: null,
  responsibleSocialWorkerEmail: null,
} as const;

describe("Client input", () => {
  it("canonicalises an opaque person reference deterministically", () => {
    expect(canonicalizePersonIdentifier("  fiktiv-é-42  ")).toBe("FIKTIV-É-42");
    expect(canonicalizePersonIdentifier("e\u0301")).toBe("É");
  });

  it("normalises Client search text without changing Swedish letters", () => {
    expect(clientSearchInputSchema.parse("  A\u030Asa\u2003Öberg  ")).toBe(
      "Åsa\u2003Öberg",
    );
    expect(clientSearchInputSchema.parse(" \t\n ")).toBe("");
  });

  it("rejects unsupported and overlong Client search input", () => {
    expect(() => clientSearchInputSchema.parse("x".repeat(101))).toThrow();
    expect(() => clientSearchInputSchema.parse({ query: "Fiktiv" })).toThrow();
  });

  it("accepts exactly the approved Client creation fields", () => {
    expect(
      createClientInputSchema.parse({
        operationId,
        firstName: " Fiktiv ",
        lastName: " Klient ",
        personIdentifier: " test-42 ",
        category: " ADULT ",
      }),
    ).toEqual({
      operationId,
      firstName: "Fiktiv",
      lastName: "Klient",
      personIdentifier: "TEST-42",
      ...emptyOptionalClientInformation,
      category: "ADULT",
    });

    expect(() =>
      createClientInputSchema.parse({
        operationId,
        firstName: "Fiktiv",
        lastName: "Klient",
        personIdentifier: "TEST-42",
        category: "Fiktiv kategori",
        organisationId: "browser-controlled",
      }),
    ).toThrow();
  });

  it("accepts only the approved Client categories", () => {
    expect(
      createClientInputSchema.parse({
        operationId,
        firstName: "Fiktiv",
        lastName: "Klient",
        personIdentifier: "TEST-42",
        category: "YOUTH",
      }).category,
    ).toBe("YOUTH");

    for (const category of ["", "Fiktiv kategori", "Vuxna", "ADULTS"]) {
      expect(() =>
        createClientInputSchema.parse({
          operationId,
          firstName: "Fiktiv",
          lastName: "Klient",
          personIdentifier: "TEST-42",
          category,
        }),
      ).toThrow();
    }
  });

  it("accepts exactly the editable Client fields for updates", () => {
    const input = {
      operationId,
      clientId: "123e4567-e89b-42d3-a456-426614174001",
      firstName: " Uppdaterad ",
      lastName: " Klient ",
      personIdentifier: " ändrad-é-01 ",
      category: " YOUTH ",
    };

    expect(updateClientInputSchema.parse(input)).toEqual({
      operationId,
      clientId: input.clientId,
      firstName: "Uppdaterad",
      lastName: "Klient",
      personIdentifier: "ÄNDRAD-É-01",
      ...emptyOptionalClientInformation,
      category: "YOUTH",
    });

    for (const protectedField of [
      "organisationId",
      "status",
      "archivedAt",
      "assignments",
      "createdAt",
    ]) {
      expect(() =>
        updateClientInputSchema.parse({
          ...input,
          [protectedField]: "browser-controlled",
        }),
      ).toThrow();
    }
  });

  it("normalises nullable Client information without conflating social-worker contact details", () => {
    const parsed = createClientInputSchema.parse({
      operationId,
      firstName: "Fiktiv",
      lastName: "Klient",
      personIdentifier: "FIKTIV-01",
      personalIdentityNumber: " 20000101-1234 ",
      placingUnit: " Fiktiv enhet ",
      legalBasis: " SoL ",
      responsibleSocialWorkerName: " Handläggare Exempel ",
      responsibleSocialWorkerPhone: " 070-000 00 00 ",
      responsibleSocialWorkerEmail: " handlaggare@example.test ",
      category: "ADULT",
    });

    expect(parsed).toMatchObject({
      personalIdentityNumber: "20000101-1234",
      placingUnit: "Fiktiv enhet",
      legalBasis: "SoL",
      responsibleSocialWorkerName: "Handläggare Exempel",
      responsibleSocialWorkerPhone: "070-000 00 00",
      responsibleSocialWorkerEmail: "handlaggare@example.test",
    });
    expect("phone" in parsed).toBe(false);
    expect("email" in parsed).toBe(false);
  });

  it("accepts normal Personnummer formats but rejects unsupported characters", () => {
    const base = {
      operationId,
      firstName: "Fiktiv",
      lastName: "Klient",
      personIdentifier: "FIKTIV-01",
      category: "ADULT",
    };
    for (const personalIdentityNumber of [
      "20000101-1234",
      "000101+1234",
      "2000 01 01 1234",
    ]) {
      expect(
        createClientInputSchema.parse({ ...base, personalIdentityNumber })
          .personalIdentityNumber,
      ).toBe(personalIdentityNumber);
    }
    expect(() =>
      createClientInputSchema.parse({
        ...base,
        personalIdentityNumber: "personnummer-i-logg",
      }),
    ).toThrow();
  });

  it("accepts only the target and operation identifiers for Client archiving", () => {
    const input = {
      operationId,
      clientId: "123e4567-e89b-42d3-a456-426614174001",
    };

    expect(archiveClientInputSchema.parse(input)).toEqual(input);
    for (const protectedField of [
      "organisationId",
      "actorUserId",
      "role",
      "status",
      "archivedAt",
      "activeAssignments",
    ]) {
      expect(() =>
        archiveClientInputSchema.parse({
          ...input,
          [protectedField]: "browser-controlled",
        }),
      ).toThrow();
    }
  });

  it("rejects invalid editable Client values during updates", () => {
    const valid = {
      operationId,
      clientId: "123e4567-e89b-42d3-a456-426614174001",
      firstName: "Fiktiv",
      lastName: "Klient",
      personIdentifier: "FIKTIV-01",
      category: "ADULT",
    };

    for (const invalid of [
      { firstName: "" },
      { lastName: " ".repeat(2) },
      { personIdentifier: "" },
      { personIdentifier: "X".repeat(65) },
      { category: "Vuxna" },
      { category: "ARBITRARY" },
    ]) {
      expect(() =>
        updateClientInputSchema.parse({ ...valid, ...invalid }),
      ).toThrow();
    }
  });

  it("accepts only the approved Assignment responsibility values", () => {
    const base = {
      operationId,
      clientId: "123e4567-e89b-42d3-a456-426614174001",
      staffUserId: "fictional-staff",
    };
    expect(
      createAssignmentInputSchema.parse({
        ...base,
        responsibility: "PRIMARY",
      }).responsibility,
    ).toBe("PRIMARY");
    expect(() =>
      createAssignmentInputSchema.parse({
        ...base,
        responsibility: "ADMINISTRATOR",
      }),
    ).toThrow();
  });

  it("accepts exactly operationId and assignmentId when ending an Assignment", () => {
    const input = {
      operationId,
      assignmentId: "123e4567-e89b-42d3-a456-426614174002",
    };

    expect(endAssignmentInputSchema.parse(input)).toEqual(input);
    expect(() =>
      endAssignmentInputSchema.parse({
        ...input,
        clientId: "123e4567-e89b-42d3-a456-426614174003",
      }),
    ).toThrow();
  });
});
