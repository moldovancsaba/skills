export const LOCAL_EXECUTION_LANES = ["SYSTEM_HEALTH", "PLAYLIST", "HUMAN_APPROVED_BURST"] as const;

export type LocalExecutionLane = (typeof LOCAL_EXECUTION_LANES)[number];

export const SYSTEM_HEALTH_ACTIONS = [
  "WORKER_HEARTBEAT",
  "MEMORY_GUARD",
  "STALE_JOB_RECOVERY",
  "QUEUE_TOPOLOGY_REPAIR",
  "ORPHAN_PROCESS_CLEANUP",
  "LOCAL_MODEL_UNLOAD",
  "CONNECTIVITY_CHECK",
  "LIFECYCLE_VERIFICATION",
  "PROJECTION_TRUTH_REPAIR",
  "SERVICE_RESTART",
  "SERVICE_KILL",
] as const;

export type SystemHealthAction = (typeof SYSTEM_HEALTH_ACTIONS)[number];

export type SystemHealthActionContext = {
  action: string;
  humanName: string;
  reason: string;
  requestedBy: "system" | "operator";
  mutatesBusinessContent?: boolean;
  timeoutMs?: number;
};

export type MutationAuthorityContext = {
  lane: "PLAYLIST" | "HUMAN_APPROVED_BURST_CHILD";
  jobId: string;
  actor: "local-worker" | "burst-controller";
  companyId?: string;
  destinationKey?: string;
  parentBurstId?: string;
};

export type PlaylistMutationCategory =
  | "CARD_CONTENT"
  | "MINIAPP_CONTENT"
  | "OPPORTUNITYCARD"
  | "RESEARCH_EVIDENCE"
  | "DESTINATION_MISSION"
  | "QUEUE_STATE"
  | "UNIT_CONFIGURATION";

export type PlaylistMutationPolicy = {
  category: PlaylistMutationCategory;
  requiresQueueJob: boolean;
  allowedLanes: MutationAuthorityContext["lane"][];
  idempotencyRequired: boolean;
  timeoutMs: number;
  retryLimit: number;
  rollbackMode: "REPLAY_JOB" | "PARK_AND_REVIEW" | "REVERT_CONFIG" | "REBUILD_PROJECTION";
};

export type QueuedMutationResponse = {
  queued: true;
  jobId: string;
  lane: "PLAYLIST";
  category: PlaylistMutationCategory;
  message: string;
};

export type HumanApprovedBurstRequest = {
  approvedBy: string;
  reason: string;
  requestedOutputCount: number;
  shardSize: number;
  maxConcurrency: number;
  minFreeMemoryMb: number;
  timeoutSeconds: number;
  target: {
    companyId?: string;
    destinationKey?: string;
    blockKey?: string;
    moduleKey?: string;
  };
  rollbackMode: "REWORK_CHILD_OUTPUTS" | "PARK_CHILD_JOBS";
};

