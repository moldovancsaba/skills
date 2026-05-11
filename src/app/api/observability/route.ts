import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { getCompanyObservabilitySnapshot } from "@/lib/observability";
import { recordInteractionEventFromRequest, recordOutcomeEvent } from "@/lib/audit-ledger";
import {
  escalateCompanyPipelineJob,
  recoverFailedCompanyPipelineJobs,
  syncCompanyPipelineJobs,
} from "@/lib/pipeline-queue";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  try {
    const snapshot = await getCompanyObservabilitySnapshot(companyId);
    return NextResponse.json(snapshot);
  } catch (error) {
    console.error("[API:Observability] failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const data = await request.json();
    const companyId = String(data.companyId || "");
    const action = String(data.action || "");
    if (!companyId || !action) {
      return NextResponse.json({ error: "companyId and action required" }, { status: 400 });
    }

    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;

    if (action === "SYNC_QUEUE") {
      await syncCompanyPipelineJobs(prisma as any, companyId);
    } else if (action === "ESCALATE_SCORE_REPAIR") {
      await escalateCompanyPipelineJob(prisma as any, companyId, "SCORE_ALERT_REPAIR");
    } else if (action === "RECOVER_FAILED_JOBS") {
      await recoverFailedCompanyPipelineJobs(prisma as any, companyId);
    } else {
      return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }

    await recordInteractionEventFromRequest(request, {
      companyId,
      surface: "observability",
      interactionType: `OBSERVABILITY_${action}`,
      entityType: "PIPELINE_QUEUE",
      entityId: companyId,
      payload: { action },
      teachingWeight: 75,
    });
    await recordOutcomeEvent({
      companyId,
      actorType: "HUMAN",
      entityType: "PIPELINE_QUEUE",
      entityId: companyId,
      outcomeType: `OBSERVABILITY_${action}`,
      outcomeValue: action,
      payload: { action },
      teachingWeight: 75,
    });

    return NextResponse.json(await getCompanyObservabilitySnapshot(companyId));
  } catch (error) {
    console.error("[API:Observability] PATCH failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
