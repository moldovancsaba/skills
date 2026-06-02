import { NextRequest, NextResponse } from "next/server";
import { DestinationMissionState } from "@prisma/client";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { listPersistedCompanyPipelineJobs } from "@/lib/pipeline-queue";
import { normalizeDestinationKey } from "@/lib/destination-scope";
import { DESTINATION_KEYS, type DestinationKey } from "@/lib/destination-workflow-contract";
import { buildProjectionMetadata, normalizeWebappProjection } from "@/lib/webapp-projection";

export const dynamic = "force-dynamic";

type OperationalSeverity = "info" | "warning" | "critical";
type OperationalStatus = "running" | "retrying" | "failed" | "dead_lettered" | "stale" | "blocked" | "resolved";
type OperationalAction = "retry" | "cancel" | "replay" | "rollback" | "acknowledge";

type UnitOperationalItem = {
  id: string;
  unitId: string;
  source: "local_job" | "miniapp_publish" | "read_model" | "content_refresh";
  severity: OperationalSeverity;
  status: OperationalStatus;
  summary: string;
  safeActions: OperationalAction[];
  lastAttemptAt?: string | null;
  nextAttemptAt?: string | null;
  meta?: Record<string, unknown>;
};

type SupportedDestinationKey = DestinationKey;

type DestinationDaemonHealth = {
  destinationKey: SupportedDestinationKey;
  status: "inactive" | "healthy" | "warning" | "critical";
  summary: string;
  activeDefinitionCount: number;
  activeRunCount: number;
  failedRecoverableCount: number;
  pausedCount: number;
  runCounts: Record<string, number>;
  lastRunUpdatedAt: string | null;
};

function normalizeOperationalStatusFromJob(status: string, attemptCount: number, lastError?: string | null): OperationalStatus {
  if (status === "RUNNING") return "running";
  if (status === "FAILED") {
    if (attemptCount >= 3 && lastError) return "dead_lettered";
    return "failed";
  }
  if (status === "PAUSED") return "blocked";
  if (status === "ACTIVE" && attemptCount > 0) return "retrying";
  return "resolved";
}

function severityFromOperationalStatus(status: OperationalStatus): OperationalSeverity {
  if (status === "failed" || status === "dead_lettered" || status === "blocked") return "critical";
  if (status === "retrying" || status === "stale") return "warning";
  return "info";
}

function actionsFromOperationalStatus(status: OperationalStatus): OperationalAction[] {
  if (status === "failed") return ["retry", "cancel", "acknowledge"];
  if (status === "dead_lettered") return ["replay", "rollback", "acknowledge"];
  if (status === "blocked") return ["retry", "cancel", "acknowledge"];
  if (status === "retrying") return ["cancel", "acknowledge"];
  if (status === "running") return ["cancel", "acknowledge"];
  if (status === "stale") return ["retry", "acknowledge"];
  return ["acknowledge"];
}

function destinationLabel(destinationKey: SupportedDestinationKey) {
  return destinationKey === "classscout" ? "ClassScout" : "Compare";
}

