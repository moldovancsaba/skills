export const CANDIDATE_STATES = {
  GENERATED: "GENERATED",
  REFINED: "REFINED",
  EVALUATED: "EVALUATED",
  REWORK: "REWORK",
  SUPPRESSED: "SUPPRESSED",
  DELIVERED: "DELIVERED",
  ARCHIVED: "ARCHIVED",
} as const;

export type CandidateState = typeof CANDIDATE_STATES[keyof typeof CANDIDATE_STATES];

export const REWORK_ROUTES = {
  REVISE: "REVISE",
  REGENERATE: "REGENERATE",
  MERGE: "MERGE",
  ENRICH: "ENRICH",
  DOWNRANK_ONLY: "DOWNRANK_ONLY",
  OLD_MODIFIED_UNRESOLVED: "OLD_MODIFIED_UNRESOLVED",
  DECLINE_INFORMED_REWORK: "DECLINE_INFORMED_REWORK",
} as const;

export type ReworkRoute = typeof REWORK_ROUTES[keyof typeof REWORK_ROUTES];

export const FRONTIER_ELIGIBLE_CANDIDATE_STATES: CandidateState[] = [
  CANDIDATE_STATES.EVALUATED,
  CANDIDATE_STATES.REFINED,
  CANDIDATE_STATES.GENERATED,
];

export const POOL_EXCLUDED_CANDIDATE_STATES: CandidateState[] = [
  CANDIDATE_STATES.ARCHIVED,
  CANDIDATE_STATES.SUPPRESSED,
  CANDIDATE_STATES.DELIVERED,
];

type LegacyTaskLike = {
  candidateState?: string | null;
  activityState?: string | null;
  processingStatus?: string | null;
  status?: string | null;
};

export function inferLegacyCandidateState(item: LegacyTaskLike): CandidateState {
  if (typeof item.candidateState === "string" && Object.values(CANDIDATE_STATES).includes(item.candidateState as CandidateState)) {
    return item.candidateState as CandidateState;
  }
  if (item.activityState === "ARCHIVED") return CANDIDATE_STATES.ARCHIVED;
  if (item.status === "DECLINED" || item.processingStatus === "DECLINED") return CANDIDATE_STATES.ARCHIVED;
  if (item.status === "COMPLETED") return CANDIDATE_STATES.DELIVERED;
  if (item.processingStatus === "ACCEPTED" || item.status === "ACCEPTED" || item.processingStatus === "VERIFIED") {
    return CANDIDATE_STATES.EVALUATED;
  }
  if (item.processingStatus === "CHECKED") return CANDIDATE_STATES.REFINED;
  return CANDIDATE_STATES.GENERATED;
}

export function isTerminalCandidateState(state: CandidateState | null | undefined) {
  return state === CANDIDATE_STATES.ARCHIVED || state === CANDIDATE_STATES.DELIVERED;
}

export function isFrontierEligibleCandidateState(state: CandidateState | null | undefined) {
  return Boolean(state && FRONTIER_ELIGIBLE_CANDIDATE_STATES.includes(state));
}

export function buildAcceptedTaskPatch(evaluationReason = "Accepted for execution") {
  return {
    processingStatus: "ACCEPTED" as const,
    status: "ACCEPTED" as const,
    evaluationReason,
  };
}

export function buildArchivedTaskPatch(evaluationReason = "Accepted but not delivered") {
  return {
    processingStatus: "ACCEPTED" as const,
    activityState: "ARCHIVED" as const,
    candidateState: CANDIDATE_STATES.ARCHIVED,
    status: "ARCHIVED" as const,
    evaluationReason,
    acceptedNotDelivered: true,
  };
}

export function buildDeliveredTaskPatch(evaluationReason = "Delivered in reality") {
  return {
    processingStatus: "ACCEPTED" as const,
    activityState: "ARCHIVED" as const,
    candidateState: CANDIDATE_STATES.DELIVERED,
    status: "COMPLETED" as const,
    evaluationReason,
  };
}