export const PLAYLIST_MUTATION_POLICIES: Record<PlaylistMutationCategory, PlaylistMutationPolicy> = {
  CARD_CONTENT: {
    category: "CARD_CONTENT",
    requiresQueueJob: true,
    allowedLanes: ["PLAYLIST", "HUMAN_APPROVED_BURST_CHILD"],
    idempotencyRequired: true,
    timeoutMs: 10 * 60 * 1000,
    retryLimit: 4,
    rollbackMode: "REPLAY_JOB",
  },
  MINIAPP_CONTENT: {
    category: "MINIAPP_CONTENT",
    requiresQueueJob: true,
    allowedLanes: ["PLAYLIST", "HUMAN_APPROVED_BURST_CHILD"],
    idempotencyRequired: true,
    timeoutMs: 15 * 60 * 1000,
    retryLimit: 4,
    rollbackMode: "PARK_AND_REVIEW",
  },
  OPPORTUNITYCARD: {
    category: "OPPORTUNITYCARD",
    requiresQueueJob: true,
    allowedLanes: ["PLAYLIST", "HUMAN_APPROVED_BURST_CHILD"],
    idempotencyRequired: true,
    timeoutMs: 10 * 60 * 1000,
    retryLimit: 4,
    rollbackMode: "REPLAY_JOB",
  },
  RESEARCH_EVIDENCE: {
    category: "RESEARCH_EVIDENCE",
    requiresQueueJob: true,
    allowedLanes: ["PLAYLIST", "HUMAN_APPROVED_BURST_CHILD"],
    idempotencyRequired: true,
    timeoutMs: 20 * 60 * 1000,
    retryLimit: 4,
    rollbackMode: "PARK_AND_REVIEW",
  },
  DESTINATION_MISSION: {
    category: "DESTINATION_MISSION",
    requiresQueueJob: true,
    allowedLanes: ["PLAYLIST", "HUMAN_APPROVED_BURST_CHILD"],
    idempotencyRequired: true,
    timeoutMs: 20 * 60 * 1000,
    retryLimit: 4,
    rollbackMode: "PARK_AND_REVIEW",
  },
  QUEUE_STATE: {
    category: "QUEUE_STATE",
    requiresQueueJob: true,
    allowedLanes: ["PLAYLIST"],
    idempotencyRequired: true,
    timeoutMs: 60 * 1000,
    retryLimit: 3,
    rollbackMode: "REBUILD_PROJECTION",
  },
  UNIT_CONFIGURATION: {
    category: "UNIT_CONFIGURATION",
    requiresQueueJob: true,
    allowedLanes: ["PLAYLIST"],
    idempotencyRequired: true,
    timeoutMs: 2 * 60 * 1000,
    retryLimit: 3,
    rollbackMode: "REVERT_CONFIG",
  },
};

export class LocalExecutionLaneError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "LocalExecutionLaneError";
    this.code = code;
  }
}

export function isSystemHealthAction(action: string): action is SystemHealthAction {
  return (SYSTEM_HEALTH_ACTIONS as readonly string[]).includes(action);
}

export function assertSystemHealthAction(context: SystemHealthActionContext): asserts context is SystemHealthActionContext & { action: SystemHealthAction } {
  if (!isSystemHealthAction(context.action)) {
    throw new LocalExecutionLaneError("INVALID_SYSTEM_HEALTH_ACTION", `Unsupported System Health action: ${context.action}`);
  }

  if (!context.humanName?.trim()) {
    throw new LocalExecutionLaneError("SYSTEM_HEALTH_NAME_REQUIRED", "System Health actions must have a human-readable name.");
  }

  if (!context.reason?.trim()) {
    throw new LocalExecutionLaneError("SYSTEM_HEALTH_REASON_REQUIRED", "System Health actions must include an execution reason.");
  }

  if (context.mutatesBusinessContent) {
    throw new LocalExecutionLaneError("SYSTEM_HEALTH_CONTENT_MUTATION_FORBIDDEN", "System Health actions must not mutate business or public content.");
  }

  if (context.timeoutMs !== undefined && (!Number.isFinite(context.timeoutMs) || context.timeoutMs <= 0)) {
    throw new LocalExecutionLaneError("SYSTEM_HEALTH_TIMEOUT_INVALID", "System Health timeout must be a positive finite number.");
  }
}

export function assertPlaylistMutationAuthority(context: MutationAuthorityContext | null | undefined): asserts context is MutationAuthorityContext {
  if (!context) {
    throw new LocalExecutionLaneError("MUTATION_AUTHORITY_REQUIRED", "Business mutation requires Playlist or Burst child authority.");
  }

  if (context.lane !== "PLAYLIST" && context.lane !== "HUMAN_APPROVED_BURST_CHILD") {
    throw new LocalExecutionLaneError("MUTATION_LANE_INVALID", "Business mutation must run under Playlist or Human-Approved Burst child lane.");
  }

  if (!context.jobId?.trim()) {
    throw new LocalExecutionLaneError("MUTATION_JOB_REQUIRED", "Business mutation requires a persisted queue job id.");
  }

  if (context.lane === "HUMAN_APPROVED_BURST_CHILD" && !context.parentBurstId?.trim()) {
    throw new LocalExecutionLaneError("BURST_CHILD_PARENT_REQUIRED", "Burst child mutation requires a parent burst id.");
  }
}

