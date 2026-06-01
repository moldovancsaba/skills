import { NextRequest, NextResponse } from "next/server";
import { getDestinationReplayCandidates } from "@/lib/destination-learning";
import { resolveDestinationKeyForCompany } from "@/lib/destination-key-resolution";
import { verifyMembership } from "@/lib/permissions";
import { normalizeDestinationKey } from "@/lib/destination-scope";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const companyId = String(request.nextUrl.searchParams.get("companyId") || "");
    if (!companyId) {
      return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });
    }
    const destinationKey = request.nextUrl.searchParams.get("destinationKey");
    if (destinationKey && !normalizeDestinationKey(destinationKey)) {
      return NextResponse.json({ ok: false, error: "destinationKey must be one of: classscout, compare" }, { status: 400 });
    }
    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;
    const resolvedDestinationKey = await resolveDestinationKeyForCompany(companyId, destinationKey);

    const items = await getDestinationReplayCandidates({
      companyId,
      destinationKey: resolvedDestinationKey,
    });

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      count: items.length,
      items,
    });
  } catch (error) {
    console.error("[API:DestinationLearning:ReplayCandidates] failure:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
