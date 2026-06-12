import { NextRequest, NextResponse } from "next/server";
import { verifyIngestSecret } from "@/lib/ingest-auth";
import { normalizeDestinationKey } from "@/lib/destination-scope";
import { upsertDestinationSourceDocument } from "@/lib/destination-workflows";
import type { DestinationSourceDocumentInput } from "@/lib/destination-workflow-contract";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await verifyIngestSecret(request);
  if (auth.error) return auth.error;

  try {
    const bodyRaw = await request.json();
    if (!bodyRaw || typeof bodyRaw !== "object" || Array.isArray(bodyRaw)) {
      return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
    }
    const body = bodyRaw as DestinationSourceDocumentInput;
    const companyId = typeof body.companyId === "string" ? body.companyId : "";
    const destinationKeyRaw = body.destinationKey;
    if (!companyId || !destinationKeyRaw || !body.sourceType || !body.rawText) {
      return NextResponse.json(
        { error: "companyId, destinationKey, sourceType, and rawText are required" },
        { status: 400 },
      );
    }
    const destinationKey = normalizeDestinationKey(destinationKeyRaw);
    if (!destinationKey) {
      return NextResponse.json({ error: "destinationKey must be supported by checklist" }, { status: 400 });
    }

    const record = await upsertDestinationSourceDocument({
      ...body,
      companyId,
      destinationKey,
    });
    return NextResponse.json({ ok: true, sourceDocument: record });
  } catch (error) {
    console.error("[API:DestinationWorkflows:SourceIntake] failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
