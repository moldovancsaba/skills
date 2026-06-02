import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { verifyBackgroundJobSecret } from "@/lib/ingest-auth";
import { executeMiniappOpsAction, type MiniappOpsAction } from "@/lib/miniapp-ops-console";
import { canQueueMiniappOpsAction, enqueueMiniappOpsAction } from "@/lib/miniapp-ops-queue";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asBoolean(value: unknown) {
  return value === true;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ miniappKey: string }> },
) {
  const body = asRecord(await request.json().catch(() => null));
  const companyId = asString(body.companyId);
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });
  const auth = await verifyMembership(request, companyId, "ADMIN");
  let workerAuthorized = false;
  if (auth.error) {
    const workerAuth = await verifyBackgroundJobSecret(request);
    if (workerAuth.error) return workerAuth.error;
    workerAuthorized = true;
  }

  const { miniappKey } = await params;
  const action = asString(body.action) as MiniappOpsAction;
  const actionInput = {
    companyId,
    miniappKey,
    destinationKeyHint: asString(body.destinationKey) || undefined,
    action,
    taskId: asString(body.taskId) || asString(body.candidateId) || undefined,
    candidateId: asString(body.candidateId) || asString(body.taskId) || undefined,
    sourceTerm: asString(body.sourceTerm) || undefined,
    reason: asString(body.reason) || undefined,
    targetVisibleCards: Number(body.targetVisibleCards) || undefined,
    maxCycles: Number(body.maxCycles) || undefined,
    tasksPerCycle: Number(body.tasksPerCycle) || undefined,
    discoverLimit: Number(body.discoverLimit) || undefined,
    processLimit: Number(body.processLimit) || undefined,
    payload: asRecord(body.payload),
    autoApprove: asBoolean(body.autoApprove),
    autoPublish: asBoolean(body.autoPublish),
  };
  try {
    const result = !workerAuthorized && canQueueMiniappOpsAction(action)
      ? await enqueueMiniappOpsAction(actionInput)
      : await executeMiniappOpsAction(actionInput);
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: String(error),
      code: "miniapp_ops_action_failed",
      retryable: false,
      diagnostics: { miniappKey, action },
      correlationId: `miniapp-action-${Date.now()}`,
    }, { status: 400 });
  }
}
