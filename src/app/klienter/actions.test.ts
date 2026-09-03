import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

const mocks = vi.hoisted(() => ({
  archiveClient: vi.fn(),
  createAssignment: vi.fn(),
  createClient: vi.fn(),
  endAssignment: vi.fn(),
  searchClients: vi.fn(),
  updateClient: vi.fn(),
  generateAuditOperationId: vi.fn(() => "123e4567-e89b-42d3-a456-426614174099"),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../../modules/audit/audit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../modules/audit/audit")>()),
  generateAuditOperationId: mocks.generateAuditOperationId,
}));
vi.mock("../../modules/clients/clients", () => ({
  archiveClient: mocks.archiveClient,
  createAssignment: mocks.createAssignment,
  createClient: mocks.createClient,
  endAssignment: mocks.endAssignment,
  searchClients: mocks.searchClients,
  updateClient: mocks.updateClient,
}));

import { AuditError } from "../../modules/audit/audit";

import {
  archiveClientAction,
  createAssignmentAction,
  createClientAction,
  endAssignmentAction,
  searchClientsAction,
  updateClientAction,
  type ClientActionState,
  type ClientSearchActionState,
} from "./actions";

const operationId = "123e4567-e89b-42d3-a456-426614174000";
const clientId = "123e4567-e89b-42d3-a456-426614174001";
const assignmentId = "123e4567-e89b-42d3-a456-426614174002";
const initialState: ClientActionState = { status: "IDLE", operationId };
const initialSearchState: ClientSearchActionState = {
  status: "IDLE",
  clients: [],
  query: "",
  searched: false,
};

function clientForm(): FormData {
  const form = new FormData();
  form.set("operationId", operationId);
  form.set("firstName", "Fiktiv");
  form.set("lastName", "Klient");
  form.set("personIdentifier", "FIKTIV-01");
  form.set("category", "ADULT");
  return form;
}

function assignmentForm(): FormData {
  const form = new FormData();
  form.set("operationId", operationId);
  form.set("clientId", clientId);
  form.set("staffUserId", "fictional-staff-user");
  form.set("responsibility", "PRIMARY");
  return form;
}

function updateForm(): FormData {
  const form = clientForm();
  form.set("clientId", clientId);
  return form;
}

function endForm(): FormData {
  const form = new FormData();
  form.set("operationId", operationId);
  form.set("assignmentId", assignmentId);
  return form;
}

function archiveForm(): FormData {
  const form = new FormData();
  form.set("operationId", operationId);
  form.set("clientId", clientId);
  form.set("organisationId", "browser-controlled");
  form.set("status", "ARCHIVED");
  return form;
}

