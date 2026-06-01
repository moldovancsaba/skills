import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import {
  ENRICHMENT_PROVIDER_DEFINITIONS,
  listCompanyEnrichmentPolicies,
} from "@/lib/enrichment-waterfall";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  try {
    return NextResponse.json({
      definitions: ENRICHMENT_PROVIDER_DEFINITIONS,
      items: await listCompanyEnrichmentPolicies(companyId),
    });
  } catch (error) {
    console.error("[API:EnrichmentPolicies] GET failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const payload = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
    }
    const data = payload as Record<string, unknown>;
    const companyId = typeof data.companyId === "string" ? data.companyId : "";
    const policyId = typeof data.policyId === "string" ? data.policyId : "";
    if (!companyId || !policyId) {
      return NextResponse.json({ error: "companyId and policyId required" }, { status: 400 });
    }

    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;

    await prisma.enrichmentWaterfallPolicy.update({
      where: { id: policyId },
      data: {
        enabled: typeof data.enabled === "boolean" ? data.enabled : undefined,
        priority: Number.isFinite(Number(data.priority)) ? Number(data.priority) : undefined,
        strategy: typeof data.strategy === "string" ? data.strategy : undefined,
      },
    });

    return NextResponse.json({
      definitions: ENRICHMENT_PROVIDER_DEFINITIONS,
      items: await listCompanyEnrichmentPolicies(companyId),
    });
  } catch (error) {
    console.error("[API:EnrichmentPolicies] PATCH failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
