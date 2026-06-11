import { DestinationMissionState } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  resolveDestinationDaemonPolicy,
  type DestinationDaemonLimits,
} from "@/lib/check-foundation/destination-daemon-policy";
import {
  executeDestinationMaintenanceAdapters,
  readDestinationMaintenanceDefaults,
} from "@/lib/destination-maintenance-adapters";
import { getDestinationMissionKinds } from "@/lib/check-lifecycle/topology-registry";
import { listSchedulableDestinationMissionDefinitions } from "@/lib/destination-mission-definitions";
import { executeDestinationMissionUntilBlocked, SUPPORTED_DESTINATION_MISSION_KEYS } from "@/lib/destination-mission-runner";
import { listDestinationMissionRuns, startDestinationMissionRun } from "@/lib/destination-missions";
import { publishDestinationReviewPacket } from "@/lib/destination-publish-bridge";
import type { DestinationKey } from "@/lib/destination-workflow-contract";
import { filterDestinationKeysForLocalAiFocus, readLocalAiFocusPolicy } from "@/lib/local-ai-focus";

const DAEMON_DESTINATION_KEYS: DestinationKey[] = [...SUPPORTED_DESTINATION_MISSION_KEYS];

type MissionRunWithPolicy = {
  id: string;
  state: DestinationMissionState;
  failureCode?: string | null;
  destinationKey?: string;
  missionDefinitionRevision?: { configJson?: unknown } | null;
  policySnapshot?: { policyJson?: unknown } | null;
};

function destinationLabel(destinationKey: DestinationKey) {
  return destinationKey === "classscout" ? "ClassScout" : destinationKey === "compare" ? "Compare" : destinationKey;
}

function readExecutionMode(run: MissionRunWithPolicy) {
  const policy =
    run.policySnapshot && typeof run.policySnapshot === "object" && "policyJson" in run.policySnapshot
      ? (run.policySnapshot as { policyJson?: unknown }).policyJson
      : null;
  if (
    policy &&
    typeof policy === "object" &&
    !Array.isArray(policy) &&
    typeof (policy as Record<string, unknown>).executionMode === "string"
  ) {
    return String((policy as Record<string, unknown>).executionMode);
  }
  return "manual";
}

function requiresHumanPublishApproval(run: MissionRunWithPolicy) {
  const config =
    run.missionDefinitionRevision &&
    typeof run.missionDefinitionRevision === "object" &&
    "configJson" in run.missionDefinitionRevision
      ? run.missionDefinitionRevision.configJson
      : null;

  if (config && typeof config === "object" && !Array.isArray(config)) {
    const executionPolicy = (config as Record<string, unknown>).executionPolicy;
    if (executionPolicy && typeof executionPolicy === "object" && !Array.isArray(executionPolicy)) {
      const approvalFlag = (executionPolicy as Record<string, unknown>).requireHumanPublishApproval;
      if (typeof approvalFlag === "boolean") {
        return approvalFlag;
      }
    }
  }

  return true;
}

function isFinalPublishOutcome(outcome: { eventType: string; reasonCode?: string | null; payload?: unknown }) {
  if (outcome.eventType === "publish_completed" || outcome.eventType === "publish_blocked" || outcome.eventType === "publish_failed") {
    return true;
  }

  if (outcome.eventType !== "publish_bridge_failed") {
    return false;
  }

  const payload = outcome.payload && typeof outcome.payload === "object" && !Array.isArray(outcome.payload)
    ? outcome.payload as Record<string, unknown>
    : null;

  return outcome.reasonCode === "HTTP_422" || payload?.status === "blocked" || payload?.retryable === false;
}

