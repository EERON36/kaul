import type { ApplicationUser } from "../authentication/guards";
import {
  archiveGoalInternal,
  cancelFollowUpInternal,
  completeFollowUpInternal,
  completeGoalInternal,
  createFollowUpInternal,
  createGoalInternal,
  getFollowUpInternal,
  getGoalInternal,
  listEligibleResponsibleUsersInternal,
  listFollowUpsInternal,
  listGoalsInternal,
  listOwnFollowUpsForHomeInternal,
  pauseGoalInternal,
  reassignFollowUpInternal,
  resumeGoalInternal,
  updateFollowUpInternal,
  updateGoalInternal,
  type PlanningTestDependencies,
} from "./planning-internal";
import type {
  AuditedFollowUpTransitionInput,
  AuditedGoalTransitionInput,
  ClientPlanningQueryInput,
  CreateFollowUpInput,
  CreateGoalInput,
  FollowUpQueryInput,
  GoalQueryInput,
  GoalVersionInput,
  ReassignFollowUpInput,
  UpdateFollowUpInput,
  UpdateGoalInput,
} from "./planning-input";

function assertTestEnvironment(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Planning test support is available only in tests.");
  }
}

export function listGoalsForTest(
  input: ClientPlanningQueryInput,
  actor: ApplicationUser,
) {
  assertTestEnvironment();
  return listGoalsInternal(input, actor);
}
export function getGoalForTest(input: GoalQueryInput, actor: ApplicationUser) {
  assertTestEnvironment();
  return getGoalInternal(input, actor);
}
export function createGoalForTest(
  input: CreateGoalInput,
  actor: ApplicationUser,
) {
  assertTestEnvironment();
  return createGoalInternal(input, actor);
}
export function updateGoalForTest(
  input: UpdateGoalInput,
  actor: ApplicationUser,
  dependencies?: PlanningTestDependencies,
) {
  assertTestEnvironment();
  return updateGoalInternal(input, actor, dependencies);
}
export function pauseGoalForTest(
  input: GoalVersionInput,
  actor: ApplicationUser,
) {
  assertTestEnvironment();
  return pauseGoalInternal(input, actor);
}
export function resumeGoalForTest(
  input: GoalVersionInput,
  actor: ApplicationUser,
) {
  assertTestEnvironment();
  return resumeGoalInternal(input, actor);
}
export function completeGoalForTest(
  input: AuditedGoalTransitionInput,
  actor: ApplicationUser,
  dependencies?: PlanningTestDependencies,
) {
  assertTestEnvironment();
  return completeGoalInternal(input, actor, dependencies);
}
export function archiveGoalForTest(
  input: AuditedGoalTransitionInput,
  actor: ApplicationUser,
  dependencies?: PlanningTestDependencies,
) {
  assertTestEnvironment();
  return archiveGoalInternal(input, actor, dependencies);
}
export function listFollowUpsForTest(
  input: ClientPlanningQueryInput,
  actor: ApplicationUser,
) {
  assertTestEnvironment();
  return listFollowUpsInternal(input, actor);
}
export function getFollowUpForTest(
  input: FollowUpQueryInput,
  actor: ApplicationUser,
) {
  assertTestEnvironment();
  return getFollowUpInternal(input, actor);
}
export function listEligibleResponsibleUsersForTest(
  input: ClientPlanningQueryInput,
  actor: ApplicationUser,
) {
  assertTestEnvironment();
  return listEligibleResponsibleUsersInternal(input, actor);
}
export function createFollowUpForTest(
  input: CreateFollowUpInput,
  actor: ApplicationUser,
) {
  assertTestEnvironment();
  return createFollowUpInternal(input, actor);
}
export function updateFollowUpForTest(
  input: UpdateFollowUpInput,
  actor: ApplicationUser,
  dependencies?: PlanningTestDependencies,
) {
  assertTestEnvironment();
  return updateFollowUpInternal(input, actor, dependencies);
}
export function reassignFollowUpForTest(
  input: ReassignFollowUpInput,
  actor: ApplicationUser,
  dependencies?: PlanningTestDependencies,
) {
  assertTestEnvironment();
  return reassignFollowUpInternal(input, actor, dependencies);
}
export function completeFollowUpForTest(
  input: AuditedFollowUpTransitionInput,
  actor: ApplicationUser,
  dependencies?: PlanningTestDependencies,
) {
  assertTestEnvironment();
  return completeFollowUpInternal(input, actor, dependencies);
}
export function cancelFollowUpForTest(
  input: AuditedFollowUpTransitionInput,
  actor: ApplicationUser,
  dependencies?: PlanningTestDependencies,
) {
  assertTestEnvironment();
  return cancelFollowUpInternal(input, actor, dependencies);
}
export function listOwnFollowUpsForHomeForTest(
  actor: ApplicationUser,
  now: Date,
) {
  assertTestEnvironment();
  return listOwnFollowUpsForHomeInternal(actor, now);
}
