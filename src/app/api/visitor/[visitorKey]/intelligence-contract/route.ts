import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { resolveDestinationKeyForVisitorWithHint } from "@/lib/visitor-blueprints";
import { resolveMiniappIntelligenceContract } from "@/lib/miniapp-intelligence-contracts";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ visitorKey: string }> },
) {
  const companyId = String(request.nextUrl.searchParams.get("companyId") || "").trim();
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });

  const auth = await verifyMembership(request, companyId, "MEMBER");
  if (auth.error) return auth.error;

  const { visitorKey } = await params;
  const destinationKeyHint = String(request.nextUrl.searchParams.get("destinationKey") || "").trim() || undefined;
  const destinationKey = resolveDestinationKeyForVisitorWithHint(visitorKey, destinationKeyHint);
  if (!destinationKey) {
    return NextResponse.json({ ok: false, error: "Unsupported visitorKey" }, { status: 400 });
  }

  const resolved = resolveMiniappIntelligenceContract({
    visitorKey,
    destinationKeyHint: destinationKey,
  });

  return NextResponse.json({
    ok: resolved.validation.valid,
    visitorKey,
    destinationKey,
    contractKey: resolved.contract.key,
    contract: resolved.contract,
    validation: resolved.validation,
  }, {
    status: resolved.validation.valid ? 200 : 422,
  });
}
