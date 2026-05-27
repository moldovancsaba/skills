import { NextRequest, NextResponse } from "next/server";
import { startDestinationWorkflowRun } from "@/lib/destination-workflow-runtime";
import { verifyIngestSecret } from "@/lib/ingest-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await verifyIngestSecret(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    if (!body.companyId || !body.destinationKey || !body.workflowKind) {
      return NextResponse.json(
        { error: "companyId, destinationKey, and workflowKind are required" },
        { status: 400 },
      );
    }

    const run = await startDestinationWorkflowRun({
      companyId: body.companyId,
      destinationKey: body.destinationKey,
      workflowKind: body.workflowKind,
      currentStage: typeof body.currentStage === "string" ? body.currentStage : undefined,
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : undefined,
    });

    return NextResponse.json({ ok: true, run });
  } catch (error) {
    console.error("[API:DestinationWorkflowRuns] POST failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