function isSpentRecoverableRun(run: MissionRunWithPolicy) {
  return run.state === DestinationMissionState.FAILED_RECOVERABLE && run.failureCode === "auto_runner_retry_budget_exhausted";
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function readConfiguredDaemonCompanyIds() {
  return uniqueValues((process.env.DESTINATION_MISSION_DAEMON_COMPANY_IDS ?? "").split(","));
}

export function readDaemonDefaults() {
  const maxRuns = Number(process.env.DESTINATION_MISSION_DAEMON_MAX_RUNS ?? 5);
  const maxPasses = Number(process.env.DESTINATION_MISSION_DAEMON_MAX_PASSES ?? 3);
  const maxAutoRejections = Number(process.env.DESTINATION_MISSION_DAEMON_MAX_AUTO_REJECTIONS ?? 5);
  const maintenanceDefaults = readDestinationMaintenanceDefaults();

  return {
    maxRuns: Number.isFinite(maxRuns) ? Math.max(1, Math.min(maxRuns, 20)) : 5,
    maxPasses: Number.isFinite(maxPasses) ? Math.max(1, Math.min(maxPasses, 8)) : 3,
    maxAutoRejections: Number.isFinite(maxAutoRejections) ? Math.max(1, Math.min(maxAutoRejections, 10)) : 5,
    maxRevisionIntakes: maintenanceDefaults.maxRevisionIntakes,
    maxApprovedPublishes: maintenanceDefaults.maxApprovedPublishes,
  };
}

function clampDaemonLimit(value: number | undefined, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(Math.round(value), max));
}

function resolveDestinationDaemonLimits(input: {
  destinationKey: DestinationKey;
  defaults: DestinationDaemonLimits;
  policy: ReturnType<typeof resolveDestinationDaemonPolicy>;
  overrides: {
    maxRuns?: number;
    maxPasses?: number;
    maxAutoRejections?: number;
    maxRevisionIntakes?: number;
    maxApprovedPublishes?: number;
  };
}): DestinationDaemonLimits {
  const fallback = input.defaults;
  const fromPolicy = input.policy.byDestination[input.destinationKey] ?? input.policy.defaults;
  const base = fromPolicy ?? fallback;

  return {
    maxRuns: clampDaemonLimit(input.overrides.maxRuns, base.maxRuns, 1, 20),
    maxPasses: clampDaemonLimit(input.overrides.maxPasses, base.maxPasses, 1, 8),
    maxAutoRejections: clampDaemonLimit(input.overrides.maxAutoRejections, base.maxAutoRejections, 1, 10),
    maxRevisionIntakes: clampDaemonLimit(input.overrides.maxRevisionIntakes, base.maxRevisionIntakes, 1, 20),
    maxApprovedPublishes: clampDaemonLimit(input.overrides.maxApprovedPublishes, base.maxApprovedPublishes, 1, 20),
  };
}

function buildDestinationRunProfile(input: {
  destinationKey: DestinationKey;
  definitions: unknown[];
  runs: MissionRunWithPolicy[];
}) {
  const label = destinationLabel(input.destinationKey);
  const activeDefinitions = Array.isArray(input.definitions) ? input.definitions : [];
  const activeRuns = Array.isArray(input.runs) ? input.runs : [];
  const schedulableRuns = activeRuns.filter((run) => !isSpentRecoverableRun(run));
  const runStates = new Set(schedulableRuns.map((run) => String(run.state || "")));
  const autopilotRuns = activeRuns.filter((run) => readExecutionMode(run) === "autopilot");

  if (runStates.has("FAILED_RECOVERABLE")) {
    return {
      queueColumn: "NOW",
      priorityScore: 146,
      reason: `Recoverable ${label} destination work is waiting for immediate retry.`,
      sourceSignal: `destination:${input.destinationKey}:recoverable`,
    };
  }

  if (runStates.has("PUBLISHING")) {
    return {
      queueColumn: "NOW",
      priorityScore: 142,
      reason: `${label} destination work is in the publishing phase and should stay at the front of the lane.`,
      sourceSignal: `destination:${input.destinationKey}:publishing`,
    };
  }

  if (runStates.has("CANDIDATE_IN_REVIEW")) {
    return {
      queueColumn: "SOON",
      priorityScore: autopilotRuns.length > 0 ? 132 : 108,
      reason:
        autopilotRuns.length > 0
          ? `${label} autopilot review work is ready for continued queue-owned processing.`
          : `${label} destination work is waiting in review and should remain visible in the service lane.`,
      sourceSignal: autopilotRuns.length > 0
        ? `destination:${input.destinationKey}:autopilot-review`
        : `destination:${input.destinationKey}:review`,
    };
  }

  if (activeRuns.length > 0) {
    return {
      queueColumn: "SOON",
      priorityScore: 104,
      reason: `${activeRuns.length} ${label} destination run(s) are active or recently spent under guarded or autopilot execution.`,
      sourceSignal: `destination:${input.destinationKey}:active-runs`,
    };
  }

  return {
    queueColumn: "LATER",
    priorityScore: 88,
    reason: `${activeDefinitions.length} active scheduled ${label} mission definition(s) keep the lane armed for the next queue turn.`,
    sourceSignal: `destination:${input.destinationKey}:scheduled`,
  };
}

