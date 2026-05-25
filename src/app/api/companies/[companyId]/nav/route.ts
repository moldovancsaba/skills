import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { createRequestProfiler } from "@/lib/request-profile";
import { buildCompanyReadModel } from "@/lib/company-read-model";

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

    const readModel = buildCompanyReadModel(snapshot);

    const response = NextResponse.json({
      company,
      counts: {
        ...readModel.navCounts,
        tactical: Math.max(Number(readModel.navCounts.tactical || 0), Number(readModel.navCounts.checklist || 0)),
      },
      ...(profiler.enabled ? { profile: profiler.getSummary() } : {}),
    });
    return profiler.apply(response);
  } catch (error) {
    console.error("[API:CompanyNav] Failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
