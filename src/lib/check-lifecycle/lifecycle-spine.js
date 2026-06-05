const {
  getDestinationDaemonJobIdentity,
  getDestinationMissionKinds,
  getUnitLifecycleRequirements,
} = require("./topology-registry");

const LIFECYCLE_SPINE_VERSION = 1;

const MAINTENANCE_REASON_CODES = Object.freeze({
  MISSING_PIPELINE_JOB: "missing_pipeline_job",
  MISSING_DAEMON_LANE: "missing_daemon_lane",
  MISSING_MISSION_DEFINITION: "missing_mission_definition",
  STALE_MISSION_KIND: "stale_mission_kind",
  STALE_PUBLIC_PROJECTION: "stale_public_projection",
  PAUSED_LOW_MEMORY: "paused_low_memory",
});

const VISITOR_CONTENT_STATES = Object.freeze({
  FRESH: "fresh",
  STALE: "stale",
  INVALID: "invalid",
  NEEDS_REVIEW: "needs_review",
  RETIRE_PENDING: "retire_pending",
  PUBLISHED_VERIFIED: "published_verified",
});

const FEEDBACK_SEVERITY_ORDER = Object.freeze({
  warn: 1,
  require_review: 2,
  retire: 3,
  block: 4,
});

function unique(values) {
  return Array.from(new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean)));
}

function toSet(values) {
  return new Set(unique(values));
}

function normalizeDestinationKeys(destinationKeys) {
  return unique(destinationKeys).map((value) => value.toLowerCase());
}

function buildProvisioningPlan(input = {}) {
  const destinationKeys = normalizeDestinationKeys(input.destinationKeys);
  const requirements = getUnitLifecycleRequirements({ destinationKeys });
  const now = input.now || new Date().toISOString();
  const actorId = input.actorId || "lifecycle-provisioning";

  const steps = [
    {
      id: "unit",
      operation: "upsert_unit",
      status: "pending",
      retryable: true,
      rollback: "delete_or_disable_unit_if_no_external_content_was_published",
      summary: "Create or verify CHECK Unit company record.",
      metadata: { companyId: input.companyId || null, actorId, idempotencyKey: input.idempotencyKey || null },
    },
    ...requirements.requiredPipelineJobs.map((jobType) => ({
      id: `pipeline-job:${jobType}`,
      operation: "ensure_pipeline_job",
      status: "pending",
      retryable: true,
      rollback: "mark_topology_dirty_and_rerun_sync",
      summary: `Ensure ${jobType} pipeline job exists for the Unit.`,
      metadata: { jobType },
    })),
  ];

  for (const destinationKey of destinationKeys) {
    steps.push({
      id: `destination:${destinationKey}`,
      operation: "ensure_destination_instance",
      status: "pending",
      retryable: true,
      rollback: "deactivate_destination_instance",
      summary: `Create or verify active ${destinationKey} destination instance.`,
      metadata: { destinationKey },
    });

    for (const missionKind of getDestinationMissionKinds(destinationKey)) {
      steps.push({
        id: `mission:${destinationKey}:${missionKind}`,
        operation: "ensure_mission_definition",
        status: "pending",
        retryable: true,
        rollback: "pause_or_archive_mission_definition",
        summary: `Create or verify active ${missionKind} mission definition for ${destinationKey}.`,
        metadata: { destinationKey, missionKind },
      });
    }
  }

  steps.push(
    {
      id: "topology-dirty",
      operation: "mark_topology_dirty",
      status: "pending",
      retryable: true,
      rollback: "rerun_lifecycle_maintenance",
      summary: "Mark topology and projections dirty after provisioning mutation.",
      metadata: { reason: "lifecycle-provisioning", at: now },
    },
    {
      id: "audit-event",
      operation: "record_lifecycle_audit_event",
      status: "pending",
      retryable: false,
      rollback: "append_compensating_audit_event",
      summary: "Record provisioning audit event with actor, idempotency key, and recovery hint.",
      metadata: { actorId, source: input.source || "provisioning-engine", at: now },
    },
  );

  return {
    schemaVersion: LIFECYCLE_SPINE_VERSION,
    type: "provisioning_plan",
    destinationKeys,
    requirements,
    steps,
    created: [],
    repaired: [],
    skipped: [],
    failed: [],
  };
}

