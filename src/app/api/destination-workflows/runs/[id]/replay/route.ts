import { NextRequest, NextResponse } from "next/server";
import { recordOutcomeEvent } from "@/lib/audit-ledger";
import { replayDestinationWorkflowRun } from "@/lib/destination-workflow-runtime";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const rawBody = await request.json();
    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
      return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
    }
    const body = rawBody as Record<string, unknown>;
    const companyId = String(body.companyId || "");
    if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });
    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;

    const { id } = await params;
    const fromStage = String(body.fromStage || "");
    if (!fromStage) {
      return NextResponse.json({ error: "fromStage is required" }, { status: 400 });
    }

    const run = await replayDestinationWorkflowRun({
      companyId,
      runId: id,
      fromStage,
      reason: typeof body.reason === "string" ? body.reason : undefined,
    });
    if (!run) return NextResponse.json({ error: "Workflow run not found" }, { status: 404 });

    await recordOutcomeEvent({
      companyId,
      actorType: "HUMAN",
      actorEmail: auth.session.email,
      entityType: "DESTINATION_WORKFLOW",
      entityId: id,
      outcomeType: "DESTINATION_WORKFLOW_REPLAY",
      outcomeValue: fromStage,
      annotation: typeof body.reason === "string" ? body.reason : undefined,
      payload: { fromStage },
      teachingWeight: 80,
    });

    return NextResponse.json({ ok: true, run });
  } catch (error) {
    console.error("[API:DestinationWorkflowReplay] failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
