import { NextRequest, NextResponse } from "next/server";
import { verifyIngestSecret } from "@/lib/ingest-auth";
import { intakeLiveDestinationRevision } from "@/lib/destination-live-revisions";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await verifyIngestSecret(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const required = ["companyId", "destinationKey", "bridgeVersion", "adapterVersion", "liveListing", "factsJson", "draftPayload"];
    for (const field of required) {
      if (!(field in body)) {
        return NextResponse.json({ error: `${field} is required` }, { status: 400 });
      }
    }

    const result = await intakeLiveDestinationRevision(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[API:DestinationWorkflows:LiveRevisions:Intake] failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
