import { NextRequest, NextResponse } from "next/server";
import { getDestinationReviewPacket, submitDestinationReviewDecision } from "@/lib/destination-review-bridge";
import { verifyMembership } from "@/lib/permissions";
import { resolveDestinationKeyForVisitorWithHint } from "@/lib/visitor-blueprints";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

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

  const decision = await submitDestinationReviewDecision({
    companyId,
    reviewPacketId: packetId,
    bridgeVersion: typeof body.bridgeVersion === "string" ? body.bridgeVersion : "v1",
    decision: typeof body.decision === "string" ? body.decision : "",
    decisionReasonCode: typeof body.decisionReasonCode === "string" ? body.decisionReasonCode : "",
    decisionNotes: typeof body.decisionNotes === "string" ? body.decisionNotes : undefined,
    requestedAction: typeof body.requestedAction === "string" ? body.requestedAction : undefined,
    correctedDraftPayload: asRecord(body.correctedDraftPayload),
    correctedFactsJson: asRecord(body.correctedFactsJson),
    reviewedBy: auth.session.email,
    reviewedAt: typeof body.reviewedAt === "string" ? body.reviewedAt : undefined,
    metadata: asRecord(body.metadata),
  });
  if (!decision) return NextResponse.json({ ok: false, error: "Review packet not found" }, { status: 404 });

  return NextResponse.json({ ok: true, visitorKey, decision });
}
