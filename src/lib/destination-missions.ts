import { DestinationMissionState, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ensureDestinationInstance } from "@/lib/destination-workflows";
import type { DestinationKey } from "@/lib/destination-workflow-contract";
import { normalizeDestinationKey } from "@/lib/destination-scope";
import { resolveMiniappIntelligenceContract } from "@/lib/miniapp-intelligence-contracts";
import {
  type DestinationMissionAttemptOutcome,
  type DestinationMissionDefinitionConfig,
  type DestinationMissionKind,
  type DestinationRulebookPolicySnapshot,
  DESTINATION_MISSION_TERMINAL_STATES,
  getDefaultRulebookPolicyForDestination,
  normalizeMissionDefinitionConfig,
  normalizeRulebookPolicySnapshot,
} from "@/lib/destination-mission-contract";
import {
  getDestinationMissionDefinition,
  resolveActiveDestinationMissionDefinition,
} from "@/lib/destination-mission-definitions";

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
  return normalizeRulebookPolicySnapshot({
    ...getDefaultRulebookPolicyForDestination(destinationKey),
    ...(value ?? {}),
  });
}

function derivePolicyFromMissionDefinition(
  destinationKey: DestinationKey,
  config?: Partial<DestinationMissionDefinitionConfig> | null,
) {
  const destinationDefaults = getDefaultRulebookPolicyForDestination(destinationKey);
  const configWithDestinationDefaults = {
    rulebookPolicy: destinationDefaults,
    listingTypeScope: destinationDefaults.allowedListingTypes,
    ...(config ?? {}),
  };
  const normalizedConfig = normalizeMissionDefinitionConfig(configWithDestinationDefaults);
  const policy = normalizeRulebookPolicySnapshot({
    ...destinationDefaults,
    ...normalizedConfig.rulebookPolicy,
  });
  return {
    config: normalizedConfig,
    policy: normalizeRulebookPolicySnapshot({
      ...policy,
      executionMode: normalizedConfig.executionPolicy.mode,
    }),
  };
}

export const DESTINATION_MISSION_TRANSITION_MAP: Record<DestinationMissionState, DestinationMissionState[]> = {
    QUEUED: ["CATALOG_INSPECTED", "DISCOVERING", "EXHAUSTED", "PAUSED", "FAILED_RECOVERABLE", "FAILED_TERMINAL"],
    CATALOG_INSPECTED: ["DISCOVERING", "EXHAUSTED", "PAUSED", "FAILED_RECOVERABLE", "FAILED_TERMINAL"],
    DISCOVERING: ["CANDIDATE_IN_REVIEW", "PUBLISHING", "EXHAUSTED", "PAUSED", "FAILED_RECOVERABLE", "FAILED_TERMINAL"],
    CANDIDATE_IN_REVIEW: ["DISCOVERING", "PUBLISHING", "PAUSED", "FAILED_RECOVERABLE", "FAILED_TERMINAL"],
    PUBLISHING: ["PUBLISHED_VERIFIED", "DISCOVERING", "FAILED_RECOVERABLE", "FAILED_TERMINAL", "PAUSED"],
    PUBLISHED_VERIFIED: [],
    FAILED_RECOVERABLE: ["DISCOVERING", "PAUSED", "FAILED_TERMINAL"],
    FAILED_TERMINAL: [],
    EXHAUSTED: [],
    PAUSED: ["DISCOVERING", "CATALOG_INSPECTED", "FAILED_RECOVERABLE", "FAILED_TERMINAL"],
  };
export const DESTINATION_MISSION_TERMINAL_STATE_SET = new Set<string>(DESTINATION_MISSION_TERMINAL_STATES);

function canTransitionMissionState(current: DestinationMissionState, next: DestinationMissionState) {
  if (current === next) return true;
  return DESTINATION_MISSION_TRANSITION_MAP[current]?.includes(next) ?? false;
}

