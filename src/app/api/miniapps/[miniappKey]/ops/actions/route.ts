import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { executeMiniappOpsAction, type MiniappOpsAction } from "@/lib/miniapp-ops-console";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ miniappKey: string }> },
) {
  const body = asRecord(await request.json().catch(() => null));
  const companyId = asString(body.companyId);
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });
  const auth = await verifyMembership(request, companyId, "ADMIN");
  if (auth.error) return auth.error;

  const { miniappKey } = await params;
  try {
    const result = await executeMiniappOpsAction({
      companyId,
      miniappKey,
      destinationKeyHint: asString(body.destinationKey) || undefined,
      action: asString(body.action) as MiniappOpsAction,
      taskId: asString(body.taskId) || undefined,
      sourceTerm: asString(body.sourceTerm) || undefined,
      reason: asString(body.reason) || undefined,
      targetVisibleCards: Number(body.targetVisibleCards) || undefined,
      maxCycles: Number(body.maxCycles) || undefined,
      tasksPerCycle: Number(body.tasksPerCycle) || undefined,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: String(error),
      code: "miniapp_ops_action_failed",
      retryable: false,
      diagnostics: { miniappKey, action: asString(body.action) },
      correlationId: `miniapp-action-${Date.now()}`,
    }, { status: 400 });
  }
}