function buildMaintenanceDiff(input = {}) {
  const destinationKeys = normalizeDestinationKeys(input.destinationKeys);
  const requirements = getUnitLifecycleRequirements({ destinationKeys });
  const existingJobs = toSet(input.existingPipelineJobs);
  const existingMissionKinds = toSet(input.existingMissionKinds);
  const safeRepairs = [];
  const heavyRepairs = [];
  const failures = [];

  if (input.memoryState === "low" || input.pauseReason === MAINTENANCE_REASON_CODES.PAUSED_LOW_MEMORY) {
    return {
      schemaVersion: LIFECYCLE_SPINE_VERSION,
      state: "paused_low_memory",
      reasonCode: MAINTENANCE_REASON_CODES.PAUSED_LOW_MEMORY,
      operatorMessage: "Lifecycle maintenance paused because local memory is below the safe execution band.",
      safeRepairs,
      heavyRepairs,
      failures,
      metrics: { inspected: 0, repaired: 0, failed: 0, skipped: requirements.requiredPipelineJobs.length },
    };
  }

  for (const jobType of requirements.requiredPipelineJobs) {
    if (!existingJobs.has(jobType)) {
      safeRepairs.push({
        reasonCode: MAINTENANCE_REASON_CODES.MISSING_PIPELINE_JOB,
        operation: "ensure_pipeline_job",
        retryable: true,
        summary: `Repair missing ${jobType} pipeline job.`,
        metadata: { jobType },
      });
    }
  }

  for (const missionKind of requirements.requiredMissionKinds) {
    if (!existingMissionKinds.has(missionKind)) {
      safeRepairs.push({
        reasonCode: MAINTENANCE_REASON_CODES.MISSING_MISSION_DEFINITION,
        operation: "ensure_mission_definition",
        retryable: true,
        summary: `Repair missing ${missionKind} destination mission definition.`,
        metadata: { missionKind },
      });
    }
  }

  for (const missionKind of unique(input.unsupportedMissionKinds)) {
    failures.push({
      reasonCode: MAINTENANCE_REASON_CODES.STALE_MISSION_KIND,
      retryable: false,
      recovery: "Run lifecycle migration/backfill before scheduling this mission.",
      summary: `Unsupported mission kind ${missionKind} must be migrated before execution.`,
      metadata: { missionKind },
    });
  }

  for (const contentId of unique(input.stalePublicProjectionIds)) {
    heavyRepairs.push({
      reasonCode: MAINTENANCE_REASON_CODES.STALE_PUBLIC_PROJECTION,
      operation: "enqueue_public_verification",
      retryable: true,
      summary: "Queue public verification for stale Visitor projection.",
      metadata: { contentId },
    });
  }

  const state = failures.length > 0
    ? "blocked"
    : safeRepairs.length > 0 || heavyRepairs.length > 0
      ? "repairing"
      : "healthy";

  return {
    schemaVersion: LIFECYCLE_SPINE_VERSION,
    state,
    reasonCode: state === "healthy" ? "lifecycle_healthy" : "lifecycle_diff_detected",
    operatorMessage: state === "healthy"
      ? "Lifecycle requirements are satisfied."
      : "Lifecycle maintenance found repairable or blocked drift.",
    safeRepairs,
    heavyRepairs,
    failures,
    metrics: {
      inspected: requirements.requiredPipelineJobs.length + requirements.requiredMissionKinds.length,
      repaired: safeRepairs.length + heavyRepairs.length,
      failed: failures.length,
      skipped: 0,
    },
  };
}

function buildDestinationDaemonLane(input = {}) {
  const destinationKeys = normalizeDestinationKeys(input.destinationKeys);
  const missionKinds = unique(destinationKeys.flatMap((destinationKey) => getDestinationMissionKinds(destinationKey)));
  const identity = getDestinationDaemonJobIdentity();
  return {
    schemaVersion: LIFECYCLE_SPINE_VERSION,
    ...identity,
    metadata: {
      destinationKeys,
      missionKinds,
      activeDefinitionIds: unique(input.activeDefinitionIds),
      activeRunIds: unique(input.activeRunIds),
      serviceLane: destinationKeys.length > 1 ? "multi" : "single",
      sourceSignal: destinationKeys.length
        ? `Destination daemon lane covers ${destinationKeys.join(", ")} for ${missionKinds.join(", ")}.`
        : "Destination daemon lane has no active destinations.",
    },
  };
}

