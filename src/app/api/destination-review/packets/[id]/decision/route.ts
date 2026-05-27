import { NextRequest, NextResponse } from "next/server";
import { recordOutcomeEvent } from "@/lib/audit-ledger";
import { submitDestinationReviewDecision } from "@/lib/destination-review-bridge";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json();
    const companyId = String(body.companyId || "");
    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;

    const { id } = await params;
    const decision = await submitDestinationReviewDecision({
      companyId,
      reviewPacketId: id,
      bridgeVersion: String(body.bridgeVersion || "v1"),
      decision: String(body.decision || ""),
      decisionReasonCode: String(body.decisionReasonCode || ""),
      decisionNotes: typeof body.decisionNotes === "string" ? body.decisionNotes : undefined,
      requestedAction: typeof body.requestedAction === "string" ? body.requestedAction : undefined,
      correctedDraftPayload:
        body.correctedDraftPayload && typeof body.correctedDraftPayload === "object" && !Array.isArray(body.correctedDraftPayload)
          ? body.correctedDraftPayload
          : undefined,
      correctedFactsJson:
        body.correctedFactsJson && typeof body.correctedFactsJson === "object" && !Array.isArray(body.correctedFactsJson)
          ? body.correctedFactsJson
          : undefined,
      reviewedBy: auth.session.email,
      reviewedAt: typeof body.reviewedAt === "string" ? body.reviewedAt : undefined,
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : undefined,
    });

    if (!decision) {
      return NextResponse.json({ error: "Review packet not found" }, { status: 404 });
    }

    await recordOutcomeEvent({
      companyId,
      actorType: "HUMAN",
      actorEmail: auth.session.email,
      entityType: "DESTINATION_REVIEW_PACKET",
      entityId: id,
      outcomeType: "DESTINATION_REVIEW_DECISION",
      outcomeValue: decision.decision,
      annotation: decision.decisionNotes ?? undefined,
      payload: {
        decisionReasonCode: decision.decisionReasonCode,
        requestedAction: decision.requestedAction,
      },
      teachingWeight: 80,
    });

    return NextResponse.json({ ok: true, decision });
  } catch (error) {
    console.error("[API:DestinationReview:Decision] failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
