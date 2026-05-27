import crypto from "crypto";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { summarizeDraftCorrections, summarizeFactCorrections } from "@/lib/destination-corrections";
import {
  advanceDestinationMissionAttempt,
  getDestinationMissionRun,
  markDestinationMissionTerminal,
  transitionDestinationMissionState,
} from "@/lib/destination-missions";
import { createDestinationDraft, createDestinationFactSnapshot, ensureDestinationInstance } from "@/lib/destination-workflows";
import { markDestinationWorkflowOutcome, setDestinationWorkflowReviewState } from "@/lib/destination-workflow-runtime";
import type { DestinationKey } from "@/lib/destination-workflow-contract";

export interface DestinationReviewPacketInput {
  companyId: string;
  destinationKey: DestinationKey;
  workflowRunId: string;
  candidateId: string;
  draftId: string;
  bridgeVersion: string;
  draftPayload: Record<string, unknown>;
  evidenceSummary: Record<string, unknown>;
  diagnostics: Record<string, unknown>;
  mediaSummary?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export interface DestinationReviewDecisionInput {
  companyId: string;
  reviewPacketId: string;
  bridgeVersion: string;
  decision: string;
  decisionReasonCode: string;
  decisionNotes?: string;
  requestedAction?: string;
  correctedDraftPayload?: Record<string, unknown> | null;
  correctedFactsJson?: Record<string, unknown> | null;
  reviewedBy: string;
  reviewedAt?: string;
  metadata?: Record<string, unknown> | null;
}

export interface DestinationOutcomeInput {
  companyId: string;
  destinationKey: DestinationKey;
  workflowRunId?: string;
  candidateId?: string;
  draftId?: string;
  reviewPacketId?: string;
  bridgeVersion: string;
  eventType: string;
  reasonCode?: string;
  notes?: string;
  actorType: string;
  actorId?: string;
  payload?: Record<string, unknown> | null;
}

function jsonValue(value: Record<string, unknown> | null | undefined): Prisma.InputJsonValue {
  return ((value && Object.keys(value).length > 0 ? value : {}) as Prisma.InputJsonValue);
}

function hashPacket(input: DestinationReviewPacketInput) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify([
        input.companyId,
        input.destinationKey,
        input.workflowRunId,
        input.candidateId,
        input.draftId,
        input.bridgeVersion,
        input.draftPayload,
      ]),
    )
    .digest("hex");
}

async function syncMissionRunFromReviewDecision(input: {
  companyId: string;
  workflowRunId: string;
  candidateId: string;
  decision: string;
  decisionReasonCode: string;
  decisionNotes?: string;
  reviewedBy: string;
}) {
  const mission = await getDestinationMissionRun(input.companyId, input.workflowRunId);
  if (!mission) return;
  if (["FAILED_TERMINAL", "EXHAUSTED", "PUBLISHED_VERIFIED"].includes(mission.state)) return;

  if (input.decision === "APPROVE") {
    if (mission.state !== "PUBLISHING") {
      await transitionDestinationMissionState({
        companyId: input.companyId,
        missionId: mission.id,
        nextState: "PUBLISHING",
        metadata: {
          source: "review_approved",
          candidateId: input.candidateId,
          reviewedBy: input.reviewedBy,
        },
      }).catch(() => null);
    }
    return;
  }

  if (input.decision === "REWORK") {
    if (mission.state !== "CANDIDATE_IN_REVIEW") {
      await transitionDestinationMissionState({
        companyId: input.companyId,
        missionId: mission.id,
        nextState: "CANDIDATE_IN_REVIEW",
        metadata: {
          source: "review_rework_requested",
          candidateId: input.candidateId,
          reviewedBy: input.reviewedBy,
        },
      }).catch(() => null);
    }
    return;
  }

  if (input.decision === "REJECT") {
    await advanceDestinationMissionAttempt({
      companyId: input.companyId,
      missionId: mission.id,
      candidateId: input.candidateId,
      workflowRunId: mission.id,
      outcome: {
        terminalKind: "rejected",
        rejectionCode: input.decisionReasonCode || "review_rejected",
        rejectionDetail: input.decisionNotes || "Candidate was rejected during review.",
      },
      metadata: {
        source: "review_rejected",
        reviewedBy: input.reviewedBy,
      },
    }).catch(() => null);
  }
}

