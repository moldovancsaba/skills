import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { buildCompanyReadModel } from "@/lib/company-read-model";
import { buildProjectionMetadata } from "@/lib/webapp-projection";
import { listBlockDefinitions, resolveEffectiveUnitCapabilities, type BlockKey } from "@/lib/check-foundation";

export const dynamic = "force-dynamic";

type BlockReadiness = "ready" | "setup_required" | "degraded" | "disabled" | "unavailable";
type BlockHealth = "ok" | "warning" | "critical" | "unknown";

function resolveReadiness(input: {
  blockId: BlockKey;
  enabled: boolean;
  enabledMiniapps: string[];
}): BlockReadiness {
  if (!input.enabled) return "disabled";
  if (input.blockId === "miniapp" && input.enabledMiniapps.length === 0) {
    return "setup_required";
  }
  return "ready";
}

function resolveHealth(input: {
  readiness: BlockReadiness;
  navCounts: Record<string, number>;
  blockId: BlockKey;
}): BlockHealth {
  if (input.readiness === "disabled" || input.readiness === "unavailable") {
    return "unknown";
  }
  if (input.readiness === "setup_required") {
    return "warning";
  }
  if (input.blockId === "checklist" && Number(input.navCounts.checklist || 0) === 0) {
    return "warning";
  }
  return "ok";
}

function buildBlockCounts(input: {
  blockId: BlockKey;
  navCounts: Record<string, number>;
  enabledMiniapps: string[];
}) {
  const { blockId, navCounts, enabledMiniapps } = input;
  if (blockId === "project") {
    return {
      board: Number(navCounts["unit-board"] || 0),
    };
  }
  if (blockId === "sales") {
    return {
      sales: Number(navCounts.sales || 0),
      review: Number(navCounts.review || 0),
    };
  }
  if (blockId === "miniapp") {
    return {
      miniapps: enabledMiniapps.length,
      review: Number(navCounts.review || 0),
      pipeline: Number(navCounts.pipeline || 0),
    };
  }
  return {
    checklist: Number(navCounts.checklist || 0),
    tactical: Number(navCounts.tactical || 0),
    data: Number(navCounts.data || 0),
    topics: Number(navCounts.topics || 0),
    goals: Number(navCounts.goals || 0),
    knowmore: Number(navCounts.knowmore || 0),
    pipeline: Number(navCounts.pipeline || 0),
  };
}

function buildNextActions(input: {
  companyId: string;
  blockId: BlockKey;
  readiness: BlockReadiness;
  enabledMiniapps: string[];
}): Array<{ label: string; href: string; severity: "info" | "warning" | "critical" }> {
  const hrefBase = `/${input.companyId}`;
  if (input.readiness === "disabled") {
    return [{ label: "Enable Block", href: `${hrefBase}/settings`, severity: "warning" }];
  }
  if (input.readiness === "setup_required") {
    return [{ label: "Complete Setup", href: `${hrefBase}/settings`, severity: "warning" }];
  }

  switch (input.blockId) {
    case "project":
      return [{ label: "Open Project Board", href: `${hrefBase}/unit-board`, severity: "info" }];
    case "sales":
      return [{ label: "Open Sales", href: `${hrefBase}/sales`, severity: "info" }];
    case "miniapp": {
      const preferredMiniapp = input.enabledMiniapps.includes("compare")
        ? "compare"
        : (input.enabledMiniapps[0] || "compare");
      return [{ label: "Open Miniapp Ops", href: `${hrefBase}/${preferredMiniapp}`, severity: "info" }];
    }
    case "checklist":
    default:
      return [{ label: "Open Checklist", href: `${hrefBase}/checklist`, severity: "info" }];
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await params;
  if (!companyId) {
    return NextResponse.json({ error: "Missing companyId" }, { status: 400 });
  }

  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  try {
    const [company, snapshot, compareInstance] = await Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true, workerConfig: true },
      }),
      prisma.intelligenceSnapshot.findUnique({
        where: { companyId },
        select: {
          webappProjection: true,
        },
      }),
      prisma.destinationInstance.findFirst({
        where: { companyId, destinationKey: "compare", isActive: true },
        select: { id: true },
      }),
    ]);

    if (!company) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const readModel = buildCompanyReadModel(snapshot);
    const projectionMetadata = buildProjectionMetadata(readModel.projection);
    const effective = resolveEffectiveUnitCapabilities({
      workerConfig: company.workerConfig,
      hasCompareDestination: Boolean(compareInstance),
    });

    const blockDefinitions = listBlockDefinitions();
    const enabledSet = new Set(effective.enabledBlocks);
    const blocks = blockDefinitions.map((definition) => {
      const enabled = enabledSet.has(definition.key);
      const readiness = resolveReadiness({
        blockId: definition.key,
        enabled,
        enabledMiniapps: effective.enabledMiniapps,
      });
      const health = resolveHealth({
        readiness,
        navCounts: readModel.navCounts,
        blockId: definition.key,
      });

      return {
        blockId: definition.key,
        enabled,
        readiness,
        health,
        modules: definition.requiredModules,
        counts: buildBlockCounts({
          blockId: definition.key,
          navCounts: readModel.navCounts,
          enabledMiniapps: effective.enabledMiniapps,
        }),
        nextActions: buildNextActions({
          companyId,
          blockId: definition.key,
          readiness,
          enabledMiniapps: effective.enabledMiniapps,
        }),
        recentFailures: [],
      };
    });
    const isProjectionStale = projectionMetadata.freshness.status === "STALE" || projectionMetadata.freshness.status === "MISSING";

    return NextResponse.json({
      companyId,
      generatedAt: new Date().toISOString(),
      sourceGeneratedAt: projectionMetadata.generatedAt,
      stale: isProjectionStale,
      projection: {
        ...projectionMetadata,
        available: Boolean(readModel.projection),
      },
      blocks,
      capabilities: {
        source: effective.source,
        warnings: effective.warnings,
        enabledBlocks: effective.enabledBlocks,
        enabledModules: effective.enabledModules,
        enabledMiniapps: effective.enabledMiniapps,
      },
    });
  } catch (error) {
    console.error("[API:CompanyBlocksSummary] Failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