export function assertPlaylistMutationPolicy(
  category: PlaylistMutationCategory,
  context: MutationAuthorityContext | null | undefined,
): asserts context is MutationAuthorityContext {
  const policy = PLAYLIST_MUTATION_POLICIES[category];
  if (!policy) {
    throw new LocalExecutionLaneError("MUTATION_CATEGORY_INVALID", `Unsupported mutation category: ${category}`);
  }
  assertPlaylistMutationAuthority(context);
  if (!policy.allowedLanes.includes(context.lane)) {
    throw new LocalExecutionLaneError(
      "MUTATION_CATEGORY_LANE_INVALID",
      `Mutation category ${category} cannot run under ${context.lane}.`,
    );
  }
}

export function buildQueuedMutationResponse(input: {
  jobId: string;
  category: PlaylistMutationCategory;
  message?: string;
}): QueuedMutationResponse {
  if (!input.jobId?.trim()) {
    throw new LocalExecutionLaneError("MUTATION_JOB_REQUIRED", "Queued mutation response requires a persisted queue job id.");
  }
  if (!PLAYLIST_MUTATION_POLICIES[input.category]) {
    throw new LocalExecutionLaneError("MUTATION_CATEGORY_INVALID", `Unsupported mutation category: ${input.category}`);
  }
  return {
    queued: true,
    jobId: input.jobId,
    lane: "PLAYLIST",
    category: input.category,
    message: input.message || "Work was queued for CHECK Local.",
  };
}

export function assertHumanApprovedBurstRequest(request: HumanApprovedBurstRequest) {
  if (!request.approvedBy?.trim()) {
    throw new LocalExecutionLaneError("BURST_APPROVAL_REQUIRED", "Human-Approved Burst requires an approving operator.");
  }

  if (!request.reason?.trim()) {
    throw new LocalExecutionLaneError("BURST_REASON_REQUIRED", "Human-Approved Burst requires a reason.");
  }

  if (!Number.isInteger(request.requestedOutputCount) || request.requestedOutputCount <= 0) {
    throw new LocalExecutionLaneError("BURST_OUTPUT_COUNT_INVALID", "Requested output count must be a positive integer.");
  }

  if (!Number.isInteger(request.shardSize) || request.shardSize <= 0) {
    throw new LocalExecutionLaneError("BURST_SHARD_SIZE_INVALID", "Shard size must be a positive integer.");
  }

  if (!Number.isInteger(request.maxConcurrency) || request.maxConcurrency <= 0) {
    throw new LocalExecutionLaneError("BURST_CONCURRENCY_INVALID", "Max concurrency must be a positive integer.");
  }

  if (!Number.isFinite(request.minFreeMemoryMb) || request.minFreeMemoryMb <= 0) {
    throw new LocalExecutionLaneError("BURST_MEMORY_THRESHOLD_INVALID", "Minimum free memory must be a positive number.");
  }

  if (!Number.isInteger(request.timeoutSeconds) || request.timeoutSeconds <= 0) {
    throw new LocalExecutionLaneError("BURST_TIMEOUT_INVALID", "Burst timeout must be a positive integer.");
  }

  if (!request.target.companyId && !request.target.destinationKey && !request.target.blockKey && !request.target.moduleKey) {
    throw new LocalExecutionLaneError("BURST_TARGET_REQUIRED", "Human-Approved Burst requires a concrete target scope.");
  }
}

export function splitBurstIntoShardCounts(requestedOutputCount: number, shardSize: number) {
  if (!Number.isInteger(requestedOutputCount) || requestedOutputCount <= 0) {
    throw new LocalExecutionLaneError("BURST_OUTPUT_COUNT_INVALID", "Requested output count must be a positive integer.");
  }

  if (!Number.isInteger(shardSize) || shardSize <= 0) {
    throw new LocalExecutionLaneError("BURST_SHARD_SIZE_INVALID", "Shard size must be a positive integer.");
  }

  const shards: number[] = [];
  let remaining = requestedOutputCount;
  while (remaining > 0) {
    const next = Math.min(shardSize, remaining);
    shards.push(next);
    remaining -= next;
  }
  return shards;
}
