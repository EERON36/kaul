import { describe, expect, it } from "vitest";

import {
  canonicalizePersonIdentifier,
  createAssignmentInputSchema,
  createClientInputSchema,
  endAssignmentInputSchema,
} from "./client-input";

const operationId = "123e4567-e89b-42d3-a456-426614174000";

describe("Client input", () => {
  it("canonicalises an opaque person reference deterministically", () => {
    expect(canonicalizePersonIdentifier("  fiktiv-é-42  ")).toBe("FIKTIV-É-42");
    expect(canonicalizePersonIdentifier("e\u0301")).toBe("É");
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
