import { NextRequest, NextResponse } from "next/server";
import { recordOutcomeEvent } from "@/lib/audit-ledger";
import { replayDestinationWorkflowRun, retryDestinationWorkflowStage } from "@/lib/destination-workflow-runtime";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const companyId = String(body.companyId || "");
    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;

    const actionType = String(body.actionType || "");
    const runId = String(body.runId || "");
    if (!actionType || !runId) {
      return NextResponse.json({ error: "companyId, runId, and actionType are required" }, { status: 400 });
    }

    const result =
      actionType === "REPLAY"
        ? await replayDestinationWorkflowRun({
            companyId,
            runId,
            fromStage: String(body.fromStage || ""),
            reason: typeof body.reason === "string" ? body.reason : undefined,
          })
        : await retryDestinationWorkflowStage({
            companyId,
            runId,
            stage: typeof body.stage === "string" ? body.stage : undefined,
            reason: typeof body.reason === "string" ? body.reason : undefined,
          });

    if (!result) return NextResponse.json({ error: "Workflow run not found" }, { status: 404 });

    await recordOutcomeEvent({
      companyId,
      actorType: "HUMAN",
      actorEmail: auth.session.email,
      entityType: "DESTINATION_WORKFLOW",
      entityId: runId,
      outcomeType: `DESTINATION_WORKFLOW_${actionType}`,
      outcomeValue: actionType,
      annotation: body.reason,
      payload: {
        stage: body.stage,
        fromStage: body.fromStage,
      },
      teachingWeight: 80,
    });

    return NextResponse.json({ ok: true, run: result });
  } catch (error) {
    console.error("[API:DestinationMissionControlRecover] failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
