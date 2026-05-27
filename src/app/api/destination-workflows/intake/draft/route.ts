import { NextRequest, NextResponse } from "next/server";
import { verifyIngestSecret } from "@/lib/ingest-auth";
import { createDestinationDraft } from "@/lib/destination-workflows";
import type { DestinationDraftInput } from "@/lib/destination-workflow-contract";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await verifyIngestSecret(request);
  if (auth.error) return auth.error;

  try {
    const body = (await request.json()) as DestinationDraftInput;
    if (!body.companyId || !body.destinationKey || !body.candidateId || !body.adapterVersion) {
      return NextResponse.json(
        { error: "companyId, destinationKey, candidateId, and adapterVersion are required" },
        { status: 400 },
      );
    }
    if (!body.draftJson || !body.provenanceJson) {
      return NextResponse.json({ error: "draftJson and provenanceJson are required" }, { status: 400 });
    }

    const record = await createDestinationDraft(body);
    return NextResponse.json({ ok: true, draft: record });
  } catch (error) {
    console.error("[API:DestinationWorkflows:DraftIntake] failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
