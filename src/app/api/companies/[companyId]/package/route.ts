import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { resolveEffectiveUnitCapabilities, resolveEffectiveUnitPackage } from "@/lib/check-foundation";

export const dynamic = "force-dynamic";

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
    const [company, classScoutInstance, compareInstance] = await Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true, workerConfig: true },
      }),
      prisma.destinationInstance.findFirst({
        where: { companyId, destinationKey: "classscout", isActive: true },
        select: { id: true },
      }),
      prisma.destinationInstance.findFirst({
        where: { companyId, destinationKey: "compare", isActive: true },
        select: { id: true },
      }),
    ]);

    if (!company) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const effectiveCapabilities = resolveEffectiveUnitCapabilities({
      workerConfig: company.workerConfig,
      hasClassScoutDestination: Boolean(classScoutInstance),
      hasCompareDestination: Boolean(compareInstance),
    });
    const effectivePackage = resolveEffectiveUnitPackage({
      unitId: companyId,
      workerConfig: company.workerConfig,
      effectiveCapabilities,
      hasClassScoutDestination: Boolean(classScoutInstance),
      hasCompareDestination: Boolean(compareInstance),
    });

    return NextResponse.json({
      unitId: companyId,
      package: effectivePackage,
      capabilities: effectiveCapabilities,
    });
  } catch (error) {
    console.error("[API:CompanyPackage] Failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
