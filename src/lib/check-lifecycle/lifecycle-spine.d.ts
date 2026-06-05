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

export type PublicVerificationState =
  | "pending"
  | "verified"
  | "drift_detected"
  | "rollback_pending"
  | "rolled_back"
  | "blocked";

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

export function buildPublicVerificationProof(input?: {
  localItems?: Array<Record<string, unknown>>;
  publicItems?: Array<Record<string, unknown>>;
  readModelFresh?: boolean;
  publicAvailable?: boolean;
  autopilotRollback?: boolean;
  checkedAt?: string;
}): {
  schemaVersion: number;
  state: PublicVerificationState;
  checkedAt: string;
  readModelFresh: boolean;
  publicAvailable: boolean;
  comparedItemCount: number;
  failedItemCount: number;
  rollbackActionCount: number;
  comparisons: Array<Record<string, unknown>>;
  rollbackActions: Array<Record<string, unknown>>;
  reasonCodes: string[];
  operatorMessage: string;
};

export function buildLifecycleControlCenterView(input?: Record<string, unknown>): {
  schemaVersion: number;
  state: string;
  unit: Record<string, unknown>;
  cards: Array<Record<string, unknown>>;
  uxStates: string[];
  accessibility: Record<string, unknown>;
};

export function buildLifecycleMigrationReport(input?: Record<string, unknown>): {
  schemaVersion: number;
  dryRun: boolean;
  generatedAt: string;
  companyId: string | null;
  destinationKeys: string[];
  state: string;
  actions: Array<Record<string, unknown>>;
  safeActions: Array<Record<string, unknown>>;
  blockedActions: unknown[];
  summary: Record<string, number>;
};

export function buildLifecycleVerificationReport(input?: Record<string, unknown>): {
  schemaVersion: number;
  ok: boolean;
  generatedAt: string;
  companyId: string | null;
  destinationKeys: string[];
  checks: Array<Record<string, unknown>>;
  failedChecks: Array<Record<string, unknown>>;
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
export function buildRecoveryActionView(item?: Record<string, unknown>): Record<string, unknown>;
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
