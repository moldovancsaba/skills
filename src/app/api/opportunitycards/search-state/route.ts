import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { normalizeWebappProjection } from "@/lib/webapp-projection";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  try {
    const snapshot = await prisma.intelligenceSnapshot.findUnique({
      where: { companyId: companyId as string },
      select: {
        webappProjection: true,
        updatedAt: true,
      },
    });
    const projection = normalizeWebappProjection(snapshot?.webappProjection);
    const summary = projection?.salesSummary;

    return NextResponse.json({
      totalRuns: Number(summary?.searchRuns || 0),
      lastQueries: Array.isArray(summary?.lastQueries) ? summary.lastQueries : [],
      updatedAt: typeof summary?.searchStateUpdatedAt === "string"
        ? summary.searchStateUpdatedAt
        : snapshot?.updatedAt?.toISOString() ?? null,
      topQueries: Array.isArray(summary?.topQueries) ? summary.topQueries : [],
      topTerms: Array.isArray(summary?.topTerms) ? summary.topTerms : [],
      topDomains: Array.isArray(summary?.topDomains) ? summary.topDomains : [],
      projection: {
        available: Boolean(projection),
        generatedAt: projection?.generatedAt ?? null,
      },
    });
  } catch (error) {
    console.error("[API:OPPORTUNITYCARDS:SEARCH_STATE] GET failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
