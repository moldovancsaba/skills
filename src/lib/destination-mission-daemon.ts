import { DestinationMissionState } from "@prisma/client";
import { prisma } from "@/lib/db";
import { listSchedulableDestinationMissionDefinitions } from "@/lib/destination-mission-definitions";
import { executeClassScoutMissionUntilBlocked } from "@/lib/destination-mission-runner";
import { listDestinationMissionRuns, startDestinationMissionRun } from "@/lib/destination-missions";
import { publishDestinationReviewPacket } from "@/lib/destination-publish-bridge";

type MissionRunWithPolicy = {
  id: string;
  state: DestinationMissionState;
  missionDefinitionRevision?: { configJson?: unknown } | null;
  policySnapshot?: { policyJson?: unknown } | null;
};

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

  return {
    maxRuns: Number.isFinite(maxRuns) ? Math.max(1, Math.min(maxRuns, 20)) : 5,
    maxPasses: Number.isFinite(maxPasses) ? Math.max(1, Math.min(maxPasses, 8)) : 3,
    maxAutoRejections: Number.isFinite(maxAutoRejections) ? Math.max(1, Math.min(maxAutoRejections, 10)) : 5,
  };
}

export async function executeDestinationMissionDaemonForCompany(input: {
  companyId: string;
  maxRuns?: number;
  maxPasses?: number;
  maxAutoRejections?: number;
}) {
  const defaults = readDaemonDefaults();
  const maxRuns = input.maxRuns ?? defaults.maxRuns;
  const maxPasses = input.maxPasses ?? defaults.maxPasses;
  const maxAutoRejections = input.maxAutoRejections ?? defaults.maxAutoRejections;

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

  const existingRuns = await listDestinationMissionRuns({
    companyId: input.companyId,
    destinationKey: "classscout",
    missionKind: "rulebook_new_listing",
  });

  const schedulableDefinitions = await listSchedulableDestinationMissionDefinitions({
    companyId: input.companyId,
    destinationKey: "classscout",
    missionKind: "rulebook_new_listing",
  });

  const activeDefinitionRunIds = new Set(
    existingRuns
      .filter((run) => materializationBlockingStates.has(run.state))
      .map((run) => run.missionDefinitionId)
      .filter((value): value is string => Boolean(value)),
  );

  const definitionsToMaterialize = schedulableDefinitions
    .filter((definition) => !activeDefinitionRunIds.has(definition.id))
    .slice(0, maxRuns);

  const materializedRuns = [];
  for (const definition of definitionsToMaterialize) {
    materializedRuns.push(
      await startDestinationMissionRun({
        companyId: input.companyId,
        destinationKey: "classscout",
        missionKind: "rulebook_new_listing",
        missionDefinitionId: definition.id,
        metadata: {
          startedFrom: "destination-mission-daemon",
          materializedFromDefinitionId: definition.id,
          materializedFromDefinitionName: definition.name,
        },
      }),
    );
  }

  const runs = await listDestinationMissionRuns({
    companyId: input.companyId,
    destinationKey: "classscout",
    missionKind: "rulebook_new_listing",
  });

  const selectedRuns = runs
    .filter((run) => eligibleStates.has(run.state))
    .filter((run) => {
      const mode = readExecutionMode(run);
      return mode === "guarded" || mode === "autopilot";
    })
    .slice(0, maxRuns);

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
      !approvedPacket.outcomeMemories.some((item) => item.eventType === "publish_completed") &&
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
      result = await executeClassScoutMissionUntilBlocked({
        companyId: input.companyId,
        missionId: run.id,
        actorId: "destination-mission-daemon",
        maxPasses,
        maxAutoRejections,
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
    ok: true,
    companyId: input.companyId,
    materialized: materializedRuns.length,
    processed: results.length,
    skipped: runs.length - results.length,
    results,
  };
}
