import { NextRequest, NextResponse } from "next/server";
import { getDestinationMissionRun } from "@/lib/destination-missions";
import { queueDestinationMissionRunAction } from "@/lib/destination-mission-queue";
import { verifyMembership } from "@/lib/permissions";
import { normalizeDestinationKey } from "@/lib/destination-scope";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const bodyRaw = await request.json().catch(() => null);
  if (!bodyRaw || typeof bodyRaw !== "object" || Array.isArray(bodyRaw)) {
    return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
  }
  const body = bodyRaw as Record<string, unknown>;
  const companyId = typeof body.companyId === "string" ? body.companyId : "";
  if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  const destinationKeyRaw = body.destinationKey;
  if (destinationKeyRaw !== undefined && !normalizeDestinationKey(destinationKeyRaw)) {
    return NextResponse.json({ error: "destinationKey must be one of: classscout, compare" }, { status: 400 });
  }
  const destinationKey = normalizeDestinationKey(destinationKeyRaw);
  const auth = await verifyMembership(request, companyId, "ADMIN");
  if (auth.error) return auth.error;

  const { id } = await params;
  const mission = await getDestinationMissionRun(companyId, id);
  if (!mission || (destinationKey && mission.destinationKey !== destinationKey)) {
    return NextResponse.json({ error: "Mission run not found" }, { status: 404 });
  }
  if (mission.destinationKey !== "classscout" && mission.destinationKey !== "compare") {
    return NextResponse.json({ error: "Mission destination is not supported for this route" }, { status: 400 });
  }
  if (mission.state === "PAUSED") {
    return NextResponse.json({ error: "Mission run is paused" }, { status: 409 });
  }

  const result = await queueDestinationMissionRunAction({
    companyId,
    missionId: id,
    destinationScope: destinationKey ?? mission.destinationKey,
    actorId: auth.session.email,
    action: "score-candidate",
  });
  return NextResponse.json(result, { status: 202 });
}
