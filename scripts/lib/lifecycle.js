/**
 * TRINITY CANDIDATE LIFECYCLE
 * M1.2 — Canonical State Machine
 * v1.0.0
 *
 * Implements the formal lifecycle state machine from the Trinity production definition §3.4.
 *
 * The CandidateState enum is the single source of truth for item lifecycle.
 * NO pipeline stage may infer state by parsing userAnnotation strings.
 *
 * State transitions:
 *   Evidence → GENERATED (by Generator)
 *   GENERATED → REFINED (by Refiner)
 *   REFINED → EVALUATED | REWORK | SUPPRESSED | ARCHIVED (by Evaluator)
 *   EVALUATED → frontier eligible
 *   REWORK → GENERATED | REFINED (re-entered into pipeline)
 *   Any → SUPPRESSED (by Refiner duplicate detection)
 *   Any → ARCHIVED (by Evaluator or maintenance)
 *   EVALUATED → DELIVERED (by user DELIVER feedback)
 */

// ---------------------------------------------------------------------------
// 1. Valid States and Transitions
// ---------------------------------------------------------------------------

const CandidateState = {
  GENERATED:  "GENERATED",
  REFINED:    "REFINED",
  EVALUATED:  "EVALUATED",
  REWORK:     "REWORK",
  SUPPRESSED: "SUPPRESSED",
  DELIVERED:  "DELIVERED",
  ARCHIVED:   "ARCHIVED",
};

const ReworkRoute = {
  REVISE:       "REVISE",
  REGENERATE:   "REGENERATE",
  MERGE:        "MERGE",
  ENRICH:       "ENRICH",
  DOWNRANK_ONLY:"DOWNRANK_ONLY",
};

// States eligible for frontier surfacing (per spec §15.1)
const FRONTIER_ELIGIBLE_STATES = [
  CandidateState.EVALUATED,
  CandidateState.REFINED,    // fallback tier 2
  CandidateState.GENERATED,  // fallback tier 3
];

// States excluded from the EligibleCandidatePool
const POOL_EXCLUDED_STATES = [
  CandidateState.ARCHIVED,
  CandidateState.SUPPRESSED,
  CandidateState.DELIVERED,
];

// ---------------------------------------------------------------------------
// 2. State Transition Helpers
// ---------------------------------------------------------------------------

/**
 * Build the data payload for transitioning a candidate to GENERATED state.
 * Called by the Generator when creating a new candidate.
 */
function toGenerated(overrides = {}) {
  return {
    candidateState: CandidateState.GENERATED,
    reworkRoute: null,
    ...overrides,
  };
}

/**
 * Build the data payload for transitioning a candidate to REFINED state.
 * Called by the Refiner after processing.
 */
function toRefined(overrides = {}) {
  return {
    candidateState: CandidateState.REFINED,
    reworkRoute: null,
    ...overrides,
  };
}

/**
 * Build the data payload for transitioning a candidate to EVALUATED state.
 * Called by the Evaluator when disposition is ELIGIBLE.
 */
function toEvaluated({ qualityScore, urgencyScore, freshnessScore, feedbackScore, evaluationReason, ...rest } = {}) {
  return {
    candidateState: CandidateState.EVALUATED,
    reworkRoute: null,
    qualityScore: qualityScore ?? null,
    urgencyScore: urgencyScore ?? null,
    freshnessScore: freshnessScore ?? null,
    feedbackScore: feedbackScore ?? 0,
    evaluationReason: evaluationReason ?? null,
    ...rest,
  };
}

/**
 * Build the data payload for transitioning a candidate to REWORK state.
 * Called by the Evaluator or feedback handler.
 *
 * @param {ReworkRoute} route - The rework operation to apply
 * @param {string} [reason] - Why this item needs rework
 */
function toRework(route, reason = null) {
  if (!Object.values(ReworkRoute).includes(route)) {
    throw new Error(`[LIFECYCLE] Invalid rework route: ${route}`);
  }
  return {
    candidateState: CandidateState.REWORK,
    reworkRoute: route,
    evaluationReason: reason,
  };
}

/**
 * Build the data payload for suppressing a candidate.
 * Called by the Refiner when a candidate is dominated by a sibling.
 *
 * @param {string} [reason]
 */
function toSuppressed(reason = null) {
  return {
    candidateState: CandidateState.SUPPRESSED,
    evaluationReason: reason,
  };
}

/**
 * Build the data payload for archiving a candidate permanently.
 * Called by the Evaluator or maintenance.
 *
 * @param {string} [reason]
 */
function toArchived(reason = null) {
  return {
    candidateState: CandidateState.ARCHIVED,
    activityState: "ARCHIVED", // Keep legacy field in sync
    evaluationReason: reason,
  };
}

/**
 * Build the data payload for delivering a candidate.
 * Called by the DELIVER feedback handler.
 */
function toDelivered() {
  return {
    candidateState: CandidateState.DELIVERED,
    activityState: "ARCHIVED", // Remove from active pool
    status: "COMPLETED",
  };
}

// ---------------------------------------------------------------------------
// 3. State Queries
// ---------------------------------------------------------------------------

function isEligibleForFrontier(item) {
  return FRONTIER_ELIGIBLE_STATES.includes(item.candidateState) &&
         !POOL_EXCLUDED_STATES.includes(item.candidateState);
}

function isExcludedFromPool(item) {
  return POOL_EXCLUDED_STATES.includes(item.candidateState);
}

function needsRework(item) {
  return item.candidateState === CandidateState.REWORK;
}

function isTerminal(item) {
  return item.candidateState === CandidateState.ARCHIVED ||
         item.candidateState === CandidateState.DELIVERED;
}

// ---------------------------------------------------------------------------
// 4. Legacy Bridge
// ---------------------------------------------------------------------------
// Maps the old annotation-string-based state inference to the new enum.
// Used ONLY during the transition period. Remove after all items are migrated.

/**
 * Infers a CandidateState from legacy processingStatus + activityState fields.
 * This is the LAST time we ever parse annotation strings for state.
 *
 * @param {object} item - NBAItem with legacy fields
 * @returns {CandidateState}
 */
function inferLegacyState(item) {
  if (item.activityState === "ARCHIVED") return CandidateState.ARCHIVED;
  if (item.status === "DECLINED" || item.processingStatus === "DECLINED") return CandidateState.ARCHIVED;
  if (item.status === "COMPLETED" || item.status === "ACCEPTED") return CandidateState.DELIVERED;
  if (item.processingStatus === "VERIFIED") return CandidateState.EVALUATED;
  if (item.processingStatus === "CHECKED") return CandidateState.REFINED;
  return CandidateState.GENERATED;
}

// ---------------------------------------------------------------------------
// 5. Exports
// ---------------------------------------------------------------------------

module.exports = {
  CandidateState,
  ReworkRoute,
  FRONTIER_ELIGIBLE_STATES,
  POOL_EXCLUDED_STATES,
  toGenerated,
  toRefined,
  toEvaluated,
  toRework,
  toSuppressed,
  toArchived,
  toDelivered,
  isEligibleForFrontier,
  isExcludedFromPool,
  needsRework,
  isTerminal,
  inferLegacyState,
};
