import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { getComparePublicVerificationSummary } from "@/lib/compare-public-verification";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const companyId = String(request.nextUrl.searchParams.get("companyId") || "");
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  try {
    const verification = await getComparePublicVerificationSummary(companyId);
    return NextResponse.json({ ok: true, verification });
  } catch (error) {
    console.error("[API:Compare:PublicVerification] failure:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
