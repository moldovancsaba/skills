import { NextRequest, NextResponse } from "next/server";
import { verifyIngestSecret } from "@/lib/ingest-auth";
import { createDestinationFactSnapshot } from "@/lib/destination-workflows";
import type { DestinationFactSnapshotInput } from "@/lib/destination-workflow-contract";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await verifyIngestSecret(request);
  if (auth.error) return auth.error;

  try {
    const body = (await request.json()) as DestinationFactSnapshotInput;
    if (!body.companyId || !body.destinationKey || !body.candidateId || !body.extractorVersion) {
      return NextResponse.json(
        { error: "companyId, destinationKey, candidateId, and extractorVersion are required" },
        { status: 400 },
      );
    }
    if (!body.factsJson || !body.provenanceJson) {
      return NextResponse.json({ error: "factsJson and provenanceJson are required" }, { status: 400 });
    }

    const record = await createDestinationFactSnapshot(body);
    return NextResponse.json({ ok: true, factSnapshot: record });
  } catch (error) {
    console.error("[API:DestinationWorkflows:FactIntake] failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