async function executeDestinationLaneForCompany(input: {
  companyId: string;
  destinationKey: DestinationKey;
  maxRuns: number;
  maxPasses: number;
  maxAutoRejections: number;
}) {
  const eligibleStates = new Set<DestinationMissionState>([
    DestinationMissionState.QUEUED,
    DestinationMissionState.CATALOG_INSPECTED,
    DestinationMissionState.DISCOVERING,
    DestinationMissionState.FAILED_RECOVERABLE,
    DestinationMissionState.CANDIDATE_IN_REVIEW,
    DestinationMissionState.PUBLISHING,
  ]);
  const materializationBlockingStates = new Set<DestinationMissionState>([
    ...eligibleStates,
    DestinationMissionState.PAUSED,
  ]);
  const missionKinds = getDestinationMissionKinds(input.destinationKey, { includeLegacy: true });

  const existingRunsByKind = await Promise.all(
    missionKinds.map((missionKind) => listDestinationMissionRuns({
      companyId: input.companyId,
      destinationKey: input.destinationKey,
      missionKind: missionKind as never,
    })),
  );
  const existingRuns = existingRunsByKind.flat();

  const schedulableDefinitionsByKind = await Promise.all(
    missionKinds.map((missionKind) => listSchedulableDestinationMissionDefinitions({
      companyId: input.companyId,
      destinationKey: input.destinationKey,
      missionKind,
    })),
  );
  const schedulableDefinitions = schedulableDefinitionsByKind.flat();

  const activeDefinitionRunIds = new Set(
    existingRuns
      .filter((run) => materializationBlockingStates.has(run.state))
      .filter((run) => !isSpentRecoverableRun(run))
      .map((run) => run.missionDefinitionId)
      .filter((value): value is string => Boolean(value)),
  );

  const definitionsToMaterialize = schedulableDefinitions
    .filter((definition) => !activeDefinitionRunIds.has(definition.id))
    .slice(0, input.maxRuns);

  const materializedRuns = [];
  for (const definition of definitionsToMaterialize) {
    materializedRuns.push(
      await startDestinationMissionRun({
        companyId: input.companyId,
        destinationKey: input.destinationKey,
        missionKind: definition.missionKind as never,
        missionDefinitionId: definition.id,
        metadata: {
          startedFrom: "destination-mission-daemon",
          materializedFromDefinitionId: definition.id,
          materializedFromDefinitionName: definition.name,
          destinationKey: input.destinationKey,
          missionKind: definition.missionKind,
        },
      }),
    );
  }

  const runsByKind = await Promise.all(
    missionKinds.map((missionKind) => listDestinationMissionRuns({
      companyId: input.companyId,
      destinationKey: input.destinationKey,
      missionKind: missionKind as never,
    })),
  );
  const runs = runsByKind.flat();

  const selectedRuns = runs
    .filter((run) => eligibleStates.has(run.state))
    .filter((run) => !isSpentRecoverableRun(run))
    .filter((run) => {
      const mode = readExecutionMode(run);
      return mode === "guarded" || mode === "autopilot";
    })
    .slice(0, input.maxRuns);

  const results = [];
  for (const run of selectedRuns) {
    const executionMode = readExecutionMode(run);
    const approvedPacket =
      executionMode === "autopilot"
        ? await prisma.destinationReviewPacket.findFirst({
            where: {
              companyId: input.companyId,
              workflowRunId: run.id,
              packetState: "APPROVED",
            },
            include: {
              outcomeMemories: {
                orderBy: { createdAt: "desc" },
                take: 5,
              },
            },
            orderBy: { updatedAt: "desc" },
          })
        : null;

    const canAutoPublish =
      executionMode === "autopilot" &&
      !requiresHumanPublishApproval(run) &&
      approvedPacket &&
      !approvedPacket.outcomeMemories.some((item) => isFinalPublishOutcome(item)) &&
      (run.state === DestinationMissionState.PUBLISHING || run.state === DestinationMissionState.CANDIDATE_IN_REVIEW);

    let result;
    if (canAutoPublish && approvedPacket) {
      result = {
        ok: true,
        autopublish: true,
        publish: await publishDestinationReviewPacket({
          companyId: input.companyId,
          reviewPacketId: approvedPacket.id,
          reviewedBy: "destination-mission-daemon",
        }),
      };
    } else {
      result = await executeDestinationMissionUntilBlocked({
        companyId: input.companyId,
        missionId: run.id,
        actorId: "destination-mission-daemon",
        maxPasses: input.maxPasses,
        maxAutoRejections: input.maxAutoRejections,
      });
    }

    results.push({
      missionId: run.id,
      state: run.state,
      executionMode,
      requireHumanPublishApproval: requiresHumanPublishApproval(run),
      result,
    });
  }

  return {
    destinationKey: input.destinationKey,
    materialized: materializedRuns.length,
    processed: results.length,
    skipped: runs.length - results.length,
    profile: buildDestinationRunProfile({
      destinationKey: input.destinationKey,
      definitions: schedulableDefinitions,
      runs: selectedRuns,
    }),
    results,
  };
}

