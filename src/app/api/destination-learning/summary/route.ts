import { NextRequest, NextResponse } from "next/server";
import { getDestinationLearningSummary } from "@/lib/destination-learning";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const companyId = String(request.nextUrl.searchParams.get("companyId") || "");
    const destinationKey = String(request.nextUrl.searchParams.get("destinationKey") || "classscout");
    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;

    const summary = await getDestinationLearningSummary({
      companyId,
      destinationKey: destinationKey as "classscout",
    });

    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    console.error("[API:DestinationLearning:Summary] failure:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
