import { NextRequest, NextResponse } from "next/server";
import { startDestinationWorkflowRun } from "@/lib/destination-workflow-runtime";
import { verifyIngestSecret } from "@/lib/ingest-auth";
import { normalizeDestinationKey } from "@/lib/destination-scope";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
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
    const companyId = String(body.companyId || "");
    const destinationKeyRaw = body.destinationKey;
    if (!companyId || !destinationKeyRaw || !body.workflowKind) {
      return NextResponse.json(
        { error: "companyId, destinationKey, and workflowKind are required" },
        { status: 400 },
      );
    }
    const destinationKey = normalizeDestinationKey(destinationKeyRaw);
    if (!destinationKey) {
      return NextResponse.json({ error: "destinationKey must be one of: classscout, compare" }, { status: 400 });
    }

    const run = await startDestinationWorkflowRun({
      companyId,
      destinationKey,
      workflowKind: String(body.workflowKind || ""),
      currentStage: typeof body.currentStage === "string" ? body.currentStage : undefined,
      metadata: asRecord(body.metadata),
    });

    return NextResponse.json({ ok: true, run });
  } catch (error) {
    console.error("[API:DestinationWorkflowRuns] POST failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
