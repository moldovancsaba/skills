import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { createRequestProfiler } from "@/lib/request-profile";
import { buildCompanyReadModel } from "@/lib/company-read-model";
import { buildProjectionMetadata } from "@/lib/webapp-projection";
import { getWebappProfileLabel, resolveUnitCapabilities } from "@/lib/intelligence-unit-capabilities";
import { resolveEffectiveUnitCapabilities } from "@/lib/check-foundation";

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
    const [company, snapshot, classScoutInstance, compareInstance] = await profiler.measure("loadNavModels", () => Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true, name: true, workerConfig: true },
      }),
      prisma.intelligenceSnapshot.findUnique({
        where: { companyId },
        select: {
          webappProjection: true,
        },
      }),
      prisma.destinationInstance.findFirst({
        where: {
          companyId,
          destinationKey: "classscout",
          isActive: true,
        },
        select: { id: true },
      }),
      prisma.destinationInstance.findFirst({
        where: {
          companyId,
          destinationKey: "compare",
          isActive: true,
        },
        select: { id: true },
      }),
    ]));

    if (!company) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

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
      counts: {
        ...readModel.navCounts,
        classscout: classScoutInstance ? Number(readModel.projection?.miniapps.classscout?.attentionCount ?? 0) : 0,
        compare: compareInstance ? Number(readModel.projection?.miniapps.compare?.attentionCount ?? 0) : 0,
        tactical: Math.max(Number(readModel.navCounts.tactical || 0), Number(readModel.navCounts.checklist || 0)),
      },
      projection: {
        ...buildProjectionMetadata(readModel.projection),
        available: Boolean(readModel.projection),
      },
      features: {
        classscout: Boolean(classScoutInstance),
        compare: Boolean(compareInstance),
      },
      webapp: {
        profile: capabilities.profile,
        modules: capabilities.modules,
        profileLabel: getWebappProfileLabel(capabilities.profile),
        enabledBlocks: effectiveCapabilities.enabledBlocks,
        enabledModules: effectiveCapabilities.enabledModules,
        enabledMiniapps: effectiveCapabilities.enabledMiniapps,
        effectiveSource: effectiveCapabilities.source,
        effectiveWarnings: effectiveCapabilities.warnings,
      },
      capabilitiesVersion: capabilities.schemaVersion,
      capabilitiesSource: capabilities.source,
      capabilitiesEnvelopeVersion: capabilities.sourceEnvelopeVersion,
      normalizedCapabilities: capabilities.normalized,
      unitCapabilities: capabilities.normalized,
      ...(profiler.enabled ? { profile: profiler.getSummary() } : {}),
    });
    return profiler.apply(response);
  } catch (error) {
    console.error("[API:CompanyNav] Failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
