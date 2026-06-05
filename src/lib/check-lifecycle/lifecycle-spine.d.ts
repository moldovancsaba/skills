export type LifecycleRepairReasonCode =
  | "missing_pipeline_job"
  | "missing_daemon_lane"
  | "missing_mission_definition"
  | "stale_mission_kind"
  | "stale_public_projection"
  | "paused_low_memory";

export type LifecycleHealthState =
  | "healthy"
  | "repairing"
  | "degraded"
  | "blocked"
  | "paused_low_memory";

export type VisitorContentState =
  | "fresh"
  | "stale"
  | "invalid"
  | "needs_review"
  | "retire_pending"
  | "published_verified";

export function buildProvisioningPlan(input?: {
  companyId?: string;
  destinationKeys?: string[];
  actorId?: string;
  idempotencyKey?: string;
  source?: string;
  now?: string;
}): {
  schemaVersion: number;
  type: "provisioning_plan";
  destinationKeys: string[];
  requirements: unknown;
  steps: Array<Record<string, unknown>>;
  created: unknown[];
  repaired: unknown[];
  skipped: unknown[];
  failed: unknown[];
};

export function buildMaintenanceDiff(input?: {
  destinationKeys?: string[];
  existingPipelineJobs?: string[];
  existingMissionKinds?: string[];
  unsupportedMissionKinds?: string[];
  stalePublicProjectionIds?: string[];
  memoryState?: "low" | "normal";
  pauseReason?: string;
}): {
  schemaVersion: number;
  state: LifecycleHealthState;
  reasonCode: string;
  operatorMessage: string;
  safeRepairs: unknown[];
  heavyRepairs: unknown[];
  failures: unknown[];
  metrics: { inspected: number; repaired: number; failed: number; skipped: number };
};

export function buildDestinationDaemonLane(input?: {
  destinationKeys?: string[];
  activeDefinitionIds?: string[];
  activeRunIds?: string[];
}): {
  schemaVersion: number;
  jobType: string;
  entityType: string;
  entityId: string;
  metadata: {
    destinationKeys: string[];
    missionKinds: string[];
    activeDefinitionIds: string[];
    activeRunIds: string[];
    serviceLane: "single" | "multi";
    sourceSignal: string;
  };
};

export function scoreVisitorContentHealth(input?: {
  sourceTrust?: number;
  freshness?: number;
  taxonomyFit?: number;
  evidenceCompleteness?: number;
  feedbackFit?: number;
  sourceOnly?: boolean;
  hasSourceEvidence?: boolean;
  forbiddenCategory?: boolean;
  fakeOrPlaceholder?: boolean;
  published?: boolean;
  publicVerificationFresh?: boolean;
}): {
  schemaVersion: number;
  score: number;
  state: VisitorContentState;
  publishEligible: boolean;
  hardBlocks: string[];
  recoveryAction: string;
};

export function normalizeVisitorFeedbackDecision(decision?: Record<string, unknown>): Record<string, unknown>;
export function evaluateVisitorFeedbackPolicy(input?: {
  candidate?: Record<string, unknown>;
  rules?: Array<Record<string, unknown>>;
}): {
  schemaVersion: number;
  decision: string;
  severity: string;
  matchedRules: Array<Record<string, unknown>>;
  publishEligible: boolean;
  refinementRequired: boolean;
};
export function buildLifecycleTelemetry(event: string, payload?: Record<string, unknown>): Record<string, unknown>;
