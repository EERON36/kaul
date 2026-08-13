import "server-only";

import { requireApplicationUser } from "../authentication/guards";
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
  PlanningError,
  reassignFollowUpInternal,
  resumeGoalInternal,
  updateFollowUpInternal,
  updateGoalInternal,
  type EligibleResponsibleUser,
  type FollowUpRecord,
  type GoalRecord,
  type OwnFollowUpHomeItem,
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

export {
  PlanningError,
  type AuditedFollowUpTransitionInput,
  type AuditedGoalTransitionInput,
  type ClientPlanningQueryInput,
  type CreateFollowUpInput,
  type CreateGoalInput,
  type EligibleResponsibleUser,
  type FollowUpQueryInput,
  type FollowUpRecord,
  type GoalQueryInput,
  type GoalRecord,
  type GoalVersionInput,
  type OwnFollowUpHomeItem,
  type ReassignFollowUpInput,
  type UpdateFollowUpInput,
  type UpdateGoalInput,
};

export async function listGoals(input: ClientPlanningQueryInput) {
  return listGoalsInternal(input, await requireApplicationUser());
}

export async function getGoal(input: GoalQueryInput) {
  return getGoalInternal(input, await requireApplicationUser());
}

export async function createGoal(input: CreateGoalInput) {
  return createGoalInternal(input, await requireApplicationUser());
}

export async function updateGoal(input: UpdateGoalInput) {
  return updateGoalInternal(input, await requireApplicationUser());
}

export async function pauseGoal(input: GoalVersionInput) {
  return pauseGoalInternal(input, await requireApplicationUser());
}

export async function resumeGoal(input: GoalVersionInput) {
  return resumeGoalInternal(input, await requireApplicationUser());
}

export async function completeGoal(input: AuditedGoalTransitionInput) {
  return completeGoalInternal(input, await requireApplicationUser());
}

export async function archiveGoal(input: AuditedGoalTransitionInput) {
  return archiveGoalInternal(input, await requireApplicationUser());
}

export async function listFollowUps(input: ClientPlanningQueryInput) {
  return listFollowUpsInternal(input, await requireApplicationUser());
}

export async function getFollowUp(input: FollowUpQueryInput) {
  return getFollowUpInternal(input, await requireApplicationUser());
}

export async function listEligibleResponsibleUsers(
  input: ClientPlanningQueryInput,
) {
  return listEligibleResponsibleUsersInternal(
    input,
    await requireApplicationUser(),
  );
}

export async function createFollowUp(input: CreateFollowUpInput) {
  return createFollowUpInternal(input, await requireApplicationUser());
}

export async function updateFollowUp(input: UpdateFollowUpInput) {
  return updateFollowUpInternal(input, await requireApplicationUser());
}

export async function reassignFollowUp(input: ReassignFollowUpInput) {
  return reassignFollowUpInternal(input, await requireApplicationUser());
}

export async function completeFollowUp(input: AuditedFollowUpTransitionInput) {
  return completeFollowUpInternal(input, await requireApplicationUser());
}

export async function cancelFollowUp(input: AuditedFollowUpTransitionInput) {
  return cancelFollowUpInternal(input, await requireApplicationUser());
}

export async function listOwnFollowUpsForHome(): Promise<
  readonly OwnFollowUpHomeItem[]
> {
  return listOwnFollowUpsForHomeInternal(await requireApplicationUser());
}
