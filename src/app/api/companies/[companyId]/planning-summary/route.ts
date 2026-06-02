import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { createRequestProfiler } from "@/lib/request-profile";
import { buildCompanyReadModel } from "@/lib/company-read-model";
import { buildProjectionMetadata } from "@/lib/webapp-projection";

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
          webappProjection: true,
          updatedAt: true,
        },
      }),
    ]));

    if (!company) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const readModel = buildCompanyReadModel(snapshot);

    const response = NextResponse.json({
      company,
      planningSummary: {
        ...readModel.planningSummary,
        tacticalCount: Math.max(
          Number(readModel.planningSummary.tacticalCount || 0),
          Number(readModel.planningSummary.checklistCount || 0),
        ),
      },
      projection: {
        ...buildProjectionMetadata(readModel.projection),
        available: Boolean(readModel.projection),
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
