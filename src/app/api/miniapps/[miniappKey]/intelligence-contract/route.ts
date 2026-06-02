import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { resolveMiniappIntelligenceContract } from "@/lib/miniapp-intelligence-contracts";

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
  const destinationKeyHint = String(request.nextUrl.searchParams.get("destinationKey") || "").trim() || undefined;
  const resolved = resolveMiniappIntelligenceContract({
    miniappKey,
    destinationKeyHint,
  });

  return NextResponse.json({
    ok: resolved.validation.valid,
    miniappKey,
    destinationKey: resolved.contract.destinationKey,
    contractKey: resolved.contract.key,
    contract: resolved.contract,
    validation: resolved.validation,
  }, {
    status: resolved.validation.valid ? 200 : 422,
  });
}
