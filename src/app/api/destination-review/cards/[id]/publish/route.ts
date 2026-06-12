import { NextRequest, NextResponse } from "next/server";
import { recordOutcomeEvent } from "@/lib/audit-ledger";
import { getDestinationReviewPacket } from "@/lib/destination-review-bridge";
import { publishDestinationReviewPacket } from "@/lib/destination-publish-bridge";
import { verifyMembership } from "@/lib/permissions";
import { normalizeDestinationKey } from "@/lib/destination-scope";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const bodyRaw = await request.json();
    if (!bodyRaw || typeof bodyRaw !== "object" || Array.isArray(bodyRaw)) {
      return NextResponse.json({ ok: false, error: "JSON object body is required" }, { status: 400 });
    }
    const body = bodyRaw as Record<string, unknown>;
    const companyId = typeof body.companyId === "string" ? body.companyId : "";
    if (!companyId) return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });
    const destinationKeyRaw = body.destinationKey;
    if (destinationKeyRaw && !normalizeDestinationKey(destinationKeyRaw)) {
      return NextResponse.json({ ok: false, error: "destinationKey must be supported by checklist" }, { status: 400 });
    }
    const destinationKey = normalizeDestinationKey(destinationKeyRaw);
    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;

    const { id } = await params;
    const existingPacket = await getDestinationReviewPacket(companyId, id);
    if (!existingPacket) {
      return NextResponse.json({ ok: false, error: "Review card not found" }, { status: 404 });
    }
    if (destinationKey && existingPacket.destinationInstance?.destinationKey !== destinationKey) {
      return NextResponse.json({ ok: false, error: "Review card not found" }, { status: 404 });
    }
    const result = await publishDestinationReviewPacket({
      companyId,
      reviewPacketId: id,
      reviewedBy: auth.session.email,
    });

    await recordOutcomeEvent({
      companyId,
      actorType: "HUMAN",
      actorEmail: auth.session.email,
      entityType: "DESTINATION_REVIEW_PACKET",
      entityId: id,
      outcomeType: "DESTINATION_REVIEW_PUBLISH",
      outcomeValue: result.ok ? "DISPATCHED" : "FAILED",
      annotation: result.ok ? "check dispatched a publish request to the Miniapp." : result.error,
      payload: {
        status: result.status,
        response: result.data,
        publicUrl: result.publicUrl,
      },
      teachingWeight: result.ok ? 70 : 90,
    });

    return NextResponse.json(result, { status: result.status });
  } catch (error) {
    console.error("[API:DestinationReview:Publish] failure:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
