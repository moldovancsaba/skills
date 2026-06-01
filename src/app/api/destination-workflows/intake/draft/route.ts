import { NextRequest, NextResponse } from "next/server";
import { verifyIngestSecret } from "@/lib/ingest-auth";
import { normalizeDestinationKey } from "@/lib/destination-scope";
import { createDestinationDraft } from "@/lib/destination-workflows";
import type { DestinationDraftInput } from "@/lib/destination-workflow-contract";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await verifyIngestSecret(request);
  if (auth.error) return auth.error;

  try {
    const bodyRaw = await request.json();
    if (!bodyRaw || typeof bodyRaw !== "object" || Array.isArray(bodyRaw)) {
      return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
    }
    const body = bodyRaw as DestinationDraftInput;
    const companyId = typeof body.companyId === "string" ? body.companyId : "";
    const destinationKeyRaw = body.destinationKey;
    if (!companyId || !destinationKeyRaw || !body.candidateId || !body.adapterVersion) {
      return NextResponse.json(
        { error: "companyId, destinationKey, candidateId, and adapterVersion are required" },
        { status: 400 },
      );
    }
    const destinationKey = normalizeDestinationKey(destinationKeyRaw);
    if (!destinationKey) {
      return NextResponse.json({ error: "destinationKey must be one of: classscout, compare" }, { status: 400 });
    }
    if (!body.draftJson || !body.provenanceJson) {
      return NextResponse.json({ error: "draftJson and provenanceJson are required" }, { status: 400 });
    }

    const record = await createDestinationDraft({
      ...body,
      companyId,
      destinationKey,
    });
    return NextResponse.json({ ok: true, draft: record });
  } catch (error) {
    console.error("[API:DestinationWorkflows:DraftIntake] failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
