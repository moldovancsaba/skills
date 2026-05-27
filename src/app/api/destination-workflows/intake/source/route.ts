import { NextRequest, NextResponse } from "next/server";
import { verifyIngestSecret } from "@/lib/ingest-auth";
import { upsertDestinationSourceDocument } from "@/lib/destination-workflows";
import type { DestinationSourceDocumentInput } from "@/lib/destination-workflow-contract";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await verifyIngestSecret(request);
  if (auth.error) return auth.error;

  try {
    const body = (await request.json()) as DestinationSourceDocumentInput;
    if (!body.companyId || !body.destinationKey || !body.sourceType || !body.rawText) {
      return NextResponse.json(
        { error: "companyId, destinationKey, sourceType, and rawText are required" },
        { status: 400 },
      );
    }

    const record = await upsertDestinationSourceDocument(body);
    return NextResponse.json({ ok: true, sourceDocument: record });
  } catch (error) {
    console.error("[API:DestinationWorkflows:SourceIntake] failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
