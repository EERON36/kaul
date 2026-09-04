import type { ApplicationUser } from "../authentication/guards";
import {
  beginMonthlyReportReplacementInternal,
  createMonthlyReportDraftInternal,
  getMonthlyReportInternal,
  listMonthlyReportsInternal,
  saveMonthlyReportDraftInternal,
  signMonthlyReportDraftInternal,
  type MonthlyReportTestDependencies,
} from "./monthly-report-internal";
import type {
  BeginMonthlyReportReplacementInput,
  ClientMonthlyReportsQueryInput,
  CreateMonthlyReportDraftInput,
  MonthlyReportQueryInput,
  SaveMonthlyReportDraftInput,
  SignMonthlyReportDraftInput,
} from "./monthly-report-input";

function assertTestEnvironment(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Monthly report test support is available only in tests.");
  }
}

export function listMonthlyReportsForTest(
  input: ClientMonthlyReportsQueryInput,
  actor: ApplicationUser,
  dependencies: MonthlyReportTestDependencies = {},
) {
  assertTestEnvironment();
  return listMonthlyReportsInternal(input, actor, dependencies);
}

export function getMonthlyReportForTest(
  input: MonthlyReportQueryInput,
  actor: ApplicationUser,
) {
  assertTestEnvironment();
  return getMonthlyReportInternal(input, actor);
}

export function createMonthlyReportDraftForTest(
  input: CreateMonthlyReportDraftInput,
  actor: ApplicationUser,
) {
  assertTestEnvironment();
  return createMonthlyReportDraftInternal(input, actor);
}

export function saveMonthlyReportDraftForTest(
  input: SaveMonthlyReportDraftInput,
  actor: ApplicationUser,
  dependencies: MonthlyReportTestDependencies = {},
) {
  assertTestEnvironment();
  return saveMonthlyReportDraftInternal(input, actor, dependencies);
}

export function signMonthlyReportDraftForTest(
  input: SignMonthlyReportDraftInput,
  actor: ApplicationUser,
  dependencies: MonthlyReportTestDependencies = {},
) {
  assertTestEnvironment();
  return signMonthlyReportDraftInternal(input, actor, dependencies);
}

export function beginMonthlyReportReplacementForTest(
  input: BeginMonthlyReportReplacementInput,
  actor: ApplicationUser,
) {
  assertTestEnvironment();
  return beginMonthlyReportReplacementInternal(input, actor);
}
