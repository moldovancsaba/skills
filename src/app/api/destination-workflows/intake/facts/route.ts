import { NextRequest, NextResponse } from "next/server";
import { verifyIngestSecret } from "@/lib/ingest-auth";
import { normalizeDestinationKey } from "@/lib/destination-scope";
import { createDestinationFactSnapshot } from "@/lib/destination-workflows";
import type { DestinationFactSnapshotInput } from "@/lib/destination-workflow-contract";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await verifyIngestSecret(request);
  if (auth.error) return auth.error;

  try {
    const bodyRaw = await request.json();
    if (!bodyRaw || typeof bodyRaw !== "object" || Array.isArray(bodyRaw)) {
      return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
    }
    const body = bodyRaw as DestinationFactSnapshotInput;
    const companyId = typeof body.companyId === "string" ? body.companyId : "";
    const destinationKeyRaw = body.destinationKey;
    if (!companyId || !destinationKeyRaw || !body.candidateId || !body.extractorVersion) {
      return NextResponse.json(
        { error: "companyId, destinationKey, candidateId, and extractorVersion are required" },
        { status: 400 },
      );
    }
    const destinationKey = normalizeDestinationKey(destinationKeyRaw);
    if (!destinationKey) {
      return NextResponse.json({ error: "destinationKey must be supported by checklist" }, { status: 400 });
    }
    if (!body.factsJson || !body.provenanceJson) {
      return NextResponse.json({ error: "factsJson and provenanceJson are required" }, { status: 400 });
    }

    const record = await createDestinationFactSnapshot({
      ...body,
      companyId,
      destinationKey,
    });
    return NextResponse.json({ ok: true, factSnapshot: record });
  } catch (error) {
    console.error("[API:DestinationWorkflows:FactIntake] failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