describe("Client Server Action audit operation lifecycle", () => {
  beforeEach(() => vi.clearAllMocks());

  const cases = [
    ["Client creation", createClientAction, mocks.createClient, clientForm],
    [
      "Assignment creation",
      createAssignmentAction,
      mocks.createAssignment,
      assignmentForm,
    ],
    ["Assignment ending", endAssignmentAction, mocks.endAssignment, endForm],
    ["Client update", updateClientAction, mocks.updateClient, updateForm],
    ["Client archive", archiveClientAction, mocks.archiveClient, archiveForm],
  ] as const;

  for (const [label, action, service, form] of cases) {
    it.each(["OPERATION_REQUIRES_REVIEW", "INCONSISTENT_OPERATION"] as const)(
      `${label} fails closed for %s without issuing a new operation ID`,
      async (code) => {
        service.mockRejectedValueOnce(new AuditError(code));

        await expect(action(initialState, form())).rejects.toMatchObject({
          code,
        });
        expect(service).toHaveBeenCalledTimes(1);
        expect(mocks.generateAuditOperationId).not.toHaveBeenCalled();
        expect(mocks.revalidatePath).not.toHaveBeenCalled();
      },
    );
  }

  it("uses the server-derived Client ID when an Assignment is ended", async () => {
    const trustedClientId = "123e4567-e89b-42d3-a456-426614174010";
    const form = endForm();
    form.set("clientId", "123e4567-e89b-42d3-a456-426614174011");
    mocks.endAssignment.mockResolvedValueOnce({ clientId: trustedClientId });

    await expect(
      endAssignmentAction(initialState, form),
    ).resolves.toMatchObject({ status: "SUCCESS" });
    expect(mocks.endAssignment).toHaveBeenCalledWith({
      operationId,
      assignmentId,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/klienter");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/klienter/${trustedClientId}`,
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalledWith(
      "/klienter/123e4567-e89b-42d3-a456-426614174011",
    );
  });

  it("uses the server-derived Client ID when an update succeeds", async () => {
    const trustedClientId = "123e4567-e89b-42d3-a456-426614174010";
    mocks.updateClient.mockResolvedValueOnce({
      changed: true,
      client: { id: trustedClientId },
    });

    await expect(
      updateClientAction(initialState, updateForm()),
    ).resolves.toMatchObject({
      status: "SUCCESS",
      message: "Klientuppgifterna har sparats.",
    });
    expect(mocks.updateClient).toHaveBeenCalledWith({
      operationId,
      clientId,
      firstName: "Fiktiv",
      lastName: "Klient",
      personIdentifier: "FIKTIV-01",
      personalIdentityNumber: "",
      placingUnit: "",
      legalBasis: "",
      responsibleSocialWorkerName: "",
      responsibleSocialWorkerPhone: "",
      responsibleSocialWorkerEmail: "",
      category: "ADULT",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/klienter");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/klienter/${trustedClientId}`,
    );
  });

  it("does not claim a mutation when unchanged Client values are submitted", async () => {
    mocks.updateClient.mockResolvedValueOnce({
      changed: false,
      client: { id: clientId },
    });

    await expect(
      updateClientAction(initialState, updateForm()),
    ).resolves.toMatchObject({
      status: "SUCCESS",
      message: "Det finns inga ändringar att spara.",
    });
  });

  it("archives using only the target ID and redirects with the trusted result", async () => {
    const trustedClientId = "123e4567-e89b-42d3-a456-426614174010";
    mocks.archiveClient.mockResolvedValueOnce({ clientId: trustedClientId });

    await archiveClientAction(initialState, archiveForm());

    expect(mocks.archiveClient).toHaveBeenCalledWith({
      operationId,
      clientId,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/klienter");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/klienter/arkiverade");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/klienter/${trustedClientId}`,
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      `/klienter/${trustedClientId}?arkiverad=klar`,
    );
  });
});

describe("Client creation handoff", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only the exact Client ID from the successful authenticated operation", async () => {
    const trustedClientId = "123e4567-e89b-42d3-a456-426614174010";
    const form = clientForm();
    form.set("clientId", "browser-controlled-client-id");
    mocks.createClient.mockResolvedValueOnce({ id: trustedClientId });

    await expect(createClientAction(initialState, form)).resolves.toEqual({
      status: "SUCCESS",
      operationId: "123e4567-e89b-42d3-a456-426614174099",
      message:
        "Klienten har skapats. Lägg till en primär tilldelning för att aktivera klienten.",
      clientId: trustedClientId,
    });
    expect(mocks.createClient).toHaveBeenCalledWith({
      operationId,
      firstName: "Fiktiv",
      lastName: "Klient",
      personIdentifier: "FIKTIV-01",
      personalIdentityNumber: "",
      placingUnit: "",
      legalBasis: "",
      responsibleSocialWorkerName: "",
      responsibleSocialWorkerPhone: "",
      responsibleSocialWorkerEmail: "",
      category: "ADULT",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/klienter");
  });

  it("removes any previous Client link target when validation fails", async () => {
    mocks.createClient.mockRejectedValueOnce(new ZodError([]));

    const result = await createClientAction(
      { ...initialState, status: "SUCCESS", clientId },
      clientForm(),
    );

    expect(result).toEqual({
      status: "ERROR",
      operationId: "123e4567-e89b-42d3-a456-426614174099",
      message: "Kontrollera uppgifterna och försök igen.",
    });
    expect(result).not.toHaveProperty("clientId");
  });
});

describe("Client search Server Action", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes only the browser search text to the authenticated operation", async () => {
    const form = new FormData();
    form.set("query", "  Fiktiv Klient  ");
    form.set("organisationId", "browser-controlled");
    form.set("role", "ADMINISTRATOR");
    mocks.searchClients.mockResolvedValueOnce({
      clients: [{ id: clientId }],
      query: "Fiktiv Klient",
    });

    await expect(
      searchClientsAction(initialSearchState, form),
    ).resolves.toMatchObject({
      status: "SUCCESS",
      query: "Fiktiv Klient",
      searched: true,
    });
    expect(mocks.searchClients).toHaveBeenCalledWith("  Fiktiv Klient  ");
    expect(mocks.searchClients).toHaveBeenCalledTimes(1);
  });

  it("restores the ordinary list for an empty search", async () => {
    const form = new FormData();
    form.set("query", "");
    mocks.searchClients.mockResolvedValueOnce({
      clients: [{ id: clientId }],
      query: "",
    });

    await expect(
      searchClientsAction(initialSearchState, form),
    ).resolves.toMatchObject({
      status: "SUCCESS",
      query: "",
      searched: false,
    });
  });

  it("returns one generic Swedish error without exposing failure details", async () => {
    const form = new FormData();
    form.set("query", "Hemlig referens");
    mocks.searchClients.mockRejectedValueOnce(
      new Error("Database says inaccessible Client exists"),
    );

    const result = await searchClientsAction(initialSearchState, form);

    expect(result).toEqual({
      ...initialSearchState,
      status: "ERROR",
      message:
        "Sökningen kunde inte genomföras. Kontrollera söktexten och försök igen.",
    });
    expect(JSON.stringify(result)).not.toContain("inaccessible");
  });
});
