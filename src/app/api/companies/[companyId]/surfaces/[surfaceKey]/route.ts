import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { getCompanySurfaceReadModel } from "@/lib/surface-projections";
import {
  buildUnitBoardProjectReadModel,
  UNIT_BOARD_PROJECT_CONTRACT_VERSION,
  UNIT_BOARD_PROJECT_SURFACE_KEY,
} from "@/lib/unit-board-projection";

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

  const decodedSurfaceKey = decodeURIComponent(surfaceKey);
  const contractVersion = Math.max(1, Number(request.nextUrl.searchParams.get("contractVersion") || 1));
  const projection = decodedSurfaceKey === UNIT_BOARD_PROJECT_SURFACE_KEY && contractVersion === UNIT_BOARD_PROJECT_CONTRACT_VERSION
    ? await buildUnitBoardProjectReadModel(prisma, companyId)
    : await getCompanySurfaceReadModel(prisma, {
    companyId,
    surfaceKey: decodedSurfaceKey,
    contractVersion,
  });

  return NextResponse.json({
    ok: true,
    projection,
  });
}
