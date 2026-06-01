import { NextRequest, NextResponse } from "next/server";
import { recordOutcomeEvent } from "@/lib/audit-ledger";
import { retryDestinationWorkflowStage } from "@/lib/destination-workflow-runtime";
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
    const stage = typeof body.stage === "string" && body.stage.trim() ? body.stage.trim() : undefined;
    const run = await retryDestinationWorkflowStage({
      companyId,
      runId: id,
      stage,
      reason: typeof body.reason === "string" ? body.reason : undefined,
    });
    if (!run) return NextResponse.json({ error: "Workflow run not found" }, { status: 404 });

    await recordOutcomeEvent({
      companyId,
      actorType: "HUMAN",
      actorEmail: auth.session.email,
      entityType: "DESTINATION_WORKFLOW",
      entityId: id,
      outcomeType: "DESTINATION_WORKFLOW_RETRY",
      outcomeValue: stage || run.currentStage,
      annotation: typeof body.reason === "string" ? body.reason : undefined,
      payload: { stage: stage || run.currentStage },
      teachingWeight: 75,
    });

    return NextResponse.json({ ok: true, run });
  } catch (error) {
    console.error("[API:DestinationWorkflowRetry] failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