function missionRecoveryHint(input: {
  state: DestinationMissionState;
  failureCode?: string | null;
  failureDetail?: string | null;
}) {
  if (input.state === DestinationMissionState.FAILED_RECOVERABLE) {
    return {
      recoveryHint: "retry_or_pause",
      nextAction: "retry",
      operatorMessage:
        input.failureDetail ??
        "The mission stopped in a recoverable state. Retry from mission control or pause it before policy changes.",
    };
  }
  if (input.state === DestinationMissionState.PAUSED) {
    return {
      recoveryHint: "resume_or_cancel",
      nextAction: "resume",
      operatorMessage: "The mission is paused and waiting for an operator decision.",
    };
  }
  if (input.state === DestinationMissionState.EXHAUSTED) {
    return {
      recoveryHint: "expand_policy_or_start_new_run",
      nextAction: "reselect_policy",
      operatorMessage:
        input.failureDetail ??
        "The mission exhausted its candidate budget. Expand the policy or start a new run with new sources.",
    };
  }
  if (input.state === DestinationMissionState.FAILED_TERMINAL) {
    return {
      recoveryHint: "manual_reconcile",
      nextAction: "manual_force_stop",
      operatorMessage:
        input.failureDetail ??
        "The mission reached a terminal failure and needs manual reconciliation before another run.",
    };
  }
  if (input.state === DestinationMissionState.PUBLISHED_VERIFIED) {
    return {
      recoveryHint: "none",
      nextAction: "none",
      operatorMessage: "The mission is complete and public verification succeeded.",
    };
  }
  return {
    recoveryHint: "continue",
    nextAction: "continue",
    operatorMessage: "The mission can continue through its normal runtime flow.",
  };
}

function appendMissionTransitionAudit(
  metadata: Record<string, unknown>,
  event: Record<string, unknown>,
) {
  const previous = Array.isArray(metadata.missionTransitionAudit)
    ? metadata.missionTransitionAudit.filter((item) => item && typeof item === "object")
    : [];
  return [...previous.slice(-19), event];
}

