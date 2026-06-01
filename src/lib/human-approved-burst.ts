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

class HumanApprovedBurstError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "HumanApprovedBurstError";
    this.code = code;
  }
}

function assertHumanApprovedBurstRequest(request: HumanApprovedBurstRequest) {
  if (!request.approvedBy?.trim()) throw new HumanApprovedBurstError("BURST_APPROVAL_REQUIRED", "Human-Approved Burst requires an approving operator.");
  if (!request.reason?.trim()) throw new HumanApprovedBurstError("BURST_REASON_REQUIRED", "Human-Approved Burst requires a reason.");
  if (!Number.isInteger(request.requestedOutputCount) || request.requestedOutputCount <= 0) throw new HumanApprovedBurstError("BURST_OUTPUT_COUNT_INVALID", "Requested output count must be a positive integer.");
  if (!Number.isInteger(request.shardSize) || request.shardSize <= 0) throw new HumanApprovedBurstError("BURST_SHARD_SIZE_INVALID", "Shard size must be a positive integer.");
  if (!Number.isInteger(request.maxConcurrency) || request.maxConcurrency <= 0) throw new HumanApprovedBurstError("BURST_CONCURRENCY_INVALID", "Max concurrency must be a positive integer.");
  if (!Number.isFinite(request.minFreeMemoryMb) || request.minFreeMemoryMb <= 0) throw new HumanApprovedBurstError("BURST_MEMORY_THRESHOLD_INVALID", "Minimum free memory must be a positive number.");
  if (!Number.isInteger(request.timeoutSeconds) || request.timeoutSeconds <= 0) throw new HumanApprovedBurstError("BURST_TIMEOUT_INVALID", "Burst timeout must be a positive integer.");
  if (!request.target.companyId && !request.target.destinationKey && !request.target.blockKey && !request.target.moduleKey) throw new HumanApprovedBurstError("BURST_TARGET_REQUIRED", "Human-Approved Burst requires a concrete target scope.");
}

function splitBurstIntoShardCounts(requestedOutputCount: number, shardSize: number) {
  const shards: number[] = [];
  let remaining = requestedOutputCount;
  while (remaining > 0) {
    const next = Math.min(shardSize, remaining);
    shards.push(next);
    remaining -= next;
  }
  return shards;
}

export type HumanApprovedBurstChildPlan = {
  parentBurstId: string;
  childIndex: number;
  childCount: number;
  requestedOutputCount: number;
  jobType: "DESTINATION_MISSION_DAEMON";
  entityType: "PIPELINE_SLICE";
  entityId: string;
  queueColumn: "NOW";
  priorityScore: number;
  reason: string;
  metadata: {
    lane: "HUMAN_APPROVED_BURST_CHILD";
    parentBurstId: string;
    approval: {
      approvedBy: string;
      reason: string;
      approvedAt: string;
    };
    target: HumanApprovedBurstRequest["target"];
    burst: {
      childIndex: number;
      childCount: number;
      requestedOutputCount: number;
      maxConcurrency: number;
      minFreeMemoryMb: number;
      timeoutSeconds: number;
      rollbackMode: HumanApprovedBurstRequest["rollbackMode"];
    };
    executionOptions: {
      profile: "minimal";
      batchLimitOverride: number;
      disableResearchBackfill: false;
      countOverrides: null;
      selectionOffset: number;
    };
  };
};

export function buildHumanApprovedBurstChildPlans(input: {
  parentBurstId: string;
  request: HumanApprovedBurstRequest;
  approvedAt?: string;
}): HumanApprovedBurstChildPlan[] {
  assertHumanApprovedBurstRequest(input.request);
  if (!input.parentBurstId.trim()) {
    throw new Error("Human-Approved Burst child plans require parentBurstId.");
  }

  const approvedAt = input.approvedAt ?? new Date().toISOString();
  const shardCounts = splitBurstIntoShardCounts(input.request.requestedOutputCount, input.request.shardSize);

  return shardCounts.map((requestedOutputCount, childIndex) => {
    const entityId = `${input.parentBurstId}:burst-slice:${childIndex + 1}`;
    return {
      parentBurstId: input.parentBurstId,
      childIndex,
      childCount: shardCounts.length,
      requestedOutputCount,
      jobType: "DESTINATION_MISSION_DAEMON",
      entityType: "PIPELINE_SLICE",
      entityId,
      queueColumn: "NOW",
      priorityScore: Math.max(120, 180 - childIndex),
      reason: `Human-approved burst child ${childIndex + 1}/${shardCounts.length}: ${input.request.reason}`,
      metadata: {
        lane: "HUMAN_APPROVED_BURST_CHILD",
        parentBurstId: input.parentBurstId,
        approval: {
          approvedBy: input.request.approvedBy,
          reason: input.request.reason,
          approvedAt,
        },
        target: input.request.target,
        burst: {
          childIndex,
          childCount: shardCounts.length,
          requestedOutputCount,
          maxConcurrency: input.request.maxConcurrency,
          minFreeMemoryMb: input.request.minFreeMemoryMb,
          timeoutSeconds: input.request.timeoutSeconds,
          rollbackMode: input.request.rollbackMode,
        },
        executionOptions: {
          profile: "minimal",
          batchLimitOverride: requestedOutputCount,
          disableResearchBackfill: false,
          countOverrides: null,
          selectionOffset: childIndex * input.request.shardSize,
        },
      },
    };
  });
}

export async function createHumanApprovedBurstChildJobs(prisma: any, input: {
  companyId: string;
  parentBurstId: string;
  request: HumanApprovedBurstRequest;
}) {
  const plans = buildHumanApprovedBurstChildPlans({ parentBurstId: input.parentBurstId, request: input.request });
  const destinationKey = input.request.target.destinationKey;
  const created = [];

  for (const plan of plans) {
    created.push(await prisma.pipelineJob.create({
      data: {
        companyId: input.companyId,
        jobType: plan.jobType,
        entityType: plan.entityType,
        entityId: plan.entityId,
        status: "ACTIVE",
        controlMode: "AI_ONLY",
        queueColumn: plan.queueColumn,
        manualSortOrder: 0,
        priorityScore: plan.priorityScore,
        reason: plan.reason,
        sourceSignal: `human-approved-burst:${input.parentBurstId}`,
        metadata: {
          ...plan.metadata,
          destinationKey,
        },
      },
    }));
  }

  return created;
}
