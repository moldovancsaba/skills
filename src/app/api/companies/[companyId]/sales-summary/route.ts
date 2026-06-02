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
  const profiler = createRequestProfiler(request, "sales-summary");
  const { companyId } = await params;
  if (!companyId) {
    return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
  }

  const auth = await profiler.measure("verifyMembership", () => verifyMembership(request, companyId));
  if (auth.error) return auth.error;

  try {
    const [company, snapshot] = await profiler.measure("loadSalesSummaryModels", () => Promise.all([
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

    const projection = normalizeWebappProjection(snapshot?.webappProjection);
    const summary = projection?.salesSummary ?? null;

    const response = NextResponse.json({
      company,
      summary,
      projection: {
        available: Boolean(projection),
        freshness: getProjectionFreshness(projection?.generatedAt ?? null),
        generatedAt: projection?.generatedAt ?? null,
        snapshotUpdatedAt: snapshot?.updatedAt?.toISOString() ?? null,
      },
      ...(profiler.enabled ? { profile: profiler.getSummary() } : {}),
    });
    return profiler.apply(response);
  } catch (error) {
    console.error("[API:SalesSummary] Failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
