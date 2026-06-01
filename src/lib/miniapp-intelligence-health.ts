import { DestinationMissionState, PipelineJobStatus } from "@prisma/client";

import { resolveEffectiveUnitCapabilities } from "@/lib/check-foundation";
import { prisma } from "@/lib/db";
import { DESTINATION_KEYS, type DestinationKey } from "@/lib/destination-workflow-contract";

export type MiniappFreshnessState = "fresh" | "stale" | "missing" | "unknown";
export type MiniappMissionState = "none" | "active" | "review" | "published" | "failed_recoverable" | "failed_terminal" | "exhausted" | "paused";
export type MiniappReviewState = "none" | "awaiting_review" | "approved" | "rework_requested" | "rejected" | "mixed";
export type MiniappPublishState = "none" | "published" | "publishing" | "failed";
export type MiniappFailureState = "none" | "recoverable" | "terminal" | "pipeline_failed" | "unknown";
export type MiniappRetryState = "none" | "retrying" | "retry_available" | "manual_recovery_required";
export type MiniappOverallHealthState =
  | "healthy"
  | "setup_required"
  | "disabled"
  | "stale"
  | "blocked"
  | "retrying"
  | "disconnected"
  | "unknown";

export type MiniappIntelligenceHealth = {
  destinationKey: DestinationKey;
  enabled: boolean;
  miniappBlockEnabled: boolean;
  destinationActive: boolean;
  destinationInstanceId: string | null;
  localConnected: boolean;
  freshnessState: MiniappFreshnessState;
  missionState: MiniappMissionState;
  reviewState: MiniappReviewState;
  publishState: MiniappPublishState;
  failureState: MiniappFailureState;
  retryState: MiniappRetryState;
  overallState: MiniappOverallHealthState;
  lastHealthyAt: string | null;
  latestInputAt: string | null;
  latestMissionAt: string | null;
  latestReviewAt: string | null;
  latestPublishAt: string | null;
  blockers: string[];
  recoveryActions: string[];
  evidenceRefs: string[];
  counts: {
    sourceDocuments: number;
    candidates: number;
    missionRuns: number;
    openReviewPackets: number;
    approvedReviewPackets: number;
    publishOutcomes: number;
    failedPipelineJobs: number;
  };
};

const FRESH_INPUT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const FRESH_PROJECTION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readVisitorReadiness(
  destinationInstanceConfig: unknown,
  destinationKey: DestinationKey,
): { blueprintActive: boolean; taxonomyReady: boolean; sourceDatacards: number } {
  const config = asRecord(destinationInstanceConfig);
  const visitor = asRecord(config?.visitor);
  const blueprints = asRecord(visitor?.blueprints);
  const taxonomies = asRecord(visitor?.taxonomies);
  if (!blueprints) return { blueprintActive: false, taxonomyReady: false, sourceDatacards: 0 };
  const candidateKeys = Object.keys(blueprints).filter((key) => {
    const lower = key.toLowerCase();
    if (destinationKey === "classscout") return lower.includes("classscout");
    return lower.includes("compare") || lower.includes("rangescout");
  });
  for (const key of candidateKeys) {
    const blueprint = asRecord(blueprints[key]);
    const state = typeof blueprint?.state === "string" ? blueprint.state.toLowerCase() : "draft";
    const taxonomyReady = Boolean(taxonomies && asRecord(taxonomies[key]));
    const sourceDatacards = Number(asRecord(blueprint)?.sourceDatacardCount ?? 0);
    if (state === "active") {
      return { blueprintActive: true, taxonomyReady, sourceDatacards };
    }
  }
  return { blueprintActive: false, taxonomyReady: false, sourceDatacards: 0 };
}

function toIso(value?: Date | string | null) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function latestDate(...values: Array<Date | string | null | undefined>) {
  const parsed = values
    .map((value) => {
      if (!value) return null;
      const date = value instanceof Date ? value : new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    })
    .filter((value): value is Date => Boolean(value))
    .sort((left, right) => right.getTime() - left.getTime());
  return parsed[0] ?? null;
}

function isRecent(value: Date | null, maxAgeMs: number) {
  return Boolean(value && Date.now() - value.getTime() <= maxAgeMs);
}

