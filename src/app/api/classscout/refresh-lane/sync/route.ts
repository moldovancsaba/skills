import { NextRequest, NextResponse } from "next/server";
import { selectClassScoutRefreshCandidates } from "@/lib/destination-classscout-maintenance";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const companyId = String(body?.companyId || request.nextUrl.searchParams.get("companyId") || "");
  const limit = Number(body?.limit ?? request.nextUrl.searchParams.get("limit") ?? 25);
  if (!companyId) {
    return NextResponse.json({ ok: false, error: "Missing companyId" }, { status: 400 });
  }

  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  const result = await selectClassScoutRefreshCandidates({
    companyId,
    limit: Number.isFinite(limit) ? limit : 25,
  });
  const status = result.ok ? 200 : (result.status ?? 500);
  return NextResponse.json(result, { status });
}

