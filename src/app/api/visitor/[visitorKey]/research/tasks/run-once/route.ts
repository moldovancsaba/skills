import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { runMiniappEvidenceRuntimeOnce } from "@/lib/miniapp-evidence-runtime";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ visitorKey: string }> },
) {
  const body = asRecord(await request.json().catch(() => null));
  const companyId = asString(body.companyId);
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });
  const auth = await verifyMembership(request, companyId, "ADMIN");
  if (auth.error) return auth.error;

  const { visitorKey } = await params;
  try {
    const result = await runMiniappEvidenceRuntimeOnce({
      companyId,
      visitorKey,
      destinationKeyHint: asString(body.destinationKey) || undefined,
      taskId: asString(body.taskId) || undefined,
      maxTasks: Number(body.maxTasks) || 1,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
