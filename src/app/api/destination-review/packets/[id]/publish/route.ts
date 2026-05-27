import { NextRequest, NextResponse } from "next/server";
import { recordOutcomeEvent } from "@/lib/audit-ledger";
import { publishDestinationReviewPacket } from "@/lib/destination-publish-bridge";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json().catch(() => ({}));
    const companyId = String(body.companyId || "");
    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;

    const { id } = await params;
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
      annotation: result.ok ? "Checklist dispatched a publish request to ClassScout." : result.error,
      payload: {
        status: result.status,
        response: result.data,
      },
      teachingWeight: result.ok ? 70 : 90,
    });

    return NextResponse.json(result, { status: result.status });
  } catch (error) {
    console.error("[API:DestinationReview:Publish] failure:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