function readLocalConnected(observabilitySummary: unknown) {
  const summary = asRecord(observabilitySummary);
  const heartbeat = asRecord(summary?.guardianHeartbeat);
  if (!heartbeat) return false;
  if (heartbeat.workerAlive === true) return true;
  const healthState = typeof heartbeat.healthState === "string" ? heartbeat.healthState.toLowerCase() : "";
  return healthState === "healthy" || healthState === "ok" || healthState === "running";
}

function readProjectionGeneratedAt(snapshot: { webappProjection?: unknown } | null) {
  const projection = asRecord(snapshot?.webappProjection);
  const generatedAt = projection?.generatedAt;
  if (typeof generatedAt !== "string") return null;
  const parsed = new Date(generatedAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveMissionState(latestMission: { state: DestinationMissionState } | null): MiniappMissionState {
  if (!latestMission) return "none";
  switch (latestMission.state) {
    case DestinationMissionState.QUEUED:
    case DestinationMissionState.CATALOG_INSPECTED:
    case DestinationMissionState.DISCOVERING:
    case DestinationMissionState.PUBLISHING:
      return "active";
    case DestinationMissionState.CANDIDATE_IN_REVIEW:
      return "review";
    case DestinationMissionState.PUBLISHED_VERIFIED:
      return "published";
    case DestinationMissionState.FAILED_RECOVERABLE:
      return "failed_recoverable";
    case DestinationMissionState.FAILED_TERMINAL:
      return "failed_terminal";
    case DestinationMissionState.EXHAUSTED:
      return "exhausted";
    case DestinationMissionState.PAUSED:
      return "paused";
    default:
      return "none";
  }
}

function resolveReviewState(input: {
  openReviewPackets: number;
  approvedReviewPackets: number;
  reworkPackets: number;
  rejectedPackets: number;
}): MiniappReviewState {
  const activeKinds = [
    input.openReviewPackets > 0 ? "awaiting_review" : null,
    input.approvedReviewPackets > 0 ? "approved" : null,
    input.reworkPackets > 0 ? "rework_requested" : null,
    input.rejectedPackets > 0 ? "rejected" : null,
  ].filter(Boolean);
  if (activeKinds.length === 0) return "none";
  if (activeKinds.length > 1) return "mixed";
  return activeKinds[0] as MiniappReviewState;
}

function resolvePublishState(input: { publishOutcomes: number; publishingMission: boolean; failedPublishing: boolean }): MiniappPublishState {
  if (input.publishOutcomes > 0) return "published";
  if (input.failedPublishing) return "failed";
  if (input.publishingMission) return "publishing";
  return "none";
}

function buildOverallState(input: {
  enabled: boolean;
  destinationActive: boolean;
  localConnected: boolean;
  freshnessState: MiniappFreshnessState;
  failureState: MiniappFailureState;
  retryState: MiniappRetryState;
  missionState: MiniappMissionState;
  publishState: MiniappPublishState;
  reviewState: MiniappReviewState;
}): MiniappOverallHealthState {
  if (!input.enabled) return "disabled";
  if (!input.destinationActive) return "setup_required";
  if (!input.localConnected) return "disconnected";
  if (input.retryState === "retrying") return "retrying";
  if (input.failureState === "terminal" || input.retryState === "manual_recovery_required") return "blocked";
  if (input.failureState === "recoverable" || input.failureState === "pipeline_failed") return "blocked";
  if (input.freshnessState === "stale" || input.freshnessState === "missing") return "stale";
  if (input.publishState === "published" || input.reviewState !== "none" || input.missionState !== "none") return "healthy";
  return "unknown";
}

function buildRecoveryActions(input: {
  enabled: boolean;
  destinationActive: boolean;
  localConnected: boolean;
  freshnessState: MiniappFreshnessState;
  failureState: MiniappFailureState;
  retryState: MiniappRetryState;
  destinationKey: DestinationKey;
}) {
  const actions: string[] = [];
  if (!input.enabled) actions.push(`Enable ${input.destinationKey} in Block Control Center.`);
  if (!input.destinationActive) actions.push(`Create or reactivate the ${input.destinationKey} destination instance.`);
  if (!input.localConnected) actions.push("Restart or reconnect Local and confirm guardian heartbeat.");
  if (input.freshnessState === "missing") actions.push("Add or refresh destination source intelligence.");
  if (input.freshnessState === "stale") actions.push("Run a Local refresh cycle for destination intelligence.");
  if (input.retryState === "retry_available") actions.push("Retry the latest recoverable destination mission.");
  if (input.retryState === "manual_recovery_required") actions.push("Open Miniapp Ops and resolve the terminal blocker manually.");
  if (input.failureState === "pipeline_failed") actions.push("Recover failed destination mission daemon pipeline jobs.");
  return actions;
}

function buildBlockers(input: {
  enabled: boolean;
  destinationActive: boolean;
  localConnected: boolean;
  freshnessState: MiniappFreshnessState;
  failureState: MiniappFailureState;
  retryState: MiniappRetryState;
}) {
  const blockers: string[] = [];
  if (!input.enabled) blockers.push("Miniapp capability is disabled.");
  if (!input.destinationActive) blockers.push("Destination instance is not active.");
  if (!input.localConnected) blockers.push("Local AI runtime is not connected.");
  if (input.freshnessState === "missing") blockers.push("No destination intelligence input exists.");
  if (input.freshnessState === "stale") blockers.push("Destination intelligence input is stale.");
  if (input.failureState === "recoverable") blockers.push("Latest mission failed but can be retried.");
  if (input.failureState === "terminal") blockers.push("Latest mission failed terminally.");
  if (input.failureState === "pipeline_failed") blockers.push("Destination mission pipeline job failed.");
  if (input.retryState === "retrying") blockers.push("Destination intelligence flow is retrying.");
  return blockers;
}

export async function getMiniappIntelligenceHealth(companyId: string, destinationKey: DestinationKey): Promise<MiniappIntelligenceHealth> {
  const [company, classScoutInstance, compareInstance, destinationInstance, snapshot] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, workerConfig: true },
    }),
    prisma.destinationInstance.findFirst({
      where: { companyId, destinationKey: "classscout", isActive: true },
      select: { id: true },
    }),
    prisma.destinationInstance.findFirst({
      where: { companyId, destinationKey: "compare", isActive: true },
      select: { id: true },
    }),
    prisma.destinationInstance.findFirst({
      where: { companyId, destinationKey, isActive: true },
      orderBy: { updatedAt: "desc" },
      select: { id: true, updatedAt: true, config: true },
    }),
    prisma.intelligenceSnapshot.findUnique({
      where: { companyId },
      select: { observabilitySummary: true, webappProjection: true },
    }),
  ]);

  const effective = resolveEffectiveUnitCapabilities({
    workerConfig: company?.workerConfig,
    hasClassScoutDestination: Boolean(classScoutInstance),
    hasCompareDestination: Boolean(compareInstance),
  });
  const miniappBlockEnabled = effective.enabledBlocks.includes("miniapp");
  const enabled = miniappBlockEnabled && effective.enabledMiniapps.includes(destinationKey);
  const destinationInstanceId = destinationInstance?.id ?? null;
  const visitorReadiness = readVisitorReadiness(destinationInstance?.config, destinationKey);
  const localConnected = readLocalConnected(snapshot?.observabilitySummary);

  const [
    latestSourceDocument,
    sourceDocumentCount,
    candidateCount,
    latestCandidate,
    latestMission,
    missionRunCount,
    openReviewPackets,
    approvedReviewPackets,
    reworkPackets,
    rejectedPackets,
    latestReviewPacket,
    publishOutcomes,
    latestPublishOutcome,
    failedPipelineJobs,
    runningPipelineJobs,
  ] = await Promise.all([
    destinationInstanceId
      ? prisma.destinationSourceDocument.findFirst({
          where: { companyId, destinationInstanceId },
          orderBy: [{ fetchedAt: "desc" }, { updatedAt: "desc" }],
          select: { id: true, fetchedAt: true, updatedAt: true, createdAt: true },
        })
      : Promise.resolve(null),
    destinationInstanceId ? prisma.destinationSourceDocument.count({ where: { companyId, destinationInstanceId } }) : Promise.resolve(0),
    destinationInstanceId ? prisma.destinationCandidate.count({ where: { companyId, destinationInstanceId } }) : Promise.resolve(0),
    destinationInstanceId
      ? prisma.destinationCandidate.findFirst({
          where: { companyId, destinationInstanceId },
          orderBy: { updatedAt: "desc" },
          select: { id: true, updatedAt: true },
        })
      : Promise.resolve(null),
    destinationInstanceId
      ? prisma.destinationMissionRun.findFirst({
          where: { companyId, destinationInstanceId, destinationKey },
          orderBy: { updatedAt: "desc" },
          select: { id: true, state: true, updatedAt: true, failureCode: true, failureDetail: true },
        })
      : Promise.resolve(null),
    destinationInstanceId ? prisma.destinationMissionRun.count({ where: { companyId, destinationInstanceId, destinationKey } }) : Promise.resolve(0),
    destinationInstanceId ? prisma.destinationReviewPacket.count({ where: { companyId, destinationInstanceId, packetState: "AWAITING_REVIEW" } }) : Promise.resolve(0),
    destinationInstanceId ? prisma.destinationReviewPacket.count({ where: { companyId, destinationInstanceId, packetState: "APPROVED" } }) : Promise.resolve(0),
    destinationInstanceId ? prisma.destinationReviewPacket.count({ where: { companyId, destinationInstanceId, packetState: "REWORK_REQUESTED" } }) : Promise.resolve(0),
    destinationInstanceId ? prisma.destinationReviewPacket.count({ where: { companyId, destinationInstanceId, packetState: "REJECTED" } }) : Promise.resolve(0),
    destinationInstanceId
      ? prisma.destinationReviewPacket.findFirst({
          where: { companyId, destinationInstanceId },
          orderBy: { submittedAt: "desc" },
          select: { id: true, submittedAt: true, packetState: true },
        })
      : Promise.resolve(null),
    destinationInstanceId
      ? prisma.destinationOutcomeMemory.count({
          where: {
            companyId,
            destinationInstanceId,
            eventType: { in: ["publish_completed", "completed", "complete", "PUBLISHED_VERIFIED"] },
          },
        })
      : Promise.resolve(0),
    destinationInstanceId
      ? prisma.destinationOutcomeMemory.findFirst({
          where: {
            companyId,
            destinationInstanceId,
            eventType: { in: ["publish_completed", "completed", "complete", "PUBLISHED_VERIFIED"] },
          },
          orderBy: { createdAt: "desc" },
          select: { id: true, createdAt: true, eventType: true },
        })
      : Promise.resolve(null),
    prisma.pipelineJob.count({
      where: {
        companyId,
        jobType: "DESTINATION_MISSION_DAEMON",
        status: PipelineJobStatus.FAILED,
      },
    }),
    prisma.pipelineJob.count({
      where: {
        companyId,
        jobType: "DESTINATION_MISSION_DAEMON",
        status: PipelineJobStatus.RUNNING,
      },
    }),
  ]);

  const projectionGeneratedAt = readProjectionGeneratedAt(snapshot);
  const latestInputDate = latestDate(
    latestSourceDocument?.fetchedAt,
    latestSourceDocument?.updatedAt,
    latestSourceDocument?.createdAt,
    latestCandidate?.updatedAt,
    projectionGeneratedAt,
  );
  const freshnessState: MiniappFreshnessState = latestInputDate
    ? isRecent(latestInputDate, latestSourceDocument ? FRESH_INPUT_MAX_AGE_MS : FRESH_PROJECTION_MAX_AGE_MS)
      ? "fresh"
      : "stale"
    : "missing";
  const missionState = resolveMissionState(latestMission);
  const reviewState = resolveReviewState({ openReviewPackets, approvedReviewPackets, reworkPackets, rejectedPackets });
  const publishState = resolvePublishState({
    publishOutcomes,
    publishingMission: latestMission?.state === DestinationMissionState.PUBLISHING,
    failedPublishing: latestMission?.state === DestinationMissionState.FAILED_TERMINAL && /publish/i.test(latestMission.failureCode ?? ""),
  });
  const failureState: MiniappFailureState =
    failedPipelineJobs > 0
      ? "pipeline_failed"
      : latestMission?.state === DestinationMissionState.FAILED_RECOVERABLE
        ? "recoverable"
        : latestMission?.state === DestinationMissionState.FAILED_TERMINAL
          ? "terminal"
          : "none";
  const retryState: MiniappRetryState =
    runningPipelineJobs > 0
      ? "retrying"
      : latestMission?.state === DestinationMissionState.FAILED_RECOVERABLE
        ? "retry_available"
        : latestMission?.state === DestinationMissionState.FAILED_TERMINAL
          ? "manual_recovery_required"
          : "none";
  const overallState = buildOverallState({
    enabled,
    destinationActive: Boolean(destinationInstance),
    localConnected,
    freshnessState,
    failureState,
    retryState,
    missionState,
    publishState,
    reviewState,
  });
  const latestMissionAt = latestMission?.updatedAt ?? null;
  const latestReviewAt = latestReviewPacket?.submittedAt ?? null;
  const latestPublishAt = latestPublishOutcome?.createdAt ?? null;
  const lastHealthyAt = latestDate(latestPublishAt, latestReviewAt, missionState !== "none" ? latestMissionAt : null);
  const blockers = buildBlockers({ enabled, destinationActive: Boolean(destinationInstance), localConnected, freshnessState, failureState, retryState });
  const recoveryActions = buildRecoveryActions({ enabled, destinationActive: Boolean(destinationInstance), localConnected, freshnessState, failureState, retryState, destinationKey });
  if (destinationInstance && !visitorReadiness.blueprintActive) {
    blockers.push("Visitor blueprint is missing or not active.");
    recoveryActions.push("Activate the Visitor blueprint before running destination missions.");
  }
  if (destinationInstance && !visitorReadiness.taxonomyReady) {
    blockers.push("Visitor taxonomy is missing.");
    recoveryActions.push("Create or sync Visitor taxonomy for this miniapp.");
  }
  const evidenceRefs = [
    destinationInstanceId ? `destinationInstance:${destinationInstanceId}` : null,
    latestSourceDocument?.id ? `destinationSourceDocument:${latestSourceDocument.id}` : null,
    latestCandidate?.id ? `destinationCandidate:${latestCandidate.id}` : null,
    latestMission?.id ? `destinationMissionRun:${latestMission.id}` : null,
    latestReviewPacket?.id ? `destinationReviewPacket:${latestReviewPacket.id}` : null,
    latestPublishOutcome?.id ? `destinationOutcomeMemory:${latestPublishOutcome.id}` : null,
    projectionGeneratedAt ? `webappProjection:${projectionGeneratedAt.toISOString()}` : null,
  ].filter((value): value is string => Boolean(value));

  return {
    destinationKey,
    enabled,
    miniappBlockEnabled,
    destinationActive: Boolean(destinationInstance),
    destinationInstanceId,
    localConnected,
    freshnessState,
    missionState,
    reviewState,
    publishState,
    failureState,
    retryState,
    overallState,
    lastHealthyAt: toIso(lastHealthyAt),
    latestInputAt: toIso(latestInputDate),
    latestMissionAt: toIso(latestMissionAt),
    latestReviewAt: toIso(latestReviewAt),
    latestPublishAt: toIso(latestPublishAt),
    blockers,
    recoveryActions,
    evidenceRefs,
    counts: {
      sourceDocuments: sourceDocumentCount,
      candidates: candidateCount,
      missionRuns: missionRunCount,
      openReviewPackets,
      approvedReviewPackets,
      publishOutcomes,
      failedPipelineJobs,
    },
  };
}

export async function getAllMiniappIntelligenceHealth(companyId: string) {
  const entries = await Promise.all(
    DESTINATION_KEYS.map((destinationKey) => getMiniappIntelligenceHealth(companyId, destinationKey)),
  );
  return Object.fromEntries(entries.map((entry) => [entry.destinationKey, entry])) as Record<DestinationKey, MiniappIntelligenceHealth>;
}
