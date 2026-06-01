import { NextRequest, NextResponse } from "next/server";
import { recordOutcomeEvent } from "@/lib/audit-ledger";
import { getDestinationReviewPacket, submitDestinationReviewDecision } from "@/lib/destination-review-bridge";
import { verifyMembership } from "@/lib/permissions";
import { normalizeDestinationKey } from "@/lib/destination-scope";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const rawBody = await request.json();
    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
      return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
    }
    const body = rawBody as Record<string, unknown>;
    const companyId = String(body.companyId || "");
    if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });
    const destinationKeyRaw = body.destinationKey;
    if (destinationKeyRaw && !normalizeDestinationKey(destinationKeyRaw)) {
      return NextResponse.json({ error: "destinationKey must be one of: classscout, compare" }, { status: 400 });
    }
    const destinationKey = normalizeDestinationKey(destinationKeyRaw);
    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;

    const { id } = await params;
    const existingPacket = await getDestinationReviewPacket(companyId, id);
    if (!existingPacket) {
      return NextResponse.json({ error: "Review packet not found" }, { status: 404 });
    }
    if (destinationKey && existingPacket.destinationInstance?.destinationKey !== destinationKey) {
      return NextResponse.json({ error: "Review packet not found" }, { status: 404 });
    }
    const decision = await submitDestinationReviewDecision({
      companyId,
      reviewPacketId: id,
      bridgeVersion: String(body.bridgeVersion || "v1"),
      decision: String(body.decision || ""),
      decisionReasonCode: String(body.decisionReasonCode || ""),
      decisionNotes: typeof body.decisionNotes === "string" ? body.decisionNotes : undefined,
      requestedAction: typeof body.requestedAction === "string" ? body.requestedAction : undefined,
      correctedDraftPayload: asRecord(body.correctedDraftPayload),
      correctedFactsJson: asRecord(body.correctedFactsJson),
      reviewedBy: auth.session.email,
      reviewedAt: typeof body.reviewedAt === "string" ? body.reviewedAt : undefined,
      metadata: asRecord(body.metadata),
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
