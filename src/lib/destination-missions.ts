import { DestinationMissionState, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ensureDestinationInstance } from "@/lib/destination-workflows";
import type { DestinationKey } from "@/lib/destination-workflow-contract";
import {
  DEFAULT_CLASSSCOUT_RULEBOOK_POLICY,
  type DestinationMissionAttemptOutcome,
  type DestinationMissionKind,
  type DestinationRulebookPolicySnapshot,
} from "@/lib/destination-mission-contract";

function asJson(value: Record<string, unknown> | null | undefined): Prisma.InputJsonValue {
  return ((value && Object.keys(value).length > 0 ? value : {}) as Prisma.InputJsonValue);
}

function toMissionState(
  value: DestinationMissionState | keyof typeof DestinationMissionState,
): DestinationMissionState {
  if (typeof value === "string" && value in DestinationMissionState) {
    return DestinationMissionState[value as keyof typeof DestinationMissionState];
  }
  return value as DestinationMissionState;
}

function normalizePolicySnapshot(
  destinationKey: DestinationKey,
  value?: Partial<DestinationRulebookPolicySnapshot> | null,
): DestinationRulebookPolicySnapshot {
  const base = destinationKey === "classscout" ? DEFAULT_CLASSSCOUT_RULEBOOK_POLICY : DEFAULT_CLASSSCOUT_RULEBOOK_POLICY;
  return {
    ...base,
    ...(value ?? {}),
    allowedListingTypes: Array.isArray(value?.allowedListingTypes) && value?.allowedListingTypes.length > 0
      ? value.allowedListingTypes
      : base.allowedListingTypes,
    stopCondition: "one_live_verified_listing",
  };
}

function canTransitionMissionState(current: DestinationMissionState, next: DestinationMissionState) {
  if (current === next) return true;
  const allowed: Record<DestinationMissionState, DestinationMissionState[]> = {
    QUEUED: ["CATALOG_INSPECTED", "DISCOVERING", "PAUSED", "FAILED_RECOVERABLE", "FAILED_TERMINAL"],
    CATALOG_INSPECTED: ["DISCOVERING", "PAUSED", "FAILED_RECOVERABLE", "FAILED_TERMINAL"],
    DISCOVERING: ["CANDIDATE_IN_REVIEW", "PUBLISHING", "EXHAUSTED", "PAUSED", "FAILED_RECOVERABLE", "FAILED_TERMINAL"],
    CANDIDATE_IN_REVIEW: ["DISCOVERING", "PUBLISHING", "PAUSED", "FAILED_RECOVERABLE", "FAILED_TERMINAL"],
    PUBLISHING: ["PUBLISHED_VERIFIED", "DISCOVERING", "FAILED_RECOVERABLE", "FAILED_TERMINAL", "PAUSED"],
    PUBLISHED_VERIFIED: [],
    FAILED_RECOVERABLE: ["DISCOVERING", "PAUSED", "FAILED_TERMINAL"],
    FAILED_TERMINAL: [],
    EXHAUSTED: [],
    PAUSED: ["DISCOVERING", "CATALOG_INSPECTED", "FAILED_RECOVERABLE", "FAILED_TERMINAL"],
  };
  return allowed[current]?.includes(next) ?? false;
}

