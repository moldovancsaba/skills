import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { getClassScoutLandingSummary } from "@/lib/classscout-landing";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const companyId = String(request.nextUrl.searchParams.get("companyId") || "");
  if (!companyId) {
    return NextResponse.json({ ok: false, error: "Missing companyId" }, { status: 400 });
  }

  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  try {
    const summary = await getClassScoutLandingSummary(companyId);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[API:ClassScout:Landing] failure:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

