import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { APP_VERSION, BRAIN_VERSION } from "@/lib/release";
import { createRequestProfiler } from "@/lib/request-profile";
import { buildCompanyReadModel } from "@/lib/company-read-model";
import { resolveUnitCapabilities } from "@/lib/intelligence-unit-capabilities";
import { resolveEffectiveUnitCapabilities } from "@/lib/check-foundation";

export const dynamic = "force-dynamic";

/**
 * Unit dashboard summary API.
 *
 * Returns the canonical company summary used by the dashboard and nav.
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const profiler = createRequestProfiler(request, "company-dashboard");
  const { companyId } = await params;
  if (!companyId) return NextResponse.json({ error: "Missing companyId" }, { status: 400 });

  const auth = await profiler.measure("verifyMembership", () => verifyMembership(request, companyId));
  if (auth.error) return auth.error;

  try {
    const cid = companyId;
    const [company, members, snapshot, classScoutInstance, compareInstance] = await profiler.measure("loadDashboardModels", () => Promise.all([
      prisma.company.findUnique({ where: { id: cid } }),
      prisma.user.findMany({
        where: { companyId: cid },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          email: true,
          role: true,
          acceptedAt: true,
          createdAt: true,
        },
      }),
      prisma.intelligenceSnapshot.findUnique({ where: { companyId: cid } }),
      prisma.destinationInstance.findFirst({
        where: {
          companyId: cid,
          destinationKey: "classscout",
          isActive: true,
        },
        select: { id: true },
      }),
      prisma.destinationInstance.findFirst({
        where: {
          companyId: cid,
          destinationKey: "compare",
          isActive: true,
        },
        select: { id: true },
      }),
    ]));

    const scoreHealth = snapshot?.scoreHealth && typeof snapshot.scoreHealth === "object" ? snapshot.scoreHealth : null;
    const readModel = buildCompanyReadModel(snapshot);
    const capabilities = resolveUnitCapabilities({
      workerConfig: company?.workerConfig,
      hasClassScoutDestination: Boolean(classScoutInstance),
      hasCompareDestination: Boolean(compareInstance),
    });
    const effectiveCapabilities = resolveEffectiveUnitCapabilities({
      workerConfig: company?.workerConfig,
      hasClassScoutDestination: Boolean(classScoutInstance),
      hasCompareDestination: Boolean(compareInstance),
    });

    const response = NextResponse.json({
      company,
      members,
      counts: readModel.counts,
      topTasks: readModel.topTasks,
      projection: {
        available: Boolean(readModel.projection),
        freshness: readModel.projectionFreshness,
        generatedAt: readModel.projection?.generatedAt ?? null,
        snapshotUpdatedAt: snapshot?.updatedAt?.toISOString() ?? null,
        planningSummary: readModel.planningSummary,
      },
      analytics: Array.isArray(snapshot?.analyticsHistory) ? snapshot.analyticsHistory : [],
      metrics: {
        synthesisYield: snapshot?.synthesisYield || 0,
        confidenceAvg: snapshot?.confidenceAvg || 0,
        iceScoreAvg: snapshot?.iceScoreAvg || 0,
        easeScoreAvg: snapshot?.easeScoreAvg || 0,
        scoreHealth,
      },
      versions: {
        app: APP_VERSION,
        brain: BRAIN_VERSION
      },
      state: {
        engineStatus: snapshot?.engineStatus || "OFFLINE",
        activeContext: snapshot?.activeContext || "IDLE",
        activeTask: snapshot?.activeTask || "Scanning...",
        stage: snapshot?.stage || "STANDBY",
        updatedAt: snapshot?.updatedAt
      },
      webapp: {
        profile: capabilities.profile,
        modules: capabilities.modules,
        enabledBlocks: effectiveCapabilities.enabledBlocks,
        enabledModules: effectiveCapabilities.enabledModules,
        enabledMiniapps: effectiveCapabilities.enabledMiniapps,
        effectiveSource: effectiveCapabilities.source,
        effectiveWarnings: effectiveCapabilities.warnings,
      },
      viewerRole: auth.membership.role,
      ...(profiler.enabled ? { profile: profiler.getSummary() } : {}),
    });
    return profiler.apply(response);

  } catch (error) {
    console.error("[API:DashboardSummary] Failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
