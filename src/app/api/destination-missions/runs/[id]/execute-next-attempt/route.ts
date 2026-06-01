import { NextRequest, NextResponse } from "next/server";
import { getDestinationMissionRun } from "@/lib/destination-missions";
import { executeDestinationMissionNextAttempt } from "@/lib/destination-mission-runner";
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
  if (destinationKey) {
    const mission = await getDestinationMissionRun(companyId, id);
    if (!mission || mission.destinationKey !== destinationKey) {
      return NextResponse.json({ error: "Mission run not found" }, { status: 404 });
    }
  }
  const result = await executeDestinationMissionNextAttempt({
    companyId,
    missionId: id,
    actorId: auth.session.email,
    maxAutoRejections: typeof body.maxAutoRejections === "number" ? body.maxAutoRejections : undefined,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Mission execution failed", trail: result.trail ?? [] },
      { status: result.status ?? 500 },
    );
  }

  return NextResponse.json(result);
}
