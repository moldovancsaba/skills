import { NextRequest, NextResponse } from "next/server";
import { getDestinationMissionRun, transitionDestinationMissionState } from "@/lib/destination-missions";
import { verifyMembership } from "@/lib/permissions";
import { normalizeDestinationKey } from "@/lib/destination-scope";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

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
    const existingRun = await getDestinationMissionRun(companyId, id);
    if (!existingRun || existingRun.destinationKey !== destinationKey) {
      return NextResponse.json({ error: "Mission run not found" }, { status: 404 });
    }
  }
  try {
    const run = await transitionDestinationMissionState({
      companyId,
      missionId: id,
      nextState: "DISCOVERING",
      metadata: asRecord(body.metadata) ?? { resumedBy: auth.session.email },
    });
    if (!run) return NextResponse.json({ error: "Mission run not found" }, { status: 404 });
    return NextResponse.json({ ok: true, run });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 409 });
  }
}
