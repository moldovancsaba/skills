import { NextRequest, NextResponse } from "next/server";
import { recordOutcomeEvent } from "@/lib/audit-ledger";
import { recordDestinationOutcomeMemory } from "@/lib/destination-review-bridge";
import { verifyIngestSecret } from "@/lib/ingest-auth";
import { normalizeDestinationKey } from "@/lib/destination-scope";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function POST(request: NextRequest) {
  const auth = await verifyIngestSecret(request);
  if (auth.error) return auth.error;

  try {
    const rawBody = await request.json();
    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
      return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
    }
    const body = rawBody as Record<string, unknown>;
    const required = ["companyId", "destinationKey", "bridgeVersion", "eventType", "actorType"];
    for (const field of required) {
      if (!(field in body)) {
        return NextResponse.json({ error: `${field} is required` }, { status: 400 });
      }
    }
    const companyId = String(body.companyId || "");
    const destinationKey = normalizeDestinationKey(body.destinationKey);
    if (!companyId) {
      return NextResponse.json({ error: "companyId is required" }, { status: 400 });
    }
    if (!destinationKey) {
      return NextResponse.json({ error: "destinationKey must be one of: classscout, compare" }, { status: 400 });
    }

    const outcome = await recordDestinationOutcomeMemory({
      companyId,
      destinationKey,
      workflowRunId: optionalString(body.workflowRunId),
      candidateId: optionalString(body.candidateId),
      draftId: optionalString(body.draftId),
      reviewPacketId: optionalString(body.reviewPacketId),
      bridgeVersion: String(body.bridgeVersion || ""),
      eventType: String(body.eventType || ""),
      reasonCode: optionalString(body.reasonCode),
      notes: optionalString(body.notes),
      actorType: String(body.actorType || ""),
      actorId: optionalString(body.actorId),
      payload: asRecord(body.payload),
    } as never);
    await recordOutcomeEvent({
      companyId,
      actorType: String(body.actorType || ""),
      actorId: optionalString(body.actorId),
      entityType: "DESTINATION_WORKFLOW",
      entityId: optionalString(body.workflowRunId) || optionalString(body.reviewPacketId) || optionalString(body.draftId) || optionalString(body.candidateId) || "unknown",
      outcomeType: String(body.eventType || ""),
      outcomeValue: optionalString(body.reasonCode),
      annotation: optionalString(body.notes),
      payload: asRecord(body.payload),
      teachingWeight: 70,
    });

    return NextResponse.json({ ok: true, outcome });
  } catch (error) {
    console.error("[API:DestinationReview:Outcomes] failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
