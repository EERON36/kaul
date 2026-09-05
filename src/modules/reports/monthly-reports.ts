import "server-only";

import { requireApplicationUser } from "../authentication/guards";
import {
  beginMonthlyReportReplacementInternal,
  createMonthlyReportDraftInternal,
  getMonthlyReportInternal,
  listMonthlyReportsInternal,
  MonthlyReportError,
  saveMonthlyReportDraftInternal,
  signMonthlyReportDraftInternal,
  type MonthlyReportRecord,
} from "./monthly-report-internal";
import type {
  BeginMonthlyReportReplacementInput,
  ClientMonthlyReportsQueryInput,
  CreateMonthlyReportDraftInput,
  MonthlyReportQueryInput,
  SaveMonthlyReportDraftInput,
  SignMonthlyReportDraftInput,
} from "./monthly-report-input";

export {
  MonthlyReportError,
  type BeginMonthlyReportReplacementInput,
  type ClientMonthlyReportsQueryInput,
  type CreateMonthlyReportDraftInput,
  type MonthlyReportQueryInput,
  type MonthlyReportRecord,
  type SaveMonthlyReportDraftInput,
  type SignMonthlyReportDraftInput,
};

export async function listMonthlyReports(
  input: ClientMonthlyReportsQueryInput,
) {
  return listMonthlyReportsInternal(input, await requireApplicationUser());
}

export async function getMonthlyReport(input: MonthlyReportQueryInput) {
  return getMonthlyReportInternal(input, await requireApplicationUser());
}

export async function createMonthlyReportDraft(
  input: CreateMonthlyReportDraftInput,
) {
  return createMonthlyReportDraftInternal(
    input,
    await requireApplicationUser(),
  );
}

export async function saveMonthlyReportDraft(
  input: SaveMonthlyReportDraftInput,
) {
  return saveMonthlyReportDraftInternal(input, await requireApplicationUser());
}

export async function signMonthlyReportDraft(
  input: SignMonthlyReportDraftInput,
) {
  return signMonthlyReportDraftInternal(input, await requireApplicationUser());
}

export async function beginMonthlyReportReplacement(
  input: BeginMonthlyReportReplacementInput,
) {
  return beginMonthlyReportReplacementInternal(
    input,
    await requireApplicationUser(),
  );
}
