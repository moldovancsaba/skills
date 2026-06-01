import { NextRequest, NextResponse } from "next/server";
import { recordOutcomeEvent } from "@/lib/audit-ledger";
import { prisma } from "@/lib/db";
import { replayDestinationWorkflowRun, retryDestinationWorkflowStage } from "@/lib/destination-workflow-runtime";
import { verifyMembership } from "@/lib/permissions";
import { normalizeDestinationKey } from "@/lib/destination-scope";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const bodyRaw = await request.json().catch(() => null);
    if (!bodyRaw || typeof bodyRaw !== "object" || Array.isArray(bodyRaw)) {
      return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
    }
    const body = bodyRaw as Record<string, unknown>;
    const companyId = typeof body.companyId === "string" ? body.companyId : "";
    if (!companyId) {
      return NextResponse.json({ error: "companyId is required" }, { status: 400 });
    }
    const destinationKeyRaw = body.destinationKey;
    if (destinationKeyRaw !== undefined && !normalizeDestinationKey(destinationKeyRaw)) {
      return NextResponse.json({ error: "destinationKey must be one of: classscout, compare" }, { status: 400 });
    }
    const destinationKey = normalizeDestinationKey(destinationKeyRaw);
    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;

    const actionType = typeof body.actionType === "string" ? body.actionType : "";
    const runId = typeof body.runId === "string" ? body.runId : "";
    if (!actionType || !runId) {
      return NextResponse.json({ error: "companyId, runId, and actionType are required" }, { status: 400 });
    }
    if (actionType !== "RETRY" && actionType !== "REPLAY") {
      return NextResponse.json({ error: "actionType must be RETRY or REPLAY" }, { status: 400 });
    }
    if (destinationKey) {
      const existingRun = await prisma.destinationWorkflowRun.findFirst({
        where: { id: runId, companyId },
        select: { destinationInstance: { select: { destinationKey: true } } },
      });
      if (!existingRun || normalizeDestinationKey(existingRun.destinationInstance.destinationKey) !== destinationKey) {
        return NextResponse.json({ error: "Workflow run not found" }, { status: 404 });
      }
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
      annotation: typeof body.reason === "string" ? body.reason : undefined,
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
