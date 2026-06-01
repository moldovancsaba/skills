import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { getVisitorOpsSummary } from "@/lib/visitor-ops-summary";

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
  try {
    const destinationKey = String(request.nextUrl.searchParams.get("destinationKey") || "").trim() || undefined;
    const summary = await getVisitorOpsSummary(companyId, visitorKey, destinationKey);
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
