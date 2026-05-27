import { NextRequest, NextResponse } from "next/server";
import { getDestinationReviewPacket } from "@/lib/destination-review-bridge";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  const { id } = await params;
  const packet = await getDestinationReviewPacket(companyId as string, id);
  if (!packet) return NextResponse.json({ error: "Review packet not found" }, { status: 404 });
  return NextResponse.json(packet);
}
