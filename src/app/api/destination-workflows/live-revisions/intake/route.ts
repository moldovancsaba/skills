import { NextRequest, NextResponse } from "next/server";
import { verifyIngestSecret } from "@/lib/ingest-auth";
import { intakeLiveDestinationRevision } from "@/lib/destination-live-revisions";
import { normalizeDestinationKey } from "@/lib/destination-scope";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
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
    const required = ["companyId", "destinationKey", "bridgeVersion", "adapterVersion", "liveListing", "factsJson", "draftPayload"];
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

    const result = await intakeLiveDestinationRevision({
      companyId,
      destinationKey,
      bridgeVersion: String(body.bridgeVersion || ""),
      adapterVersion: String(body.adapterVersion || ""),
      liveListing: asRecord(body.liveListing),
      factsJson: asRecord(body.factsJson),
      draftPayload: asRecord(body.draftPayload),
      metadata: asRecord(body.metadata),
    } as never);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[API:DestinationWorkflows:LiveRevisions:Intake] failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
