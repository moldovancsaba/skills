import { NextRequest, NextResponse } from "next/server";
import { getDestinationMissionControlSummary } from "@/lib/destination-workflow-runtime";
import { verifyMembership } from "@/lib/permissions";
import { normalizeDestinationKey } from "@/lib/destination-scope";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const companyId = String(request.nextUrl.searchParams.get("companyId") || "");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;
  const destinationKeyRaw = request.nextUrl.searchParams.get("destinationKey");
  if (destinationKeyRaw && !normalizeDestinationKey(destinationKeyRaw)) {
    return NextResponse.json({ error: "destinationKey must be one of: classscout, compare" }, { status: 400 });
  }
  const destinationKey = normalizeDestinationKey(destinationKeyRaw) ?? undefined;

  const summary = await getDestinationMissionControlSummary(companyId, destinationKey);
  return NextResponse.json(summary);
}
