import { NextRequest, NextResponse } from "next/server";

import { normalizeDestinationKey } from "@/lib/destination-scope";
import { getAllMiniappIntelligenceHealth, getMiniappIntelligenceHealth } from "@/lib/miniapp-intelligence-health";
import { verifyMembership } from "@/lib/permissions";

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

  const destinationKeyRaw = request.nextUrl.searchParams.get("destinationKey");
  const destinationKey = normalizeDestinationKey(destinationKeyRaw);
  if (destinationKeyRaw && !destinationKey) {
    return NextResponse.json({ error: "destinationKey must be one of: classscout, compare" }, { status: 400 });
  }

  try {
    const health = destinationKey
      ? await getMiniappIntelligenceHealth(companyId, destinationKey)
      : await getAllMiniappIntelligenceHealth(companyId);
    return NextResponse.json({
      companyId,
      generatedAt: new Date().toISOString(),
      health,
    });
  } catch (error) {
    console.error("[API:MiniappHealth] Failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
