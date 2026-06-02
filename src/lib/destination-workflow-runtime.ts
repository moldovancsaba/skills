import { prisma } from "@/lib/db";
import { DestinationWorkflowState, Prisma } from "@prisma/client";
import { ensureDestinationInstance } from "@/lib/destination-workflows";
import type { DestinationKey } from "@/lib/destination-workflow-contract";

const DEFAULT_STAGE_TIMEOUT_MS = 15 * 60 * 1000;

function asJson(value: Record<string, unknown> | null | undefined): Prisma.InputJsonValue {
  return ((value && Object.keys(value).length > 0 ? value : {}) as Prisma.InputJsonValue);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stageToState(stage: string): DestinationWorkflowState {
  switch (stage) {
    case "QUEUE_REVIEW":
      return DestinationWorkflowState.REVIEW_REQUIRED;
    case "AWAIT_DESTINATION_OUTCOME":
      return DestinationWorkflowState.PUBLISHING;
    case "COMPLETE":
      return DestinationWorkflowState.PUBLISHED;
    case "FAILED":
      return DestinationWorkflowState.FAILED;
    default:
      return DestinationWorkflowState.INGESTED;
  }
}

export async function startDestinationWorkflowRun(input: {
  companyId: string;
  destinationKey: DestinationKey;
  workflowKind: string;
  currentStage?: string;
  metadata?: Record<string, unknown> | null;
}) {
  const destinationInstance = await ensureDestinationInstance(input.companyId, input.destinationKey);
  const currentStage = input.currentStage ?? "DISCOVER_SOURCE";
  const run = await prisma.destinationWorkflowRun.create({
    data: {
      companyId: input.companyId,
      destinationInstanceId: destinationInstance.id,
      workflowKind: input.workflowKind,
      state: DestinationWorkflowState.DISCOVERED,
      currentStage,
      metadata: asJson(input.metadata),
    },
  });

  await prisma.destinationWorkflowStageEvent.create({
    data: {
      companyId: input.companyId,
      workflowRunId: run.id,
      stage: currentStage,
      status: "QUEUED",
      attempt: 1,
      metadata: asJson({ source: "startDestinationWorkflowRun" }),
    },
  });

  return run;
}

export async function getDestinationWorkflowRun(companyId: string, runId: string) {
  return prisma.destinationWorkflowRun.findFirst({
    where: { id: runId, companyId },
    include: {
      stageEvents: { orderBy: { createdAt: "asc" } },
      reviewPackets: { orderBy: { submittedAt: "desc" }, take: 5 },
      outcomeMemories: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
}

export async function recordDestinationWorkflowStageEvent(input: {
  companyId: string;
  workflowRunId: string;
  stage: string;
  status: string;
  attempt?: number;
  durationMs?: number;
  outputRefs?: Record<string, unknown> | null;
  retryable?: boolean;
  errorCode?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown> | null;
}) {
  return prisma.destinationWorkflowStageEvent.create({
    data: {
      companyId: input.companyId,
      workflowRunId: input.workflowRunId,
      stage: input.stage,
      status: input.status,
      attempt: input.attempt ?? 1,
      durationMs: input.durationMs,
      outputRefs: input.outputRefs ? asJson(input.outputRefs) : undefined,
      retryable: input.retryable ?? false,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      metadata: asJson(input.metadata),
    },
  });
}

export async function advanceDestinationWorkflowRun(input: {
  companyId: string;
  runId: string;
  nextStage: string;
  attempt?: number;
  outputRefs?: Record<string, unknown> | null;
}) {
  const run = await prisma.destinationWorkflowRun.findFirst({
    where: { id: input.runId, companyId: input.companyId },
  });
  if (!run) return null;

  const updated = await prisma.destinationWorkflowRun.update({
    where: { id: input.runId },
    data: {
      currentStage: input.nextStage,
      state: stageToState(input.nextStage),
      lastError: null,
    },
  });

  await recordDestinationWorkflowStageEvent({
    companyId: input.companyId,
    workflowRunId: input.runId,
    stage: input.nextStage,
    status: "QUEUED",
    attempt: input.attempt ?? 1,
    outputRefs: input.outputRefs ?? undefined,
    metadata: { sourceStage: run.currentStage },
  });

  return updated;
}

export async function retryDestinationWorkflowStage(input: {
  companyId: string;
  runId: string;
  stage?: string;
  reason?: string;
}) {
  const run = await prisma.destinationWorkflowRun.findFirst({
    where: { id: input.runId, companyId: input.companyId },
    include: {
      stageEvents: {
        where: { ...(input.stage ? { stage: input.stage } : { stage: input.stage ?? undefined }) },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  if (!run) return null;

  const stage = input.stage ?? run.currentStage;
  const lastAttempt = run.stageEvents[0]?.attempt ?? run.attemptCount ?? 0;

  const updated = await prisma.destinationWorkflowRun.update({
    where: { id: run.id },
    data: {
      state: stageToState(stage),
      currentStage: stage,
      attemptCount: { increment: 1 },
      lastError: null,
      metadata: asJson({ ...(run.metadata as Record<string, unknown> | null), lastRetryReason: input.reason ?? "manual-retry" }),
    },
  });

  await recordDestinationWorkflowStageEvent({
    companyId: input.companyId,
    workflowRunId: run.id,
    stage,
    status: "RETRY_QUEUED",
    attempt: lastAttempt + 1,
    retryable: true,
    metadata: { reason: input.reason ?? "manual-retry" },
  });

  return updated;
}

export async function replayDestinationWorkflowRun(input: {
  companyId: string;
  runId: string;
  fromStage: string;
  reason?: string;
}) {
  const run = await prisma.destinationWorkflowRun.findFirst({
    where: { id: input.runId, companyId: input.companyId },
  });
  if (!run) return null;

  const updated = await prisma.destinationWorkflowRun.update({
    where: { id: run.id },
    data: {
      currentStage: input.fromStage,
      state: stageToState(input.fromStage),
      lastError: null,
      metadata: asJson({
        ...(run.metadata as Record<string, unknown> | null),
        replayedFromStage: input.fromStage,
        replayReason: input.reason ?? "manual-replay",
      }),
    },
  });

  await recordDestinationWorkflowStageEvent({
    companyId: input.companyId,
    workflowRunId: run.id,
    stage: input.fromStage,
    status: "REPLAY_QUEUED",
    attempt: 1,
    retryable: true,
    metadata: { reason: input.reason ?? "manual-replay" },
  });

  return updated;
}

export async function markDestinationWorkflowOutcome(input: {
  companyId: string;
  runId: string;
  outcomeType: "COMPLETE" | "FAILED";
  errorMessage?: string;
}) {
  const state =
    input.outcomeType === "COMPLETE" ? DestinationWorkflowState.PUBLISHED : DestinationWorkflowState.FAILED;
  const updated = await prisma.destinationWorkflowRun.update({
    where: { id: input.runId },
    data: {
      state,
      currentStage: input.outcomeType === "COMPLETE" ? "COMPLETE" : "FAILED",
      lastError: input.errorMessage ?? null,
    },
  });

  await recordDestinationWorkflowStageEvent({
    companyId: input.companyId,
    workflowRunId: input.runId,
    stage: updated.currentStage,
    status: input.outcomeType,
    attempt: updated.attemptCount || 1,
    retryable: false,
    errorMessage: input.errorMessage,
  });

  return updated;
}

export async function setDestinationWorkflowReviewState(input: {
  companyId: string;
  runId: string;
  reviewState: "REVIEW_REQUIRED" | "APPROVED" | "REJECTED" | "REWORK_REQUESTED";
  notes?: string;
}) {
  const run = await prisma.destinationWorkflowRun.findFirst({
    where: { id: input.runId, companyId: input.companyId },
  });
  if (!run) return null;

  const nextStage =
    input.reviewState === "APPROVED"
      ? "AWAIT_DESTINATION_OUTCOME"
      : input.reviewState === "REJECTED"
        ? "FAILED"
        : "QUEUE_REVIEW";
  const nextState =
    input.reviewState === "APPROVED"
      ? DestinationWorkflowState.APPROVED
      : input.reviewState === "REJECTED"
        ? DestinationWorkflowState.REJECTED
        : DestinationWorkflowState.REVIEW_REQUIRED;

  const updated = await prisma.destinationWorkflowRun.update({
    where: { id: run.id },
    data: {
      currentStage: nextStage,
      state: nextState,
      lastError: input.reviewState === "REJECTED" ? input.notes ?? "Rejected during review" : null,
      metadata: asJson({
        ...(run.metadata as Record<string, unknown> | null),
        latestReviewState: input.reviewState,
        latestReviewNotes: input.notes ?? null,
      }),
    },
  });

  await recordDestinationWorkflowStageEvent({
    companyId: input.companyId,
    workflowRunId: run.id,
    stage: nextStage,
    status: input.reviewState,
    attempt: run.attemptCount || 1,
    retryable: input.reviewState !== "REJECTED",
    errorMessage: input.reviewState === "REJECTED" ? input.notes : undefined,
  });

  return updated;
}

export async function getDestinationMissionControlSummary(companyId: string, destinationKey?: DestinationKey) {
  const now = Date.now();
  const [runs, packets, outcomes, missionRuns] = await Promise.all([
    prisma.destinationWorkflowRun.findMany({
      where: {
        companyId,
        ...(destinationKey
          ? {
              destinationInstance: {
                destinationKey,
              },
            }
          : {}),
      },
      include: {
        stageEvents: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    prisma.destinationReviewPacket.findMany({
      where: {
        companyId,
        ...(destinationKey
          ? {
              destinationInstance: {
                destinationKey,
              },
            }
          : {}),
      },
      orderBy: { submittedAt: "desc" },
      take: 200,
    }),
    prisma.destinationOutcomeMemory.findMany({
      where: {
        companyId,
        ...(destinationKey
          ? {
              destinationInstance: {
                destinationKey,
              },
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.destinationMissionRun.findMany({
      where: {
        companyId,
        ...(destinationKey ? { destinationKey } : {}),
      },
      include: {
        attempts: { orderBy: { ordinal: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
  ]);

  const staleRuns = runs.filter((run) => now - run.updatedAt.getTime() > DEFAULT_STAGE_TIMEOUT_MS);
  const retryBacklog = runs.filter((run) => run.state === DestinationWorkflowState.FAILED).length;
  const callbackFailureCount = outcomes.filter((outcome) => /fail/i.test(outcome.eventType)).length;
  const topFailureCodes = Object.entries(
    runs.reduce<Record<string, number>>((acc, run) => {
      const key = run.lastError ? run.lastError.split(":")[0] : "NONE";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([code, count]) => ({ code, count }));

  const packetAges = packets.map((packet) => now - packet.submittedAt.getTime());
  const verificationRuns = missionRuns
    .map((run) => {
      const metadata = asRecord(run.metadata as Record<string, unknown> | null);
      const verification = asRecord(metadata.publishVerification);
      return {
        runId: run.id,
        state: run.state,
        destinationKey: run.destinationKey,
        failureCode: run.failureCode,
        recoveryHint: typeof metadata.recoveryHint === "string" ? metadata.recoveryHint : null,
        nextAction: typeof metadata.nextAction === "string" ? metadata.nextAction : null,
        verificationStatus:
          typeof verification?.status === "string"
            ? verification.status
            : run.state === "PUBLISHED_VERIFIED"
              ? "verified"
              : run.failureCode?.startsWith("publish_verification_")
                ? run.failureCode.replace("publish_verification_", "")
                : null,
        verificationAttempt:
          typeof verification?.attempt === "number"
            ? verification.attempt
            : null,
        verificationAttemptMax:
          typeof verification?.attemptMax === "number"
            ? verification.attemptMax
            : null,
        checkedAt:
          typeof verification?.checkedAt === "string"
            ? verification.checkedAt
            : run.updatedAt.toISOString(),
      };
    })
    .filter((run) => run.verificationStatus || run.state === "PUBLISHING" || run.failureCode?.startsWith("publish"));
  const verificationCounts = verificationRuns.reduce<Record<string, number>>((acc, run) => {
    const key = run.verificationStatus ?? "pending";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const nextRetryAction = missionRuns
    .map((run) => {
      const metadata = asRecord(run.metadata as Record<string, unknown> | null);
      return {
        runId: run.id,
        state: run.state,
        failureCode: run.failureCode,
        recoveryHint: typeof metadata.recoveryHint === "string" ? metadata.recoveryHint : null,
        nextAction: typeof metadata.nextAction === "string" ? metadata.nextAction : null,
        updatedAt: run.updatedAt.toISOString(),
      };
    })
    .find((run) => run.state === "FAILED_RECOVERABLE" || run.state === "PAUSED" || run.state === "EXHAUSTED") ?? null;

  return {
    activeRuns: runs.filter(
      (run) => run.state !== DestinationWorkflowState.PUBLISHED && run.state !== DestinationWorkflowState.REJECTED,
    ).length,
    staleRuns: staleRuns.map((run) => ({
      runId: run.id,
      currentStage: run.currentStage,
      state: run.state,
      updatedAt: run.updatedAt.toISOString(),
    })),
    retryBacklog,
    reviewQueueAging: {
      openPackets: packets.filter((packet) => packet.packetState === "AWAITING_REVIEW").length,
      oldestPacketAgeMs: packetAges.length ? Math.max(...packetAges) : 0,
    },
    callbackFailureCount,
    topFailureCodes,
    verificationHealth: {
      total: verificationRuns.length,
      verified: verificationCounts.verified ?? 0,
      retrying:
        (verificationCounts.queued ?? 0) +
        (verificationCounts.not_found ?? 0) +
        (verificationCounts.timeout ?? 0),
      failed:
        (verificationCounts.schema_mismatch ?? 0) +
        (verificationCounts.image_invalid ?? 0),
      counts: verificationCounts,
      recent: verificationRuns.slice(0, 10),
    },
    trackHealth: {
      missionRuns: missionRuns.length,
      blocked: missionRuns.filter((run) => run.state === "FAILED_RECOVERABLE" || run.state === "PAUSED").length,
      terminal: missionRuns.filter((run) =>
        run.state === "PUBLISHED_VERIFIED" || run.state === "FAILED_TERMINAL" || run.state === "EXHAUSTED",
      ).length,
    },
    nextRetryAction,
    generatedAt: new Date().toISOString(),
  };
}