export async function executeDestinationMissionDaemonForCompany(input: {
  companyId: string;
  destinationKey?: DestinationKey;
  maxRuns?: number;
  maxPasses?: number;
  maxAutoRejections?: number;
  maxRevisionIntakes?: number;
  maxApprovedPublishes?: number;
}) {
  const defaults = readDaemonDefaults();
  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { id: true, workerConfig: true },
  });
  if (!company) {
    throw new Error(`Company ${input.companyId} not found for destination mission daemon.`);
  }

  const resolvedPolicy = resolveDestinationDaemonPolicy({
    workerConfig: company.workerConfig,
    fallbackDefaults: defaults,
  });
  const byDestinationLimits = {} as Record<DestinationKey, DestinationDaemonLimits>;

  const focusPolicy = readLocalAiFocusPolicy();
  const destinationKeys = filterDestinationKeysForLocalAiFocus(
    input.destinationKey ? [input.destinationKey] : DAEMON_DESTINATION_KEYS,
    focusPolicy,
  ) as DestinationKey[];
  const destinationResults = [];
  for (const destinationKey of destinationKeys) {
    const destinationLimits = resolveDestinationDaemonLimits({
      destinationKey,
      defaults,
      policy: resolvedPolicy,
      overrides: {
        maxRuns: input.maxRuns,
        maxPasses: input.maxPasses,
        maxAutoRejections: input.maxAutoRejections,
        maxRevisionIntakes: input.maxRevisionIntakes,
        maxApprovedPublishes: input.maxApprovedPublishes,
      },
    });
    byDestinationLimits[destinationKey] = destinationLimits;

    destinationResults.push(await executeDestinationLaneForCompany({
      companyId: input.companyId,
      destinationKey,
      maxRuns: destinationLimits.maxRuns,
      maxPasses: destinationLimits.maxPasses,
      maxAutoRejections: destinationLimits.maxAutoRejections,
    }));
  }

  const maintenance = await executeDestinationMaintenanceAdapters({
    companyId: input.companyId,
    actorId: "destination-mission-daemon",
    byDestinationLimits,
  });

  return {
    ok: true,
    companyId: input.companyId,
    destinationScope: input.destinationKey ?? null,
    focusScope: focusPolicy.enabled ? focusPolicy.destinationKeys : null,
    materialized: destinationResults.reduce((sum, item) => sum + Number(item.materialized || 0), 0),
    processed: destinationResults.reduce((sum, item) => sum + Number(item.processed || 0), 0),
    skipped: destinationResults.reduce((sum, item) => sum + Number(item.skipped || 0), 0),
    destinationResults,
    results: destinationResults.flatMap((item) => item.results.map((result) => ({
      destinationKey: item.destinationKey,
      ...result,
    }))),
    policy: {
      source: resolvedPolicy.source,
      warnings: resolvedPolicy.warnings,
      defaults: resolvedPolicy.defaults,
      byDestination: resolvedPolicy.byDestination,
      effectiveByDestination: byDestinationLimits,
    },
    maintenance,
  };
}
