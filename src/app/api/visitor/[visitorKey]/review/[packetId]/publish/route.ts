import { NextRequest, NextResponse } from "next/server";
import { getDestinationReviewPacket } from "@/lib/destination-review-bridge";
import { publishDestinationReviewPacket } from "@/lib/destination-publish-bridge";
import { verifyMembership } from "@/lib/permissions";
import { resolveDestinationKeyForVisitorWithHint } from "@/lib/visitor-blueprints";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ visitorKey: string; packetId: string }> },
) {
  const bodyRaw = await request.json().catch(() => null);
  if (!bodyRaw || typeof bodyRaw !== "object" || Array.isArray(bodyRaw)) {
    return NextResponse.json({ ok: false, error: "JSON object body is required" }, { status: 400 });
  }
  const body = bodyRaw as Record<string, unknown>;
  const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });
  const auth = await verifyMembership(request, companyId, "MEMBER");
  if (auth.error) return auth.error;

  const { visitorKey, packetId } = await params;
  const destinationKeyHint = typeof body.destinationKey === "string" ? body.destinationKey.trim() : undefined;
  const destinationKey = resolveDestinationKeyForVisitorWithHint(visitorKey, destinationKeyHint);
  if (!destinationKey) return NextResponse.json({ ok: false, error: "Unsupported visitorKey" }, { status: 400 });

  const packet = await getDestinationReviewPacket(companyId, packetId);
  if (!packet || packet.destinationInstance?.destinationKey !== destinationKey) {
    return NextResponse.json({ ok: false, error: "Review packet not found" }, { status: 404 });
  }

  const result = await publishDestinationReviewPacket({
    companyId,
    reviewPacketId: packetId,
    reviewedBy: auth.session.email,
  });
  return NextResponse.json({ visitorKey, ...result }, { status: result.status });
}
