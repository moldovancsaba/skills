import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import {
  applyManualPipelineQueueMove,
  listPersistedCompanyPipelineJobs,
  resetCompanyPipelineJobsToAiOnly,
} from "@/lib/pipeline-queue";
import { recordInteractionEventFromRequest, recordOutcomeEvent } from "@/lib/audit-ledger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  try {
    const jobs = await listPersistedCompanyPipelineJobs(prisma, companyId);
    return NextResponse.json(jobs);
  } catch (error) {
    console.error("[API:PipelineJobs] GET failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const data = await request.json();
    const companyId = String(data.companyId || "");
    if (!companyId) {
      return NextResponse.json({ error: "companyId required" }, { status: 400 });
    }

    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;

    if (data.action === "RESET_AI_ONLY") {
      const jobs = await resetCompanyPipelineJobsToAiOnly(prisma, companyId);
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
      const movedJobId = String(data.jobId || "");
      const sourceColumn = String(data.sourceColumn || "");
      const destinationColumn = String(data.destinationColumn || "");
      const destinationColumnOrderIds = Array.isArray(data.destinationColumnOrderIds)
        ? data.destinationColumnOrderIds.filter((value: unknown): value is string => typeof value === "string")
        : [];
      const sourceColumnOrderIds = Array.isArray(data.sourceColumnOrderIds)
        ? data.sourceColumnOrderIds.filter((value: unknown): value is string => typeof value === "string")
        : [];

      if (!movedJobId || !sourceColumn || !destinationColumn) {
        return NextResponse.json({ error: "Missing reorder fields" }, { status: 400 });
      }

      const result = await applyManualPipelineQueueMove(
        prisma,
        companyId,
        movedJobId,
        sourceColumn as any,
        destinationColumn as any,
        destinationColumnOrderIds,
        sourceColumnOrderIds,
      );

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
    console.error("[API:PipelineJobs] PATCH failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
