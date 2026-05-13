import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { recordInteractionEventFromRequest, recordOutcomeEvent } from "@/lib/audit-ledger";
import {
  escalateCompanyPipelineJob,
  recoverFailedCompanyPipelineJobs,
  syncCompanyPipelineJobs,
} from "@/lib/pipeline-queue";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getKnowmoreHealthSnapshot(companyId: string) {
  const snapshot = await prisma.intelligenceSnapshot.findUnique({
    where: { companyId },
    select: { knowmoreHealth: true },
  });

  const health = snapshot?.knowmoreHealth;
  return health && typeof health === "object"
    ? health
    : {
        healthState: "HEALTHY",
        healthTone: "default",
        healthTitle: "Knowmore Health: Healthy",
        healthSummary: "No persisted Knowmore health snapshot is available yet.",
        reviewCount: 0,
        staleCount: 0,
        correctionBacklog: 0,
        failedJobs: 0,
        scoreBand: "UNKNOWN",
        alerts: [],
        jobs: [],
        recommendedActions: {
          sync: true,
          repair: false,
          recover: false,
        },
      };
}

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  try {
    return NextResponse.json(await getKnowmoreHealthSnapshot(companyId), {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error) {
    console.error("[API:KNOWMORE:HEALTH] GET failure:", error);
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

    if (action === "SYNC_KNOWMORE") {
      await syncCompanyPipelineJobs(prisma as any, companyId);
    } else if (action === "REQUEST_KNOWMORE_REPAIR") {
      await escalateCompanyPipelineJob(prisma as any, companyId, "COMPANY_SYNTHESIS");
      await escalateCompanyPipelineJob(prisma as any, companyId, "FEEDBACK_RECONCILIATION");
      await escalateCompanyPipelineJob(prisma as any, companyId, "CARD_RESCORING");
    } else if (action === "RECOVER_KNOWMORE_JOBS") {
      await recoverFailedCompanyPipelineJobs(prisma as any, companyId);
    } else {
      return NextResponse.json({ error: "Unsupported knowmore action" }, { status: 400 });
    }

    await recordInteractionEventFromRequest(request, {
      companyId,
      surface: "knowmore-health",
      interactionType: `KNOWMORE_${action}`,
      entityType: "KNOWLEDGE",
      entityId: companyId,
      payload: { action },
      teachingWeight: 75,
    });
    await recordOutcomeEvent({
      companyId,
      actorType: "HUMAN",
      entityType: "KNOWLEDGE",
      entityId: companyId,
      outcomeType: `KNOWMORE_${action}`,
      outcomeValue: action,
      payload: { action },
      teachingWeight: 75,
    });

    return NextResponse.json(await getKnowmoreHealthSnapshot(companyId), {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error) {
    console.error("[API:KNOWMORE:HEALTH] PATCH failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
