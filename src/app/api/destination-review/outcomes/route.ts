import { NextRequest, NextResponse } from "next/server";
import { recordOutcomeEvent } from "@/lib/audit-ledger";
import { recordDestinationOutcomeMemory } from "@/lib/destination-review-bridge";
import { verifyIngestSecret } from "@/lib/ingest-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await verifyIngestSecret(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const required = ["companyId", "destinationKey", "bridgeVersion", "eventType", "actorType"];
    for (const field of required) {
      if (!(field in body)) {
        return NextResponse.json({ error: `${field} is required` }, { status: 400 });
      }
    }

    const outcome = await recordDestinationOutcomeMemory(body);
    await recordOutcomeEvent({
      companyId: body.companyId,
      actorType: body.actorType,
      actorId: body.actorId,
      entityType: "DESTINATION_WORKFLOW",
      entityId: body.workflowRunId || body.reviewPacketId || body.draftId || body.candidateId || "unknown",
      outcomeType: body.eventType,
      outcomeValue: body.reasonCode,
      annotation: body.notes,
      payload: body.payload,
      teachingWeight: 70,
    });

    return NextResponse.json({ ok: true, outcome });
  } catch (error) {
    console.error("[API:DestinationReview:Outcomes] failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
