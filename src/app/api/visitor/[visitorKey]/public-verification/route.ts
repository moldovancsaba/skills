import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { resolveDestinationKeyForVisitorWithHint } from "@/lib/visitor-blueprints";
import { getVisitorPublicVerificationSummary } from "@/lib/visitor-public-verification";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ visitorKey: string }> },
) {
  const companyId = String(request.nextUrl.searchParams.get("companyId") || "").trim();
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });

  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  const { visitorKey } = await params;
  const destinationKeyHint = String(request.nextUrl.searchParams.get("destinationKey") || "").trim() || undefined;
  const destinationKey = resolveDestinationKeyForVisitorWithHint(visitorKey, destinationKeyHint);
  if (!destinationKey) {
    return NextResponse.json({ ok: false, error: "Unsupported visitorKey" }, { status: 400 });
  }

  const verification = await getVisitorPublicVerificationSummary(companyId, visitorKey, destinationKeyHint);
  return NextResponse.json({ ok: true, visitorKey, destinationKey, verification });
}
