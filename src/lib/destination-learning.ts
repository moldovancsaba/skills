import { DestinationWorkflowState } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ensureDestinationInstance } from "@/lib/destination-workflows";
import type { DestinationKey } from "@/lib/destination-workflow-contract";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function topCounts(values: Array<string | null | undefined>, limit = 5) {
  return Object.entries(
    values.reduce<Record<string, number>>((acc, value) => {
      const key = value?.trim() || "UNKNOWN";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function inferLearningLabel(input: {
  packetState: string;
  latestDecision?: string | null;
  latestOutcomeEvent?: string | null;
}) {
  if (input.latestOutcomeEvent === "publish_completed") return "PUBLISHED";
  if (input.latestOutcomeEvent === "publish_partial") return "PUBLISH_PARTIAL";
  if (input.latestOutcomeEvent === "publish_blocked") return "PUBLISH_BLOCKED";
  if (input.latestOutcomeEvent === "publish_bridge_failed" || input.latestOutcomeEvent === "publish_failed") {
    return "PUBLISH_FAILED";
  }
  if (input.latestDecision === "REJECT") return "REJECTED";
  if (input.latestDecision === "REWORK") return "REWORK_REQUIRED";
  if (input.latestDecision === "APPROVE" || input.packetState === "APPROVED") return "APPROVED_FOR_PUBLISH";
  return "PENDING";
}

export async function getDestinationLearningSummary(input: {
  companyId: string;
  destinationKey: DestinationKey;
}) {
  const destinationInstance = await ensureDestinationInstance(input.companyId, input.destinationKey);
  const [packets, decisions, outcomes, runs, drafts, stageEvents] = await Promise.all([
    prisma.destinationReviewPacket.findMany({
      where: { companyId: input.companyId, destinationInstanceId: destinationInstance.id },
      include: {
        reviewDecisions: { orderBy: { reviewedAt: "desc" } },
        outcomeMemories: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { submittedAt: "desc" },
      take: 500,
    }),
    prisma.destinationReviewDecision.findMany({
      where: { companyId: input.companyId, reviewPacket: { destinationInstanceId: destinationInstance.id } },
      orderBy: { reviewedAt: "desc" },
      take: 500,
    }),
    prisma.destinationOutcomeMemory.findMany({
      where: { companyId: input.companyId, destinationInstanceId: destinationInstance.id },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.destinationWorkflowRun.findMany({
      where: { companyId: input.companyId, destinationInstanceId: destinationInstance.id },
      orderBy: { updatedAt: "desc" },
      take: 500,
    }),
    prisma.destinationDraft.findMany({
      where: { companyId: input.companyId, destinationInstanceId: destinationInstance.id },
      orderBy: { updatedAt: "desc" },
      take: 500,
    }),
    prisma.destinationWorkflowStageEvent.findMany({
      where: { companyId: input.companyId, workflowRun: { destinationInstanceId: destinationInstance.id } },
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
  ]);

  const approvedPackets = packets.filter((packet) => packet.packetState === "APPROVED").length;
  const rejectedPackets = packets.filter((packet) => packet.packetState === "REJECTED").length;
  const reworkPackets = packets.filter((packet) => packet.packetState === "REWORK_REQUESTED").length;
  const draftCorrectionCount = decisions.filter((item) => Boolean(item.correctionSummary)).length;
  const factCorrectionCount = decisions.filter((item) => Boolean(item.factCorrectionSummary)).length;
  const publishedOutcomes = outcomes.filter((item) => item.eventType === "publish_completed").length;
  const publishFailures = outcomes.filter((item) =>
    ["publish_blocked", "publish_failed", "publish_bridge_failed", "publish_partial"].includes(item.eventType),
  ).length;
  const completedRuns = runs.filter((run) => run.state === DestinationWorkflowState.PUBLISHED).length;
  const failedRuns = runs.filter((run) => run.state === DestinationWorkflowState.FAILED).length;

  return {
    generatedAt: new Date().toISOString(),
    destinationKey: input.destinationKey,
    totals: {
      packets: packets.length,
      decisions: decisions.length,
      outcomes: outcomes.length,
      published: publishedOutcomes,
      publishFailures,
      runs: runs.length,
      drafts: drafts.length,
      stageEvents: stageEvents.length,
    },
    quality: {
      firstPassApprovalRate: packets.length ? approvedPackets / packets.length : 0,
      rejectionRate: packets.length ? rejectedPackets / packets.length : 0,
      reworkRate: packets.length ? reworkPackets / packets.length : 0,
      draftCorrectionRate: decisions.length ? draftCorrectionCount / decisions.length : 0,
      factCorrectionRate: decisions.length ? factCorrectionCount / decisions.length : 0,
      publishSuccessRate:
        approvedPackets > 0 ? publishedOutcomes / approvedPackets : 0,
      publishFailureRate:
        approvedPackets > 0 ? publishFailures / approvedPackets : 0,
      workflowCompletionRate: runs.length ? completedRuns / runs.length : 0,
      workflowFailureRate: runs.length ? failedRuns / runs.length : 0,
    },
    topDecisionReasons: topCounts(decisions.map((item) => item.decisionReasonCode)),
    topOutcomeReasons: topCounts(outcomes.map((item) => item.reasonCode)),
    topOutcomeEvents: topCounts(outcomes.map((item) => item.eventType)),
    topFailureStages: topCounts(
      stageEvents
        .filter((item) => /FAIL|REJECT|ERROR/i.test(item.status) || item.errorCode || item.errorMessage)
        .map((item) => item.stage),
    ),
    adapterVersions: topCounts(
      drafts.map((item) => item.adapterVersion),
      10,
    ),
  };
}

export async function getDestinationReplayCandidates(input: {
  companyId: string;
  destinationKey: DestinationKey;
}) {
  const destinationInstance = await ensureDestinationInstance(input.companyId, input.destinationKey);
  const [packets, runs] = await Promise.all([
    prisma.destinationReviewPacket.findMany({
      where: {
        companyId: input.companyId,
        destinationInstanceId: destinationInstance.id,
        packetState: { in: ["REWORK_REQUESTED", "APPROVED", "REJECTED"] },
      },
      include: {
        reviewDecisions: { orderBy: { reviewedAt: "desc" }, take: 1 },
        outcomeMemories: { orderBy: { createdAt: "desc" }, take: 5 },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    prisma.destinationWorkflowRun.findMany({
      where: {
        companyId: input.companyId,
        destinationInstanceId: destinationInstance.id,
        state: { in: [DestinationWorkflowState.FAILED, DestinationWorkflowState.REJECTED] },
      },
      include: {
        stageEvents: { orderBy: { createdAt: "desc" }, take: 5 },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
  ]);

  const packetCandidates = packets
    .map((packet) => {
      const latestDecision = packet.reviewDecisions[0] ?? null;
      const latestOutcome = packet.outcomeMemories[0] ?? null;
      const hasSuccessfulPublish = packet.outcomeMemories.some((item) => item.eventType === "publish_completed");
      if (hasSuccessfulPublish) return null;
      return {
        kind: "review-packet",
        id: packet.id,
        workflowRunId: packet.workflowRunId,
        candidateId: packet.candidateId,
        draftId: packet.draftId,
        currentState: packet.packetState,
        latestDecision: latestDecision?.decision ?? null,
        latestReasonCode: latestDecision?.decisionReasonCode ?? latestOutcome?.reasonCode ?? null,
        recommendedAction:
          packet.packetState === "APPROVED"
            ? "PUBLISH_APPROVED_PACKET"
            : packet.packetState === "REWORK_REQUESTED"
              ? "REPLAY_FROM_SOURCE"
              : "INSPECT_REJECTION",
        rationale:
          packet.packetState === "APPROVED"
            ? "Approved packet is not yet published."
            : packet.packetState === "REWORK_REQUESTED"
              ? "Reviewer requested rework."
              : "Rejected packet remains available for operator inspection.",
        updatedAt: packet.updatedAt.toISOString(),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const runCandidates = runs.map((run) => ({
    kind: "workflow-run",
    id: run.id,
    workflowRunId: run.id,
    candidateId: null,
    draftId: null,
    currentState: run.state,
    latestDecision: null,
    latestReasonCode: run.lastError ?? run.stageEvents[0]?.errorCode ?? null,
    recommendedAction: "REPLAY_RUN",
    rationale: "Workflow run failed before successful destination publish.",
    updatedAt: run.updatedAt.toISOString(),
  }));

  return [...packetCandidates, ...runCandidates]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 200);
}

export async function buildDestinationTrainingExport(input: {
  companyId: string;
  destinationKey: DestinationKey;
  labels?: string[];
}) {
  const destinationInstance = await ensureDestinationInstance(input.companyId, input.destinationKey);
  const packets = await prisma.destinationReviewPacket.findMany({
    where: {
      companyId: input.companyId,
      destinationInstanceId: destinationInstance.id,
    },
    include: {
      reviewDecisions: { orderBy: { reviewedAt: "desc" } },
      outcomeMemories: { orderBy: { createdAt: "desc" } },
      draft: true,
      candidate: true,
      workflowRun: {
        include: {
          stageEvents: { orderBy: { createdAt: "asc" } },
        },
      },
    },
    orderBy: { submittedAt: "asc" },
    take: 1000,
  });

  const examples = packets
    .map((packet) => {
      const latestDecision = packet.reviewDecisions[0] ?? null;
      const latestOutcome = packet.outcomeMemories[0] ?? null;
      const label = inferLearningLabel({
        packetState: packet.packetState,
        latestDecision: latestDecision?.decision ?? null,
        latestOutcomeEvent: latestOutcome?.eventType ?? null,
      });
      if (input.labels?.length && !input.labels.includes(label)) return null;

      return {
        packetId: packet.id,
        workflowRunId: packet.workflowRunId,
        candidateId: packet.candidateId,
        draftId: packet.draftId,
        destinationKey: input.destinationKey,
        label,
        packetState: packet.packetState,
        bridgeVersion: packet.bridgeVersion,
        adapterVersion: packet.draft.adapterVersion,
        draftPayload: packet.draftPayload,
        draftCanonical: packet.draft.draftJson,
        evidenceSummary: packet.evidenceSummary,
        diagnostics: packet.diagnostics,
        mediaSummary: packet.mediaSummary,
        latestDecision: latestDecision
          ? {
              decision: latestDecision.decision,
              reasonCode: latestDecision.decisionReasonCode,
              notes: latestDecision.decisionNotes,
              requestedAction: latestDecision.requestedAction,
              correctedDraftPayload: latestDecision.correctedDraftPayload,
              correctionSummary: latestDecision.correctionSummary,
              correctedFactsJson: latestDecision.correctedFactsJson,
              factCorrectionSummary: latestDecision.factCorrectionSummary,
              promotedFactSnapshotId: latestDecision.promotedFactSnapshotId,
              promotedDraftId: latestDecision.promotedDraftId,
              reviewedBy: latestDecision.reviewedBy,
              reviewedAt: latestDecision.reviewedAt.toISOString(),
            }
          : null,
        outcomeTrail: packet.outcomeMemories.map((item) => ({
          eventType: item.eventType,
          reasonCode: item.reasonCode,
          notes: item.notes,
          actorType: item.actorType,
          actorId: item.actorId,
          createdAt: item.createdAt.toISOString(),
          payload: item.payload,
        })),
        workflowRun: {
          workflowKind: packet.workflowRun.workflowKind,
          currentStage: packet.workflowRun.currentStage,
          state: packet.workflowRun.state,
          metadata: packet.workflowRun.metadata,
          stageEvents: packet.workflowRun.stageEvents.map((item) => ({
            stage: item.stage,
            status: item.status,
            attempt: item.attempt,
            errorCode: item.errorCode,
            errorMessage: item.errorMessage,
            metadata: item.metadata,
            createdAt: item.createdAt.toISOString(),
          })),
        },
        candidate: {
          canonicalSourceUrl: packet.candidate.canonicalSourceUrl,
          status: packet.candidate.status,
          metadata: packet.candidate.metadata,
        },
        exportMetadata: {
          exportedAt: new Date().toISOString(),
          needsReplay:
            label === "REWORK_REQUIRED" || label === "PUBLISH_FAILED" || label === "PUBLISH_BLOCKED" || label === "PUBLISH_PARTIAL",
          highValueNegative:
            label === "REJECTED" || label === "PUBLISH_FAILED" || label === "PUBLISH_BLOCKED",
        },
      };
    })
    .filter(Boolean);

  return {
    exportedAt: new Date().toISOString(),
    destinationKey: input.destinationKey,
    count: examples.length,
    items: examples,
  };
}
