import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import {
  PIPELINE_QUEUE_COLUMNS,
  applyManualPipelineQueueMove,
  listPersistedCompanyPipelineJobs,
  resetCompanyPipelineJobsToAiOnly,
} from "@/lib/pipeline-queue";
import type { PipelineQueueColumn } from "@/lib/pipeline-queue";
import { recordInteractionEventFromRequest, recordOutcomeEvent } from "@/lib/audit-ledger";
import { SURFACE_BOARD_CONFIG } from "@/lib/board-state";
import { buildLocalJobEnvelopeFromPipelineJob, resolvePipelineJobAttribution } from "@/lib/local-job-attribution";
import { guardedUnitMutation } from "@/lib/check-foundation";

export const dynamic = "force-dynamic";

function isPipelineQueueColumn(value: string): value is PipelineQueueColumn {
  return (PIPELINE_QUEUE_COLUMNS as readonly string[]).includes(value);
}

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  try {
    const jobs = await listPersistedCompanyPipelineJobs(prisma, companyId);
    return NextResponse.json(
      jobs.map((job) => ({
        ...job,
        attribution: resolvePipelineJobAttribution(job),
        localJob: buildLocalJobEnvelopeFromPipelineJob(job),
        boardState: {
          boardKey: SURFACE_BOARD_CONFIG.pipeline.boardKey,
          entityType: SURFACE_BOARD_CONFIG.pipeline.entityType,
          columnKey: job.queueColumn,
          orderRank: Number(job.manualSortOrder ?? 0),
          priority: Number(job.priorityScore ?? 0),
        },
      })),
    );
  } catch (error) {
    console.error("[API:PipelineJobs] GET failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const payload = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
    }
    const data = payload as Record<string, unknown>;
    const companyId = typeof data.companyId === "string" ? data.companyId : "";
    if (!companyId) {
      return NextResponse.json({ error: "companyId required" }, { status: 400 });
    }

    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;
    if (!auth.membership) {
      return NextResponse.json({ error: "Membership required" }, { status: 403 });
    }

    if (data.action === "RESET_AI_ONLY") {
      const jobs = await guardedUnitMutation({
        companyId,
        role: auth.membership.role,
        actorId: auth.membership.id,
        actorEmail: auth.membership.email,
        permission: "local.job.retry",
        targetType: "local_job",
        targetId: "pipeline-queue",
        reason: "Pipeline queue reset to AI-only mode.",
        payload: { action: "RESET_AI_ONLY" },
        action: () => resetCompanyPipelineJobsToAiOnly(prisma, companyId),
      });
      await recordInteractionEventFromRequest(request, {
        companyId,
        surface: "pipeline-queue",
        interactionType: "PIPELINE_RESET_AI_ONLY",
        entityType: "PIPELINE_QUEUE",
        entityId: companyId,
        payload: { action: "RESET_AI_ONLY" },
        teachingWeight: 80,
      });
      await recordOutcomeEvent({
        companyId,
        actorType: "HUMAN",
        entityType: "PIPELINE_QUEUE",
        entityId: companyId,
        outcomeType: "PIPELINE_RESET_AI_ONLY",
        outcomeValue: "AI_ONLY",
        payload: { count: jobs.length },
        teachingWeight: 80,
      });
      return NextResponse.json(jobs);
    }

    if (data.action === "REORDER") {
      const movedJobId = typeof data.jobId === "string" ? data.jobId : "";
      const sourceColumn = typeof data.sourceColumn === "string" ? data.sourceColumn : "";
      const destinationColumn = typeof data.destinationColumn === "string" ? data.destinationColumn : "";
      const destinationColumnOrderIds = Array.isArray(data.destinationColumnOrderIds)
        ? data.destinationColumnOrderIds.filter((value: unknown): value is string => typeof value === "string")
        : [];
      const sourceColumnOrderIds = Array.isArray(data.sourceColumnOrderIds)
        ? data.sourceColumnOrderIds.filter((value: unknown): value is string => typeof value === "string")
        : [];

      if (!movedJobId || !sourceColumn || !destinationColumn) {
        return NextResponse.json({ error: "Missing reorder fields" }, { status: 400 });
      }
      if (!isPipelineQueueColumn(sourceColumn) || !isPipelineQueueColumn(destinationColumn)) {
        return NextResponse.json({ error: "Invalid queue column" }, { status: 400 });
      }

      const result = await guardedUnitMutation({
        companyId,
        role: auth.membership.role,
        actorId: auth.membership.id,
        actorEmail: auth.membership.email,
        permission: "local.job.retry",
        targetType: "local_job",
        targetId: movedJobId,
        reason: `Manual queue reorder from ${sourceColumn} to ${destinationColumn}.`,
        payload: {
          sourceColumn,
          destinationColumn,
          destinationColumnOrderIds,
          sourceColumnOrderIds,
        },
        action: () => applyManualPipelineQueueMove(
          prisma,
          companyId,
          movedJobId,
          sourceColumn,
          destinationColumn,
          destinationColumnOrderIds,
          sourceColumnOrderIds,
        ),
      });

      await recordInteractionEventFromRequest(request, {
        companyId,
        surface: "pipeline-queue",
        interactionType: "PIPELINE_MANUAL_REORDER",
        entityType: "PIPELINE_JOB",
        entityId: movedJobId,
        payload: {
          sourceColumn,
          destinationColumn,
          destinationColumnOrderIds,
          sourceColumnOrderIds,
        },
        teachingWeight: 95,
      });
      await recordOutcomeEvent({
        companyId,
        actorType: "HUMAN",
        entityType: "PIPELINE_JOB",
        entityId: movedJobId,
        outcomeType: "PIPELINE_MANUAL_REORDER",
        outcomeValue: `${sourceColumn}->${destinationColumn}`,
        payload: {
          destinationColumnOrderIds,
          sourceColumnOrderIds,
        },
        teachingWeight: 95,
      });

      return NextResponse.json(result.jobs);
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    if (error instanceof Error && (error as Error & { statusCode?: number }).statusCode === 403) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("[API:PipelineJobs] PATCH failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