function buildDestinationDaemonHealth(input: {
  destinationKey: SupportedDestinationKey;
  activeDefinitionCount: number;
  runs: Array<{ state: string; updatedAt: Date }>;
}): DestinationDaemonHealth {
  const runCounts = input.runs.reduce<Record<string, number>>((acc, run) => {
    acc[run.state] = (acc[run.state] ?? 0) + 1;
    return acc;
  }, {});
  const failedRecoverableCount = runCounts.FAILED_RECOVERABLE ?? 0;
  const pausedCount = runCounts.PAUSED ?? 0;
  const activeRunCount = input.runs.length;
  const lastRunUpdatedAt = input.runs.length
    ? new Date(Math.max(...input.runs.map((run) => run.updatedAt.getTime()))).toISOString()
    : null;
  const label = destinationLabel(input.destinationKey);

  let status: DestinationDaemonHealth["status"] = "healthy";
  let summary = `${label} destination daemon lane is armed with active definitions.`;

  if (input.activeDefinitionCount === 0 && activeRunCount === 0) {
    status = "inactive";
    summary = `No active ${label} mission definitions or queued runs are configured.`;
  } else if (failedRecoverableCount > 0) {
    status = "critical";
    summary = `${failedRecoverableCount} ${label} run(s) are in recoverable failure and need immediate retry attention.`;
  } else if (pausedCount > 0) {
    status = "warning";
    summary = `${pausedCount} ${label} run(s) are paused and waiting for an operator decision.`;
  } else if (activeRunCount > 0) {
    status = "healthy";
    summary = `${activeRunCount} ${label} run(s) are actively queued or in progress.`;
  } else if (input.activeDefinitionCount > 0) {
    status = "healthy";
    summary = `${input.activeDefinitionCount} active ${label} mission definition(s) are ready for the next daemon cycle.`;
  }

  return {
    destinationKey: input.destinationKey,
    status,
    summary,
    activeDefinitionCount: input.activeDefinitionCount,
    activeRunCount,
    failedRecoverableCount,
    pausedCount,
    runCounts,
    lastRunUpdatedAt,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  if (!companyId) {
    return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
  }

  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;
  const destinationKeyRaw = request.nextUrl.searchParams.get("destinationKey");
  if (destinationKeyRaw && !normalizeDestinationKey(destinationKeyRaw)) {
    return NextResponse.json({ error: "destinationKey must be one of: classscout, compare" }, { status: 400 });
  }
  const destinationKeyScope = normalizeDestinationKey(destinationKeyRaw);

  try {
    const [pipelineJobs, snapshot, destinationDefinitions, destinationRuns] = await Promise.all([
      listPersistedCompanyPipelineJobs(prisma, companyId),
      prisma.intelligenceSnapshot.findUnique({
        where: { companyId },
        select: {
          webappProjection: true,
        },
      }),
      prisma.destinationMissionDefinition.findMany({
        where: {
          companyId,
          missionKind: "rulebook_new_listing",
          destinationKey: {
            in: [...DESTINATION_KEYS],
          },
          status: "active",
        },
        select: {
          destinationKey: true,
        },
      }),
      prisma.destinationMissionRun.findMany({
        where: {
          companyId,
          missionKind: "rulebook_new_listing",
          destinationKey: {
            in: [...DESTINATION_KEYS],
          },
          state: {
            in: [
              DestinationMissionState.QUEUED,
              DestinationMissionState.CATALOG_INSPECTED,
              DestinationMissionState.DISCOVERING,
              DestinationMissionState.CANDIDATE_IN_REVIEW,
              DestinationMissionState.PUBLISHING,
              DestinationMissionState.FAILED_RECOVERABLE,
              DestinationMissionState.PAUSED,
            ],
          },
        },
        select: {
          destinationKey: true,
          state: true,
          updatedAt: true,
        },
      }),
    ]);

    const items: UnitOperationalItem[] = [];

    for (const job of pipelineJobs) {
      const status = normalizeOperationalStatusFromJob(job.status, Number(job.attemptCount || 0), job.lastError);
      if (status === "resolved") continue;

      items.push({
        id: `local-job:${job.id}`,
        unitId: companyId,
        source: "local_job",
        severity: severityFromOperationalStatus(status),
        status,
        summary: `${job.jobType} is ${status}${job.lastError ? `: ${job.lastError}` : ""}`,
        safeActions: actionsFromOperationalStatus(status),
        lastAttemptAt: job.lastTriedAt ? new Date(job.lastTriedAt).toISOString() : null,
        nextAttemptAt: job.scheduledAt ? new Date(job.scheduledAt).toISOString() : null,
        meta: {
          jobId: job.id,
          jobType: job.jobType,
          queueColumn: job.queueColumn,
          attemptCount: Number(job.attemptCount || 0),
          actionBasePath: `/api/companies/${companyId}/operations/${encodeURIComponent(`local-job:${job.id}`)}`,
        },
      });
    }

    const projection = normalizeWebappProjection(snapshot?.webappProjection);
    const projectionMetadata = buildProjectionMetadata(projection);
    const projectionGeneratedAt = projectionMetadata.generatedAt;
    if (projectionMetadata.freshness.status === "STALE" || projectionMetadata.freshness.status === "MISSING") {
      items.push({
        id: "read-model:projection-stale",
        unitId: companyId,
        source: "read_model",
        severity: "warning",
        status: "stale",
        summary: "Webapp projection is stale or missing.",
        safeActions: ["retry", "acknowledge"],
        lastAttemptAt: projectionGeneratedAt,
        nextAttemptAt: null,
        meta: {
          generatedAt: projectionGeneratedAt,
          actionBasePath: `/api/companies/${companyId}/operations/${encodeURIComponent("read-model:projection-stale")}`,
        },
      });
    }

    const classScoutReviewPressureCount = Number(projection?.miniapps.classscout?.reviewPressureCount ?? 0);
    if (classScoutReviewPressureCount > 0) {
      items.push({
        id: "miniapp-publish:classscout-review-pressure",
        unitId: companyId,
        source: "miniapp_publish",
        severity: classScoutReviewPressureCount >= 10 ? "critical" : "warning",
        status: "retrying",
        summary: `${classScoutReviewPressureCount} ClassScout packets need review or publishing follow-up.`,
        safeActions: ["replay", "acknowledge"],
        lastAttemptAt: null,
        nextAttemptAt: null,
        meta: {
          packetCount: classScoutReviewPressureCount,
          destinationKey: "classscout",
          actionBasePath: `/api/companies/${companyId}/operations/${encodeURIComponent("miniapp-publish:classscout-review-pressure")}`,
        },
      });
    }

    const compareReviewPressureCount = Number(projection?.miniapps.compare?.reviewPressureCount ?? 0);
    if (compareReviewPressureCount > 0) {
      items.push({
        id: "miniapp-publish:compare-review-pressure",
        unitId: companyId,
        source: "miniapp_publish",
        severity: compareReviewPressureCount >= 10 ? "critical" : "warning",
        status: "retrying",
        summary: `${compareReviewPressureCount} Compare packets need review or publishing follow-up.`,
        safeActions: ["replay", "acknowledge"],
        lastAttemptAt: null,
        nextAttemptAt: null,
        meta: {
          packetCount: compareReviewPressureCount,
          destinationKey: "compare",
          actionBasePath: `/api/companies/${companyId}/operations/${encodeURIComponent("miniapp-publish:compare-review-pressure")}`,
        },
      });
    }

    const activeDefinitionsByDestination: Record<SupportedDestinationKey, number> = {
      classscout: 0,
      compare: 0,
    };
    for (const definition of destinationDefinitions) {
      const destinationKey = normalizeDestinationKey(definition.destinationKey);
      if (!destinationKey) continue;
      activeDefinitionsByDestination[destinationKey] += 1;
    }

    const runsByDestination: Record<SupportedDestinationKey, Array<{ state: string; updatedAt: Date }>> = {
      classscout: [],
      compare: [],
    };
    for (const run of destinationRuns) {
      const destinationKey = normalizeDestinationKey(run.destinationKey);
      if (!destinationKey) continue;
      runsByDestination[destinationKey].push({
        state: String(run.state || ""),
        updatedAt: run.updatedAt,
      });
    }

    const destinationDaemon = DESTINATION_KEYS.map((destinationKey) => {
      return buildDestinationDaemonHealth({
        destinationKey,
        activeDefinitionCount: activeDefinitionsByDestination[destinationKey],
        runs: runsByDestination[destinationKey],
      });
    });

    const severityRank: Record<OperationalSeverity, number> = { critical: 0, warning: 1, info: 2 };
    const sorted = [...items].sort((left, right) => {
      const severityDelta = severityRank[left.severity] - severityRank[right.severity];
      if (severityDelta !== 0) return severityDelta;
      const leftTime = left.lastAttemptAt ? new Date(left.lastAttemptAt).getTime() : 0;
      const rightTime = right.lastAttemptAt ? new Date(right.lastAttemptAt).getTime() : 0;
      return leftTime - rightTime;
    });

    const scopedItems = destinationKeyScope
      ? sorted.filter((item) => item.source !== "miniapp_publish" || item.meta?.destinationKey === destinationKeyScope)
      : sorted;
    const scopedDestinationDaemon = destinationKeyScope
      ? destinationDaemon.filter((lane) => lane.destinationKey === destinationKeyScope)
      : destinationDaemon;

    return NextResponse.json({
      unitId: companyId,
      generatedAt: new Date().toISOString(),
      destinationScope: destinationKeyScope ?? null,
      projection: {
        ...projectionMetadata,
        available: Boolean(projection),
      },
      items: scopedItems,
      destinationDaemon: {
        byDestination: scopedDestinationDaemon,
        summary: {
          total: scopedDestinationDaemon.length,
          critical: scopedDestinationDaemon.filter((item) => item.status === "critical").length,
          warning: scopedDestinationDaemon.filter((item) => item.status === "warning").length,
          healthy: scopedDestinationDaemon.filter((item) => item.status === "healthy").length,
          inactive: scopedDestinationDaemon.filter((item) => item.status === "inactive").length,
        },
      },
      summary: {
        total: scopedItems.length,
        critical: scopedItems.filter((item) => item.severity === "critical").length,
        warning: scopedItems.filter((item) => item.severity === "warning").length,
        info: scopedItems.filter((item) => item.severity === "info").length,
      },
    });
  } catch (error) {
    console.error("[API:CompanyOperations] Failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