async function syncMissionRunFromOutcome(input: DestinationOutcomeInput) {
  if (!input.workflowRunId) return;
  const mission = await getDestinationMissionRun(input.companyId, input.workflowRunId);
  if (!mission) return;
  if (["FAILED_TERMINAL", "EXHAUSTED", "PUBLISHED_VERIFIED"].includes(mission.state)) return;

  if (input.eventType === "publish_completed" || input.eventType === "completed" || input.eventType === "complete") {
    await markDestinationMissionTerminal({
      companyId: input.companyId,
      missionId: mission.id,
      outcome: "PUBLISHED_VERIFIED",
      successCandidateId: input.candidateId ?? null,
      metadata: {
        source: input.eventType,
        actorId: input.actorId ?? null,
      },
    }).catch(() => null);
    return;
  }

  if (
    [
      "publish_partial",
      "publish_blocked",
      "publish_failed",
      "failed",
      "failure",
      "publish_rollback",
    ].includes(input.eventType)
  ) {
    await transitionDestinationMissionState({
      companyId: input.companyId,
      missionId: mission.id,
      nextState: "FAILED_RECOVERABLE",
      failureCode: input.reasonCode ?? input.eventType,
      failureDetail: input.notes ?? input.eventType,
      metadata: {
        source: input.eventType,
        actorId: input.actorId ?? null,
      },
    }).catch(() => null);
  }
}

async function promoteReviewCorrections(input: {
  companyId: string;
  destinationKey: DestinationKey;
  candidateId: string;
  bridgeVersion: string;
  reviewedBy: string;
  reviewState: "APPROVED" | "REJECTED" | "REVIEW_REQUIRED";
  baseDraft: {
    adapterVersion: string;
    draftJson: Record<string, unknown>;
    provenanceJson: Record<string, unknown>;
    basedOnFactSnapshotId: string | null;
  };
  baseFactSnapshot: {
    id: string;
    factsJson: Record<string, unknown>;
    provenanceJson: Record<string, unknown>;
    extractorVersion: string;
  } | null;
  correctedDraftPayload: Record<string, unknown> | null;
  correctedFactsJson: Record<string, unknown> | null;
}) {
  let promotedFactSnapshotId: string | null = null;
  let promotedDraftId: string | null = null;

  if (input.correctedFactsJson && input.baseFactSnapshot) {
    const factSnapshot = await createDestinationFactSnapshot({
      companyId: input.companyId,
      destinationKey: input.destinationKey,
      candidateId: input.candidateId,
      factsJson: input.correctedFactsJson,
      provenanceJson: {
        ...input.baseFactSnapshot.provenanceJson,
        correctionSource: "review-decision",
        correctedBy: input.reviewedBy,
        correctedAt: new Date().toISOString(),
        bridgeVersion: input.bridgeVersion,
      },
      extractorVersion: `${input.baseFactSnapshot.extractorVersion}+review-corrected`,
    });
    promotedFactSnapshotId = factSnapshot.id;
  }

  if (input.correctedDraftPayload || promotedFactSnapshotId) {
    const promotedDraft = await createDestinationDraft({
      companyId: input.companyId,
      destinationKey: input.destinationKey,
      candidateId: input.candidateId,
      adapterVersion: `${input.baseDraft.adapterVersion}+review-corrected`,
      draftJson: input.correctedDraftPayload ?? input.baseDraft.draftJson,
      provenanceJson: {
        ...input.baseDraft.provenanceJson,
        correctionSource: "review-decision",
        correctedBy: input.reviewedBy,
        correctedAt: new Date().toISOString(),
        bridgeVersion: input.bridgeVersion,
      },
      basedOnFactSnapshotId: promotedFactSnapshotId ?? input.baseDraft.basedOnFactSnapshotId,
      reviewState: input.reviewState,
    });
    promotedDraftId = promotedDraft.id;
  }

  return { promotedFactSnapshotId, promotedDraftId };
}

export async function submitDestinationReviewPacket(input: DestinationReviewPacketInput) {
  const destinationInstance = await ensureDestinationInstance(input.companyId, input.destinationKey);
  const packetFingerprint = hashPacket(input);
  const existing = await prisma.destinationReviewPacket.findUnique({
    where: {
      companyId_destinationInstanceId_packetFingerprint: {
        companyId: input.companyId,
        destinationInstanceId: destinationInstance.id,
        packetFingerprint,
      },
    },
  });

  if (existing) return existing;

  const packet = await prisma.destinationReviewPacket.create({
    data: {
      companyId: input.companyId,
      destinationInstanceId: destinationInstance.id,
      workflowRunId: input.workflowRunId,
      candidateId: input.candidateId,
      draftId: input.draftId,
      bridgeVersion: input.bridgeVersion,
      packetFingerprint,
      evidenceSummary: jsonValue(input.evidenceSummary),
      diagnostics: jsonValue(input.diagnostics),
      mediaSummary: jsonValue(input.mediaSummary),
      draftPayload: jsonValue(input.draftPayload),
      metadata: jsonValue(input.metadata),
    },
  });

  await setDestinationWorkflowReviewState({
    companyId: input.companyId,
    runId: input.workflowRunId,
    reviewState: "REVIEW_REQUIRED",
  });

  return packet;
}

