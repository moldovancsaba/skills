import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { createRequestProfiler } from "@/lib/request-profile";
import { normalizeWebappProjection } from "@/lib/webapp-projection";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const profiler = createRequestProfiler(request, "company-nav");
  const { companyId } = await params;
  if (!companyId) {
    return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
  }

  const auth = await profiler.measure("verifyMembership", () => verifyMembership(request, companyId));
  if (auth.error) return auth.error;

  try {
    const [company, snapshot] = await profiler.measure("loadNavModels", () => Promise.all([
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
          webappProjection: true,
        },
      }),
    ]));

    if (!company) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const projection = normalizeWebappProjection(snapshot?.webappProjection);
    const observabilitySummary =
      snapshot?.observabilitySummary && typeof snapshot.observabilitySummary === "object"
        ? snapshot.observabilitySummary as Record<string, unknown>
        : {};
    const queue =
      observabilitySummary.queue && typeof observabilitySummary.queue === "object"
        ? observabilitySummary.queue as Record<string, unknown>
        : {};

    const counts = projection?.navCounts ?? {
      data: Number(snapshot?.dataIngressCount ?? 0),
      topics: Number(snapshot?.topicSynthesisCount ?? 0),
      knowmore: Number(snapshot?.knowmoreCount ?? 0),
      goals: Number(snapshot?.strategicGoalsCount ?? 0),
      review: Number(snapshot?.reviewGatewayCount ?? 0),
      checklist: Number(snapshot?.checklistCount ?? 0),
      tactical: Math.max(Number(snapshot?.tacticalBoardCount ?? 0), Number(snapshot?.checklistCount ?? 0)),
      pipeline: Number(queue.totalActiveJobs ?? 0),
    };

    const response = NextResponse.json({
      company,
      counts: {
        ...counts,
        tactical: Math.max(Number(counts.tactical || 0), Number(counts.checklist || 0)),
        pipeline: Number(queue.totalActiveJobs ?? counts.pipeline ?? 0),
      },
      ...(profiler.enabled ? { profile: profiler.getSummary() } : {}),
    });
    return profiler.apply(response);
  } catch (error) {
    console.error("[API:CompanyNav] Failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
