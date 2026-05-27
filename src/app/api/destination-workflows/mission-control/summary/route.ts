import { NextRequest, NextResponse } from "next/server";
import { getDestinationMissionControlSummary } from "@/lib/destination-workflow-runtime";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  const summary = await getDestinationMissionControlSummary(companyId as string);
  return NextResponse.json(summary);
}