function scoreVisitorContentHealth(input = {}) {
  const hardBlocks = [];
  if (input.sourceOnly === true) hardBlocks.push("source_only_record");
  if (input.hasSourceEvidence === false) hardBlocks.push("missing_source_evidence");
  if (input.forbiddenCategory === true) hardBlocks.push("forbidden_category");
  if (input.fakeOrPlaceholder === true) hardBlocks.push("fake_or_placeholder_content");

  const score = hardBlocks.length > 0
    ? 0
    : Math.round(
      100 * (
        0.35 * Number(input.sourceTrust || 0)
        + 0.25 * Number(input.freshness || 0)
        + 0.20 * Number(input.taxonomyFit || 0)
        + 0.15 * Number(input.evidenceCompleteness || 0)
        + 0.05 * Number(input.feedbackFit || 0)
      ),
    );

  const state = hardBlocks.length > 0
    ? VISITOR_CONTENT_STATES.INVALID
    : input.published === true && input.publicVerificationFresh === true
      ? VISITOR_CONTENT_STATES.PUBLISHED_VERIFIED
      : score >= 80
        ? VISITOR_CONTENT_STATES.FRESH
        : score >= 55
          ? VISITOR_CONTENT_STATES.NEEDS_REVIEW
          : VISITOR_CONTENT_STATES.STALE;

  return {
    schemaVersion: LIFECYCLE_SPINE_VERSION,
    score,
    state,
    publishEligible: hardBlocks.length === 0 && score >= 80,
    hardBlocks,
    recoveryAction: hardBlocks.length > 0
      ? "repair_evidence_or_retire_content"
      : score >= 80
        ? "verify_or_publish"
        : "queue_maintenance_review",
  };
}

function normalizeVisitorFeedbackDecision(decision = {}) {
  const severity = FEEDBACK_SEVERITY_ORDER[decision.severity] ? decision.severity : "require_review";
  const appliesTo = unique(decision.appliesTo && decision.appliesTo.length ? decision.appliesTo : ["candidate", "published_content"]);
  return {
    schemaVersion: LIFECYCLE_SPINE_VERSION,
    ruleType: decision.ruleType || "audience_mismatch",
    severity,
    appliesTo,
    category: decision.category || null,
    audience: decision.audience || null,
    source: decision.source || null,
    examples: unique(decision.examples),
    counterexamples: unique(decision.counterexamples),
    actorId: decision.actorId || "unknown",
    reason: decision.reason || "Operator feedback converted to lifecycle policy.",
  };
}

function evaluateVisitorFeedbackPolicy(input = {}) {
  const candidate = input.candidate || {};
  const rules = Array.isArray(input.rules) ? input.rules : [];
  const matchedRules = rules.filter((rule) => {
    if (rule.category && candidate.category && rule.category !== candidate.category) return false;
    if (rule.audience && candidate.audience && rule.audience !== candidate.audience) return false;
    if (rule.source && candidate.source && rule.source !== candidate.source) return false;
    return true;
  });

  const highest = matchedRules.reduce((current, rule) => {
    const value = FEEDBACK_SEVERITY_ORDER[rule.severity] || 0;
    return value > current.value ? { value, severity: rule.severity } : current;
  }, { value: 0, severity: "none" });

  const decision = highest.severity === "block"
    ? "blocked"
    : highest.severity === "retire"
      ? "retire_pending"
      : highest.severity === "require_review"
        ? "requires_human_review"
        : highest.severity === "warn"
          ? "warn"
          : "allowed";

  return {
    schemaVersion: LIFECYCLE_SPINE_VERSION,
    decision,
    severity: highest.severity,
    matchedRules,
    publishEligible: decision === "allowed" || decision === "warn",
    refinementRequired: decision !== "allowed",
  };
}

function buildLifecycleTelemetry(event, payload = {}) {
  return {
    event,
    schemaVersion: LIFECYCLE_SPINE_VERSION,
    unitId: payload.unitId || payload.companyId || null,
    companyId: payload.companyId || null,
    destinationKeys: normalizeDestinationKeys(payload.destinationKeys),
    reasonCode: payload.reasonCode || "lifecycle_event",
    retryable: payload.retryable !== false,
    recovered: payload.recovered === true,
    metrics: payload.metrics || {},
  };
}

module.exports = {
  FEEDBACK_SEVERITY_ORDER,
  LIFECYCLE_SPINE_VERSION,
  MAINTENANCE_REASON_CODES,
  VISITOR_CONTENT_STATES,
  buildDestinationDaemonLane,
  buildLifecycleTelemetry,
  buildMaintenanceDiff,
  buildProvisioningPlan,
  evaluateVisitorFeedbackPolicy,
  normalizeVisitorFeedbackDecision,
  scoreVisitorContentHealth,
};
