import { NextRequest, NextResponse } from "next/server";
import { listDestinationCandidatesForWorkflow } from "@/lib/destination-workflows";
import { getDestinationMissionRun } from "@/lib/destination-missions";
import { normalizeDestinationKey } from "@/lib/destination-scope";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const companyId = String(request.nextUrl.searchParams.get("companyId") || "");
  if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  const destinationKeyRaw = request.nextUrl.searchParams.get("destinationKey");
  if (destinationKeyRaw && !normalizeDestinationKey(destinationKeyRaw)) {
    return NextResponse.json({ error: "destinationKey must be one of: classscout, compare" }, { status: 400 });
  }
  const destinationKey = normalizeDestinationKey(destinationKeyRaw);
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  const { id } = await params;
  const mission = await getDestinationMissionRun(companyId, id);
  if (!mission) return NextResponse.json({ error: "Mission run not found" }, { status: 404 });
  if (destinationKey && mission.destinationKey !== destinationKey) {
    return NextResponse.json({ error: "Mission run not found" }, { status: 404 });
  }

  const candidates = await listDestinationCandidatesForWorkflow(companyId, id);
  return NextResponse.json({ ok: true, candidates, destinationScope: mission.destinationKey });
}
