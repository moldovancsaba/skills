import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  if (!companyId) {
    return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
  }

  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  try {
    const [company, snapshot] = await Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true, name: true },
      }),
      prisma.intelligenceSnapshot.findUnique({
        where: { companyId },
        select: {
          dataIngressCount: true,
          topicSynthesisCount: true,
          knowmoreCount: true,
          strategicGoalsCount: true,
          checklistCount: true,
          tacticalBoardCount: true,
          reviewGatewayCount: true,
          observabilitySummary: true,
        },
      }),
    ]);

    if (!company) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const observabilitySummary =
      snapshot?.observabilitySummary && typeof snapshot.observabilitySummary === "object"
        ? snapshot.observabilitySummary as Record<string, unknown>
        : {};
    const queue = observabilitySummary.queue && typeof observabilitySummary.queue === "object"
      ? observabilitySummary.queue as Record<string, unknown>
      : {};

    return NextResponse.json({
      company,
      counts: {
        data: snapshot?.dataIngressCount ?? 0,
        topics: snapshot?.topicSynthesisCount ?? 0,
        knowmore: snapshot?.knowmoreCount ?? 0,
        goals: snapshot?.strategicGoalsCount ?? 0,
        checklist: snapshot?.checklistCount ?? 0,
        tactical: Math.max(snapshot?.tacticalBoardCount ?? 0, snapshot?.checklistCount ?? 0),
        review: snapshot?.reviewGatewayCount ?? 0,
        pipeline: Number(queue.totalActiveJobs ?? 0),
      },
    });
  } catch (error) {
    console.error("[API:CompanyNav] Failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
