import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { getMiniappOpsSnapshot } from "@/lib/miniapp-ops-console";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ miniappKey: string }> },
) {
  const companyId = String(request.nextUrl.searchParams.get("companyId") || "").trim();
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });
  const auth = await verifyMembership(request, companyId, "MEMBER");
  if (auth.error) return auth.error;

  const { miniappKey } = await params;
  const destinationKey = String(request.nextUrl.searchParams.get("destinationKey") || "").trim() || undefined;
  try {
    const snapshot = await getMiniappOpsSnapshot({ companyId, miniappKey, destinationKeyHint: destinationKey });
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: String(error),
      code: "miniapp_ops_snapshot_failed",
      retryable: true,
      diagnostics: { miniappKey, destinationKey },
      correlationId: `miniapp-ops-${Date.now()}`,
    }, { status: 400 });
  }
}
