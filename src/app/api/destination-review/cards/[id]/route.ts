import { NextRequest, NextResponse } from "next/server";
import { getDestinationReviewPacket } from "@/lib/destination-review-bridge";
import { verifyMembership } from "@/lib/permissions";
import { normalizeDestinationKey } from "@/lib/destination-scope";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const companyId = String(request.nextUrl.searchParams.get("companyId") || "");
  if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  const destinationKeyRaw = request.nextUrl.searchParams.get("destinationKey");
  if (destinationKeyRaw && !normalizeDestinationKey(destinationKeyRaw)) {
    return NextResponse.json({ error: "destinationKey must be supported by checklist" }, { status: 400 });
  }
  const destinationKey = normalizeDestinationKey(destinationKeyRaw);
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  const { id } = await params;
  const card = await getDestinationReviewPacket(companyId, id);
  if (!card) return NextResponse.json({ error: "Review card not found" }, { status: 404 });
  if (destinationKey && card.destinationInstance?.destinationKey !== destinationKey) {
    return NextResponse.json({ error: "Review card not found" }, { status: 404 });
  }
  return NextResponse.json(card);
}