export async function startDestinationMissionRun(input: {
  companyId: string;
  destinationKey: DestinationKey;
  missionKind: DestinationMissionKind;
  policySnapshot?: Partial<DestinationRulebookPolicySnapshot> | null;
  metadata?: Record<string, unknown> | null;
}) {
  const destinationInstance = await ensureDestinationInstance(input.companyId, input.destinationKey);
  const policy = normalizePolicySnapshot(input.destinationKey, input.policySnapshot);

  return prisma.$transaction(async (tx) => {
    const policySnapshot = await tx.destinationMissionPolicySnapshot.create({
      data: {
        companyId: input.companyId,
        destinationInstanceId: destinationInstance.id,
        destinationKey: input.destinationKey,
        missionKind: input.missionKind,
        version: policy.version,
        policyJson: policy as unknown as Prisma.InputJsonValue,
        metadata: asJson(input.metadata),
      },
    });

    const missionRun = await tx.destinationMissionRun.create({
      data: {
        companyId: input.companyId,
        destinationInstanceId: destinationInstance.id,
        policySnapshotId: policySnapshot.id,
        destinationKey: input.destinationKey,
        missionKind: input.missionKind,
        state: DestinationMissionState.QUEUED,
        metadata: asJson(input.metadata),
      },
    });

    const firstAttempt = await tx.destinationMissionAttempt.create({
      data: {
        companyId: input.companyId,
        destinationInstanceId: destinationInstance.id,
        missionRunId: missionRun.id,
        ordinal: 1,
        state: "queued",
        metadata: asJson({ source: "startDestinationMissionRun" }),
      },
    });

    return tx.destinationMissionRun.update({
      where: { id: missionRun.id },
      data: {
        activeAttemptId: firstAttempt.id,
        attemptCount: 1,
      },
      include: {
        policySnapshot: true,
        attempts: { orderBy: { ordinal: "asc" } },
      },
    });
  });
}

