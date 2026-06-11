import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { getTrainersLandingSummary } from "@/lib/trainers-landing";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const companyId = String(request.nextUrl.searchParams.get("companyId") || "");
  if (!companyId) {
    return NextResponse.json({ ok: false, error: "Missing companyId" }, { status: 400 });
  }

  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  try {
    const summary = await getTrainersLandingSummary(companyId);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[API:Trainers:Landing] failure:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

