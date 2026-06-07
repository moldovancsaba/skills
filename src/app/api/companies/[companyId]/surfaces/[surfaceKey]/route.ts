import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { getCompanySurfaceReadModel } from "@/lib/surface-projections";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string; surfaceKey: string }> },
) {
  const { companyId, surfaceKey } = await params;
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });
  if (!surfaceKey) return NextResponse.json({ ok: false, error: "surfaceKey is required" }, { status: 400 });

  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  const contractVersion = Math.max(1, Number(request.nextUrl.searchParams.get("contractVersion") || 1));
  const projection = await getCompanySurfaceReadModel(prisma, {
    companyId,
    surfaceKey: decodeURIComponent(surfaceKey),
    contractVersion,
  });

  return NextResponse.json({
    ok: true,
    projection,
  });
}