export async function startDestinationMissionRun(input: {
  companyId: string;
  destinationKey: DestinationKey;
  missionKind: DestinationMissionKind;
  missionDefinitionId?: string | null;
  policySnapshot?: Partial<DestinationRulebookPolicySnapshot> | null;
  metadata?: Record<string, unknown> | null;
}) {
  const destinationInstance = await ensureDestinationInstance(input.companyId, input.destinationKey);
  const intelligenceContract = resolveMiniappIntelligenceContract({
    miniappKey: input.destinationKey,
    destinationKeyHint: input.destinationKey,
  });
  const requestedDefinition = input.missionDefinitionId
    ? await getDestinationMissionDefinition({
      companyId: input.companyId,
      definitionId: input.missionDefinitionId,
    })
    : null;
  const activeDefinition = requestedDefinition
    ? null
    : await resolveActiveDestinationMissionDefinition({
      companyId: input.companyId,
      destinationKey: input.destinationKey,
      missionKind: input.missionKind,
    });
  const resolvedDefinition = requestedDefinition ?? activeDefinition;
  const derivedDefinitionPolicy = resolvedDefinition
    ? derivePolicyFromMissionDefinition(
      input.destinationKey,
      resolvedDefinition.configJson as Partial<DestinationMissionDefinitionConfig>,
    )
    : null;
  const policy = input.policySnapshot
    ? normalizePolicySnapshot(input.destinationKey, input.policySnapshot)
    : derivedDefinitionPolicy?.policy ?? normalizePolicySnapshot(input.destinationKey);
  const definitionLineageMetadata = resolvedDefinition
    ? {
      missionDefinitionId: resolvedDefinition.id,
      missionDefinitionStatus: resolvedDefinition.status,
      missionDefinitionName: resolvedDefinition.name,
      missionDefinitionRevisionId:
        resolvedDefinition.activeRevisionId ?? resolvedDefinition.revisions[0]?.id ?? null,
      missionDefinitionRevisionVersion:
        resolvedDefinition.revisions[0]?.version ?? null,
      missionDefinitionConfigVersion:
        derivedDefinitionPolicy?.config.version ?? null,
    }
    : {};

  return prisma.$transaction(async (tx) => {
    const policySnapshot = await tx.destinationMissionPolicySnapshot.create({
      data: {
        companyId: input.companyId,
        destinationInstanceId: destinationInstance.id,
        destinationKey: input.destinationKey,
        missionKind: input.missionKind,
      version: policy.version,
      policyJson: policy as unknown as Prisma.InputJsonValue,
      metadata: asJson({
        ...((input.metadata as Record<string, unknown> | null) ?? {}),
        miniappIntelligenceContractKey: intelligenceContract.contract.key,
        miniappIntelligenceContractValid: intelligenceContract.validation.valid,
        miniappIntelligenceContractErrors: intelligenceContract.validation.errors,
        ...definitionLineageMetadata,
      }),
      },
    });

    const missionRun = await tx.destinationMissionRun.create({
      data: {
        companyId: input.companyId,
        destinationInstanceId: destinationInstance.id,
        missionDefinitionId: resolvedDefinition?.id ?? null,
        missionDefinitionRevisionId:
          resolvedDefinition?.activeRevisionId ?? resolvedDefinition?.revisions[0]?.id ?? null,
        policySnapshotId: policySnapshot.id,
        destinationKey: input.destinationKey,
        missionKind: input.missionKind,
        state: DestinationMissionState.QUEUED,
        metadata: asJson({
          ...((input.metadata as Record<string, unknown> | null) ?? {}),
          miniappIntelligenceContractKey: intelligenceContract.contract.key,
          miniappIntelligenceContractValid: intelligenceContract.validation.valid,
          miniappIntelligenceContractErrors: intelligenceContract.validation.errors,
          ...definitionLineageMetadata,
        }),
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
        missionDefinition: true,
        missionDefinitionRevision: true,
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
      missionDefinition: true,
      missionDefinitionRevision: true,
      attempts: { orderBy: { ordinal: "asc" }, take: 10 },
    },
  });
}

export async function getDestinationMissionRun(companyId: string, missionId: string) {
  return prisma.destinationMissionRun.findFirst({
    where: { id: missionId, companyId },
    include: {
      policySnapshot: true,
      missionDefinition: true,
      missionDefinitionRevision: true,
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
  const recovery = missionRecoveryHint({
    state: nextState,
    failureCode: input.failureCode ?? mission.failureCode,
    failureDetail: input.failureDetail ?? mission.failureDetail,
  });
  const transitionAudit = appendMissionTransitionAudit(mergedMetadata, {
    fromState: mission.state,
    toState: nextState,
    failureCode: input.failureCode ?? mission.failureCode ?? null,
    recoveryHint: recovery.recoveryHint,
    nextAction: recovery.nextAction,
    transitionedAt: new Date().toISOString(),
    source:
      typeof mergedMetadata.source === "string"
        ? mergedMetadata.source
        : "transitionDestinationMissionState",
  });

  return prisma.destinationMissionRun.update({
    where: { id: mission.id },
    data: {
      state: nextState,
      failureCode: input.failureCode ?? mission.failureCode,
      failureDetail: input.failureDetail ?? mission.failureDetail,
      metadata: asJson({
        ...mergedMetadata,
        ...recovery,
        terminal: DESTINATION_MISSION_TERMINAL_STATE_SET.has(nextState),
        missionTransitionAudit: transitionAudit,
      }),
    },
    include: {
      policySnapshot: true,
      missionDefinition: true,
      missionDefinitionRevision: true,
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
        missionDefinition: true,
        missionDefinitionRevision: true,
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
    const outcomeCode =
      input.outcome?.outcomeCode ??
      (input.outcome?.terminalKind === "published_verified"
        ? "accepted"
        : input.outcome?.terminalKind === "publish_failed"
          ? "verify_failed"
          : input.outcome?.rejectionCode === "missing_discovery_artifact" ||
              input.outcome?.rejectionCode === "extraction_missing_facts"
            ? "blocked_by_missing_evidence"
            : input.outcome?.rejectionCode?.includes("image")
              ? "image_blocked"
              : input.outcome?.terminalKind === "rejected"
                ? "rejected_with_feedback"
                : undefined);

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
          metadata: asJson({
            ...mergedMetadata,
            outcomeCode: outcomeCode ?? null,
            recoveryHint:
              input.outcome?.terminalKind === "retryable_failure" ||
              input.outcome?.terminalKind === "publish_failed"
                ? "retry_or_pause"
                : "continue",
          }),
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
            ...missionRecoveryHint({
              state: DestinationMissionState.PUBLISHED_VERIFIED,
            }),
            terminal: true,
          }),
        },
        include: {
          policySnapshot: true,
          missionDefinition: true,
          missionDefinitionRevision: true,
          attempts: { orderBy: { ordinal: "asc" } },
        },
      });
    }

    const nextOrdinal = (currentAttempt?.ordinal ?? 0) + 1;
    if (
      input.outcome?.terminalKind === "publish_failed" ||
      input.outcome?.outcomeCode === "verify_failed" ||
      input.outcome?.outcomeCode === "publish_partial"
    ) {
      const recovery = missionRecoveryHint({
        state: DestinationMissionState.FAILED_RECOVERABLE,
        failureCode: input.outcome.rejectionCode ?? "publish_verification_failed",
        failureDetail: input.outcome.rejectionDetail,
      });
      return tx.destinationMissionRun.update({
        where: { id: mission.id },
        data: {
          state: DestinationMissionState.FAILED_RECOVERABLE,
          failureCode: input.outcome.rejectionCode ?? "publish_verification_failed",
          failureDetail:
            input.outcome.rejectionDetail ??
            "Publish completed without a verified public listing.",
          metadata: asJson({
            ...((mission.metadata as Record<string, unknown> | null) ?? {}),
            terminalOutcome: "publish_recovery_required",
            ...recovery,
            terminal: false,
            missionTransitionAudit: appendMissionTransitionAudit(
              (mission.metadata as Record<string, unknown> | null) ?? {},
              {
                fromState: mission.state,
                toState: DestinationMissionState.FAILED_RECOVERABLE,
                failureCode: input.outcome.rejectionCode ?? "publish_verification_failed",
                recoveryHint: recovery.recoveryHint,
                nextAction: recovery.nextAction,
                transitionedAt: new Date().toISOString(),
                source: "advanceDestinationMissionAttempt",
              },
            ),
          }),
        },
        include: {
          policySnapshot: true,
          missionDefinition: true,
          missionDefinitionRevision: true,
          attempts: { orderBy: { ordinal: "asc" } },
        },
      });
    }

    if (nextOrdinal > policy.maxCandidatesPerMission) {
      const recovery = missionRecoveryHint({
        state: DestinationMissionState.EXHAUSTED,
        failureCode: input.outcome?.rejectionCode ?? "max_candidates_exhausted",
        failureDetail: input.outcome?.rejectionDetail,
      });
      return tx.destinationMissionRun.update({
        where: { id: mission.id },
        data: {
          state: DestinationMissionState.EXHAUSTED,
          failureCode: input.outcome?.rejectionCode ?? "max_candidates_exhausted",
          failureDetail: input.outcome?.rejectionDetail ?? "No candidate satisfied the mission rulebook within the attempt budget.",
          metadata: asJson({
            ...((mission.metadata as Record<string, unknown> | null) ?? {}),
            terminalOutcome: "exhausted",
            ...recovery,
            terminal: true,
            missionTransitionAudit: appendMissionTransitionAudit(
              (mission.metadata as Record<string, unknown> | null) ?? {},
              {
                fromState: mission.state,
                toState: DestinationMissionState.EXHAUSTED,
                failureCode: input.outcome?.rejectionCode ?? "max_candidates_exhausted",
                recoveryHint: recovery.recoveryHint,
                nextAction: recovery.nextAction,
                transitionedAt: new Date().toISOString(),
                source: "advanceDestinationMissionAttempt",
              },
            ),
          }),
        },
        include: {
          policySnapshot: true,
          missionDefinition: true,
          missionDefinitionRevision: true,
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
        missionDefinition: true,
        missionDefinitionRevision: true,
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
  const missionDestinationKey = normalizeDestinationKey(mission.destinationKey);
  if (!missionDestinationKey) return null;

  const currentPolicy = normalizePolicySnapshot(
    missionDestinationKey,
    mission.policySnapshot.policyJson as Partial<DestinationRulebookPolicySnapshot>,
  );
  const nextPolicy = normalizePolicySnapshot(missionDestinationKey, {
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
        missionDefinition: true,
        missionDefinitionRevision: true,
        attempts: { orderBy: { ordinal: "asc" } },
      },
    });
  });
}
