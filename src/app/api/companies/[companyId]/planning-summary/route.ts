import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { createRequestProfiler } from "@/lib/request-profile";
import { getProjectionFreshness, normalizeWebappProjection } from "@/lib/webapp-projection";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const profiler = createRequestProfiler(request, "planning-summary");
  const { companyId } = await params;
  if (!companyId) {
    return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
  }

  const auth = await profiler.measure("verifyMembership", () => verifyMembership(request, companyId));
  if (auth.error) return auth.error;

  try {
    const [company, snapshot] = await profiler.measure("loadPlanningSummaryModels", () => Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true, name: true },
      }),
      prisma.intelligenceSnapshot.findUnique({
        where: { companyId },
        select: {
          checklistCount: true,
          tacticalBoardCount: true,
          webappProjection: true,
          updatedAt: true,
        },
      }),
    ]));

    if (!company) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const projection = normalizeWebappProjection(snapshot?.webappProjection);
    const freshness = getProjectionFreshness(projection?.generatedAt ?? null);
    const summary = projection?.planningSummary ?? {
      laneCounts: {
        IDEABANK: 0,
        ROADMAP: 0,
        BACKLOG: 0,
        TODO: 0,
        CHECKLIST: Number(snapshot?.checklistCount ?? 0),
      },
      tacticalCount: Math.max(Number(snapshot?.tacticalBoardCount ?? 0), Number(snapshot?.checklistCount ?? 0)),
      checklistCount: Number(snapshot?.checklistCount ?? 0),
    };

    const response = NextResponse.json({
      company,
      planningSummary: {
        ...summary,
        tacticalCount: Math.max(Number(summary.tacticalCount || 0), Number(summary.checklistCount || 0)),
      },
      projection: {
        available: Boolean(projection),
        freshness,
        generatedAt: projection?.generatedAt ?? null,
        snapshotUpdatedAt: snapshot?.updatedAt?.toISOString() ?? null,
      },
      ...(profiler.enabled ? { profile: profiler.getSummary() } : {}),
    });
    return profiler.apply(response);
  } catch (error) {
    console.error("[API:PlanningSummary] Failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
