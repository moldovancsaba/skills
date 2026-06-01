import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { listLocalLaneEvents, type LocalLane } from "@/lib/local-lane-events";
import { verifySuperAdmin } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function parseLane(value: string | null): LocalLane | null {
  if (value === "SYSTEM_HEALTH" || value === "PLAYLIST" || value === "HUMAN_APPROVED_BURST") return value;
  return null;
}

function isLocalOperatorRequest(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const forwardedHost = request.headers.get("x-forwarded-host") || "";
  const candidate = `${host} ${forwardedHost}`.toLowerCase();
  return candidate.includes("localhost")
    || candidate.includes("127.0.0.1")
    || candidate.includes("[::1]");
}

export async function GET(request: NextRequest) {
  if (!isLocalOperatorRequest(request)) {
    const auth = await verifySuperAdmin(request);
    if (auth.error) return auth.error;
  }

  const laneRaw = request.nextUrl.searchParams.get("lane");
  const lane = parseLane(laneRaw);
  if (laneRaw && !lane) {
    return NextResponse.json({ error: "lane must be SYSTEM_HEALTH, PLAYLIST, or HUMAN_APPROVED_BURST" }, { status: 400 });
  }

  const limit = Number(request.nextUrl.searchParams.get("limit") || 50);
  const events = await listLocalLaneEvents(prisma, { lane, limit });
  return NextResponse.json({ ok: true, events });
}