export async function listDestinationMissionRuns(input: {
  companyId: string;
  destinationKey?: DestinationKey;
  missionKind?: DestinationMissionKind;
}) {
  return prisma.destinationMissionRun.findMany({
    where: {
      companyId: input.companyId,
      ...(input.destinationKey ? { destinationKey: input.destinationKey } : {}),
      ...(input.missionKind ? { missionKind: input.missionKind } : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      policySnapshot: true,
      attempts: { orderBy: { ordinal: "asc" }, take: 10 },
    },
  });
}

export async function getDestinationMissionRun(companyId: string, missionId: string) {
  return prisma.destinationMissionRun.findFirst({
    where: { id: missionId, companyId },
    include: {
      policySnapshot: true,
      attempts: { orderBy: { ordinal: "asc" } },
    },
  });
}

export async function transitionDestinationMissionState(input: {
  companyId: string;
  missionId: string;
  nextState: DestinationMissionState | keyof typeof DestinationMissionState;
  metadata?: Record<string, unknown> | null;
  failureCode?: string | null;
  failureDetail?: string | null;
}) {
  const mission = await prisma.destinationMissionRun.findFirst({
    where: { id: input.missionId, companyId: input.companyId },
  });
  if (!mission) return null;
  const nextState = toMissionState(input.nextState);
  if (!canTransitionMissionState(mission.state, nextState)) {
    throw new Error(`Illegal mission state transition: ${mission.state} -> ${nextState}`);
  }

  const mergedMetadata = {
    ...((mission.metadata as Record<string, unknown> | null) ?? {}),
    ...((input.metadata as Record<string, unknown> | null) ?? {}),
  };

  return prisma.destinationMissionRun.update({
    where: { id: mission.id },
    data: {
      state: nextState,
      failureCode: input.failureCode ?? mission.failureCode,
      failureDetail: input.failureDetail ?? mission.failureDetail,
      metadata: asJson(mergedMetadata),
    },
    include: {
      policySnapshot: true,
      attempts: { orderBy: { ordinal: "asc" } },
    },
  });
}

export async function claimDestinationMissionAttempt(input: {
  companyId: string;
  missionId: string;
  candidateId?: string | null;
  workflowRunId?: string | null;
  candidateFingerprint?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  return prisma.$transaction(async (tx) => {
    const mission = await tx.destinationMissionRun.findFirst({
      where: { id: input.missionId, companyId: input.companyId },
      include: {
        attempts: { orderBy: { ordinal: "desc" }, take: 1 },
      },
    });
    if (!mission) return null;

    const currentAttempt = mission.attempts[0] ?? null;
    if (!currentAttempt) return null;

    const mergedAttemptMetadata = {
      ...((currentAttempt.metadata as Record<string, unknown> | null) ?? {}),
      ...((input.metadata as Record<string, unknown> | null) ?? {}),
    };

    await tx.destinationMissionAttempt.update({
      where: { id: currentAttempt.id },
      data: {
        state: "in_progress",
        startedAt: currentAttempt.startedAt ?? new Date(),
        candidateId: input.candidateId ?? currentAttempt.candidateId,
        workflowRunId: input.workflowRunId ?? currentAttempt.workflowRunId,
        candidateFingerprint: input.candidateFingerprint ?? currentAttempt.candidateFingerprint,
        metadata: asJson(mergedAttemptMetadata),
      },
    });

    const nextState =
      mission.state === DestinationMissionState.QUEUED ||
      mission.state === DestinationMissionState.CATALOG_INSPECTED ||
      mission.state === DestinationMissionState.FAILED_RECOVERABLE
        ? DestinationMissionState.DISCOVERING
        : mission.state;

    return tx.destinationMissionRun.update({
      where: { id: mission.id },
      data: {
        state: nextState,
        activeAttemptId: currentAttempt.id,
        metadata: asJson({
          ...((mission.metadata as Record<string, unknown> | null) ?? {}),
          ...((input.metadata as Record<string, unknown> | null) ?? {}),
          activeCandidateId: input.candidateId ?? currentAttempt.candidateId ?? null,
        }),
      },
      include: {
        policySnapshot: true,
        attempts: { orderBy: { ordinal: "asc" } },
      },
    });
  });
}

export async function advanceDestinationMissionAttempt(input: {
  companyId: string;
  missionId: string;
  outcome?: DestinationMissionAttemptOutcome | null;
  candidateId?: string | null;
  workflowRunId?: string | null;
  candidateFingerprint?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  return prisma.$transaction(async (tx) => {
    const mission = await tx.destinationMissionRun.findFirst({
      where: { id: input.missionId, companyId: input.companyId },
      include: {
        policySnapshot: true,
        attempts: { orderBy: { ordinal: "desc" }, take: 1 },
      },
    });
    if (!mission) return null;

    const currentAttempt = mission.attempts[0] ?? null;
    const policy = mission.policySnapshot.policyJson as unknown as DestinationRulebookPolicySnapshot;
    const mergedMetadata = {
      ...((currentAttempt?.metadata as Record<string, unknown> | null) ?? {}),
      ...((input.metadata as Record<string, unknown> | null) ?? {}),
      ...(input.outcome ? { outcome: input.outcome } : {}),
    };

    if (currentAttempt) {
      await tx.destinationMissionAttempt.update({
        where: { id: currentAttempt.id },
        data: {
          state: input.outcome?.terminalKind ?? "advanced",
          terminalKind: input.outcome?.terminalKind,
          rejectionCode: input.outcome?.rejectionCode,
          rejectionDetail: input.outcome?.rejectionDetail,
          candidateId: input.candidateId ?? currentAttempt.candidateId,
          workflowRunId: input.workflowRunId ?? currentAttempt.workflowRunId,
          candidateFingerprint: input.candidateFingerprint ?? currentAttempt.candidateFingerprint,
          completedAt: new Date(),
          metadata: asJson(mergedMetadata),
        },
      });
    }

    if (input.outcome?.terminalKind === "published_verified") {
      return tx.destinationMissionRun.update({
        where: { id: mission.id },
        data: {
          state: DestinationMissionState.PUBLISHED_VERIFIED,
          successCandidateId: input.candidateId ?? mission.successCandidateId,
          activeAttemptId: currentAttempt?.id ?? mission.activeAttemptId,
          metadata: asJson({
            ...((mission.metadata as Record<string, unknown> | null) ?? {}),
            terminalOutcome: "published_verified",
          }),
        },
        include: {
          policySnapshot: true,
          attempts: { orderBy: { ordinal: "asc" } },
        },
      });
    }

    const nextOrdinal = (currentAttempt?.ordinal ?? 0) + 1;
    if (nextOrdinal > policy.maxCandidatesPerMission) {
      return tx.destinationMissionRun.update({
        where: { id: mission.id },
        data: {
          state: DestinationMissionState.EXHAUSTED,
          failureCode: input.outcome?.rejectionCode ?? "max_candidates_exhausted",
          failureDetail: input.outcome?.rejectionDetail ?? "No candidate satisfied the mission rulebook within the attempt budget.",
          metadata: asJson({
            ...((mission.metadata as Record<string, unknown> | null) ?? {}),
            terminalOutcome: "exhausted",
          }),
        },
        include: {
          policySnapshot: true,
          attempts: { orderBy: { ordinal: "asc" } },
        },
      });
    }

    const nextAttempt = await tx.destinationMissionAttempt.create({
      data: {
        companyId: mission.companyId,
        destinationInstanceId: mission.destinationInstanceId,
        missionRunId: mission.id,
        ordinal: nextOrdinal,
        state: "queued",
        metadata: asJson({
          source: "advanceDestinationMissionAttempt",
          previousAttemptId: currentAttempt?.id ?? null,
        }),
      },
    });

    return tx.destinationMissionRun.update({
      where: { id: mission.id },
      data: {
        state: DestinationMissionState.DISCOVERING,
        activeAttemptId: nextAttempt.id,
        attemptCount: nextOrdinal,
        failureCode: null,
        failureDetail: null,
        metadata: asJson({
          ...((mission.metadata as Record<string, unknown> | null) ?? {}),
          lastAdvancedAt: new Date().toISOString(),
        }),
      },
      include: {
        policySnapshot: true,
        attempts: { orderBy: { ordinal: "asc" } },
      },
    });
  });
}

export async function markDestinationMissionTerminal(input: {
  companyId: string;
  missionId: string;
  outcome: "FAILED_TERMINAL" | "FAILED_RECOVERABLE" | "EXHAUSTED" | "PUBLISHED_VERIFIED";
  failureCode?: string | null;
  failureDetail?: string | null;
  successCandidateId?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  return transitionDestinationMissionState({
    companyId: input.companyId,
    missionId: input.missionId,
    nextState: input.outcome,
    failureCode: input.failureCode ?? null,
    failureDetail: input.failureDetail ?? null,
    metadata: {
      ...((input.metadata as Record<string, unknown> | null) ?? {}),
      ...(input.successCandidateId ? { successCandidateId: input.successCandidateId } : {}),
    },
  });
}

export async function updateDestinationMissionPolicy(input: {
  companyId: string;
  missionId: string;
  policyPatch: Partial<DestinationRulebookPolicySnapshot>;
  metadata?: Record<string, unknown> | null;
}) {
  const mission = await prisma.destinationMissionRun.findFirst({
    where: { id: input.missionId, companyId: input.companyId },
    include: {
      policySnapshot: true,
    },
  });
  if (!mission) return null;

  const currentPolicy = normalizePolicySnapshot(
    mission.destinationKey as DestinationKey,
    mission.policySnapshot.policyJson as Partial<DestinationRulebookPolicySnapshot>,
  );
  const nextPolicy = normalizePolicySnapshot(mission.destinationKey as DestinationKey, {
    ...currentPolicy,
    ...input.policyPatch,
  });

  return prisma.$transaction(async (tx) => {
    const nextSnapshot = await tx.destinationMissionPolicySnapshot.create({
      data: {
        companyId: mission.companyId,
        destinationInstanceId: mission.destinationInstanceId,
        destinationKey: mission.destinationKey,
        missionKind: mission.missionKind,
        version: nextPolicy.version,
        policyJson: nextPolicy as unknown as Prisma.InputJsonValue,
        metadata: asJson({
          ...((mission.policySnapshot.metadata as Record<string, unknown> | null) ?? {}),
          ...((input.metadata as Record<string, unknown> | null) ?? {}),
          source: "updateDestinationMissionPolicy",
        }),
      },
    });

    return tx.destinationMissionRun.update({
      where: { id: mission.id },
      data: {
        policySnapshotId: nextSnapshot.id,
        metadata: asJson({
          ...((mission.metadata as Record<string, unknown> | null) ?? {}),
          ...((input.metadata as Record<string, unknown> | null) ?? {}),
          policyUpdatedAt: new Date().toISOString(),
        }),
      },
      include: {
        policySnapshot: true,
        attempts: { orderBy: { ordinal: "asc" } },
      },
    });
  });
}