export async function getDestinationReviewPacket(companyId: string, reviewPacketId: string) {
  const packet = await prisma.destinationReviewPacket.findFirst({
    where: { id: reviewPacketId, companyId },
    include: {
      draft: true,
      reviewDecisions: {
        orderBy: { reviewedAt: "desc" },
      },
      outcomeMemories: {
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!packet) return null;

  const latestFactSnapshot = packet.draft.basedOnFactSnapshotId
    ? await prisma.destinationFactSnapshot.findFirst({
        where: {
          id: packet.draft.basedOnFactSnapshotId,
          companyId,
        },
      })
    : null;

  return {
    ...packet,
    latestFactSnapshot,
  };
}

export async function submitDestinationReviewDecision(input: DestinationReviewDecisionInput) {
  const packet = await prisma.destinationReviewPacket.findFirst({
    where: { id: input.reviewPacketId, companyId: input.companyId },
    include: {
      destinationInstance: {
        select: { destinationKey: true },
      },
      draft: {
        select: {
          id: true,
          adapterVersion: true,
          draftJson: true,
          provenanceJson: true,
          basedOnFactSnapshotId: true,
        },
      },
    },
  });
  if (!packet) return null;

  const correctedDraftPayload =
    input.correctedDraftPayload && typeof input.correctedDraftPayload === "object"
      ? input.correctedDraftPayload
      : null;
  const baseFactSnapshot = packet.draft.basedOnFactSnapshotId
    ? await prisma.destinationFactSnapshot.findUnique({
        where: { id: packet.draft.basedOnFactSnapshotId },
      })
    : null;
  const correctedFactsJson =
    input.correctedFactsJson && typeof input.correctedFactsJson === "object"
      ? input.correctedFactsJson
      : null;
  const correctionSummary = correctedDraftPayload
    ? summarizeDraftCorrections(packet.draftPayload as Record<string, unknown>, correctedDraftPayload)
    : null;
  const factCorrectionSummary =
    correctedFactsJson && baseFactSnapshot
      ? summarizeFactCorrections(baseFactSnapshot.factsJson as Record<string, unknown>, correctedFactsJson)
      : null;
  const promoted = await promoteReviewCorrections({
    companyId: input.companyId,
    destinationKey: packet.destinationInstance.destinationKey as DestinationKey,
    candidateId: packet.candidateId,
    bridgeVersion: input.bridgeVersion,
    reviewedBy: input.reviewedBy,
    reviewState:
      input.decision === "APPROVE"
        ? "APPROVED"
        : input.decision === "REJECT"
          ? "REJECTED"
          : "REVIEW_REQUIRED",
    baseDraft: {
      adapterVersion: packet.draft.adapterVersion,
      draftJson: packet.draft.draftJson as Record<string, unknown>,
      provenanceJson: packet.draft.provenanceJson as Record<string, unknown>,
      basedOnFactSnapshotId: packet.draft.basedOnFactSnapshotId,
    },
    baseFactSnapshot: baseFactSnapshot
      ? {
          id: baseFactSnapshot.id,
          factsJson: baseFactSnapshot.factsJson as Record<string, unknown>,
          provenanceJson: baseFactSnapshot.provenanceJson as Record<string, unknown>,
          extractorVersion: baseFactSnapshot.extractorVersion,
        }
      : null,
    correctedDraftPayload,
    correctedFactsJson,
  });

  const decision = await prisma.destinationReviewDecision.create({
    data: {
      companyId: input.companyId,
      reviewPacketId: input.reviewPacketId,
      bridgeVersion: input.bridgeVersion,
      decision: input.decision,
      decisionReasonCode: input.decisionReasonCode,
      decisionNotes: input.decisionNotes,
      requestedAction: input.requestedAction,
      correctedDraftPayload: correctedDraftPayload ? jsonValue(correctedDraftPayload) : undefined,
      correctionSummary: correctionSummary ? jsonValue(correctionSummary) : undefined,
      correctedFactsJson: correctedFactsJson ? jsonValue(correctedFactsJson) : undefined,
      factCorrectionSummary: factCorrectionSummary ? jsonValue(factCorrectionSummary) : undefined,
      promotedFactSnapshotId: promoted.promotedFactSnapshotId,
      promotedDraftId: promoted.promotedDraftId,
      reviewedBy: input.reviewedBy,
      reviewedAt: input.reviewedAt ? new Date(input.reviewedAt) : new Date(),
      metadata: jsonValue(input.metadata),
    },
  });

  await prisma.destinationReviewPacket.update({
    where: { id: input.reviewPacketId },
    data: {
      draftId: promoted.promotedDraftId ?? undefined,
      draftPayload: promoted.promotedDraftId
        ? jsonValue(correctedDraftPayload ?? (packet.draft.draftJson as Record<string, unknown>))
        : undefined,
      packetState:
        input.decision === "APPROVE"
          ? "APPROVED"
          : input.decision === "REJECT"
            ? "REJECTED"
            : input.decision === "REWORK"
              ? "REWORK_REQUESTED"
              : "REVIEWED",
    },
  });

  await recordDestinationOutcomeMemory({
    companyId: input.companyId,
    destinationKey: packet.destinationInstance.destinationKey as DestinationKey,
    workflowRunId: packet.workflowRunId,
    candidateId: packet.candidateId,
    draftId: packet.draftId,
    reviewPacketId: packet.id,
    bridgeVersion: input.bridgeVersion,
    eventType:
      input.decision === "APPROVE"
        ? "review_approved"
        : input.decision === "REJECT"
          ? "review_rejected"
          : "review_rework_requested",
    reasonCode: input.decisionReasonCode,
    notes: input.decisionNotes,
    actorType: "HUMAN",
    actorId: input.reviewedBy,
    payload: {
      requestedAction: input.requestedAction,
      decision: input.decision,
      correctionSummary,
      factCorrectionSummary,
    },
  });

  await setDestinationWorkflowReviewState({
    companyId: input.companyId,
    runId: packet.workflowRunId,
    reviewState:
      input.decision === "APPROVE"
        ? "APPROVED"
        : input.decision === "REJECT"
          ? "REJECTED"
          : "REWORK_REQUESTED",
    notes: input.decisionNotes,
  });

  await syncMissionRunFromReviewDecision({
    companyId: input.companyId,
    workflowRunId: packet.workflowRunId,
    candidateId: packet.candidateId,
    decision: input.decision,
    decisionReasonCode: input.decisionReasonCode,
    decisionNotes: input.decisionNotes,
    reviewedBy: input.reviewedBy,
  });

  return decision;
}

export async function recordDestinationOutcomeMemory(input: DestinationOutcomeInput) {
  const destinationInstance = await ensureDestinationInstance(input.companyId, input.destinationKey);
  const outcome = await prisma.destinationOutcomeMemory.create({
    data: {
      companyId: input.companyId,
      destinationInstanceId: destinationInstance.id,
      workflowRunId: input.workflowRunId,
      candidateId: input.candidateId,
      draftId: input.draftId,
      reviewPacketId: input.reviewPacketId,
      bridgeVersion: input.bridgeVersion,
      eventType: input.eventType,
      reasonCode: input.reasonCode,
      notes: input.notes,
      actorType: input.actorType,
      actorId: input.actorId,
      payload: jsonValue(input.payload),
    },
  });

  if (input.workflowRunId) {
    if (input.eventType === "publish_completed" || input.eventType === "completed" || input.eventType === "complete") {
      await markDestinationWorkflowOutcome({
        companyId: input.companyId,
        runId: input.workflowRunId,
        outcomeType: "COMPLETE",
      });
    } else if (
      [
        "publish_partial",
        "publish_blocked",
        "publish_failed",
        "failed",
        "failure",
        "review_rejected",
        "publish_rollback",
      ].includes(input.eventType)
    ) {
      await markDestinationWorkflowOutcome({
        companyId: input.companyId,
        runId: input.workflowRunId,
        outcomeType: "FAILED",
        errorMessage: input.notes ?? input.reasonCode ?? input.eventType,
      });
    }
  }

  await syncMissionRunFromOutcome(input);

  return outcome;
}

export async function exportDestinationOutcomeDataset(input: {
  companyId: string;
  destinationKey: DestinationKey;
  eventTypes?: string[];
}) {
  const destinationInstance = await ensureDestinationInstance(input.companyId, input.destinationKey);
  return prisma.destinationOutcomeMemory.findMany({
    where: {
      companyId: input.companyId,
      destinationInstanceId: destinationInstance.id,
      ...(input.eventTypes?.length ? { eventType: { in: input.eventTypes } } : {}),
    },
    orderBy: { createdAt: "asc" },
    include: {
      draft: true,
      candidate: true,
      reviewPacket: true,
    },
  });
}
