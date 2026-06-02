import { NextRequest, NextResponse } from "next/server";
import { runClassScoutRefreshLaneTick } from "@/lib/destination-classscout-maintenance";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const companyId = String(body?.companyId || request.nextUrl.searchParams.get("companyId") || "");
  const limit = Number(body?.limit ?? request.nextUrl.searchParams.get("limit") ?? 5);
  if (!companyId) {
    return NextResponse.json({ ok: false, error: "Missing companyId" }, { status: 400 });
  }

  const auth = await verifyMembership(request, companyId, "ADMIN");
  if (auth.error) return auth.error;

  const result = await runClassScoutRefreshLaneTick({
    companyId,
    actorId: auth.membership.id || auth.session.email || "webapp-user",
    limit: Number.isFinite(limit) ? limit : 5,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}

