import { NextRequest, NextResponse } from "next/server";
import { listDestinationMissionRuns, startDestinationMissionRun } from "@/lib/destination-missions";
import type { DestinationMissionKind } from "@/lib/destination-mission-contract";
import { resolveMiniappRouteContext } from "@/lib/check-foundation/miniapp-route-guard";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeMissionKind(value: unknown): DestinationMissionKind {
  return value === "rulebook_new_listing" ? "rulebook_new_listing" : "rulebook_new_listing";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ unitId: string; miniappId: string }> },
) {
  const { unitId, miniappId } = await params;
  const guard = await resolveMiniappRouteContext({
    request,
    unitId,
    miniappIdRaw: miniappId,
  });
  if ("error" in guard) return guard.error;

  const missionKind = normalizeMissionKind(request.nextUrl.searchParams.get("missionKind"));
  const runs = await listDestinationMissionRuns({
    companyId: guard.context.unitId,
    destinationKey: guard.context.miniappId,
    missionKind,
  });

  return NextResponse.json({
    ok: true,
    unitId: guard.context.unitId,
    miniappId: guard.context.miniappId,
    runs,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ unitId: string; miniappId: string }> },
) {
  try {
    const { unitId, miniappId } = await params;
    const guard = await resolveMiniappRouteContext({
      request,
      unitId,
      miniappIdRaw: miniappId,
      requiredRole: "ADMIN",
    });
    if ("error" in guard) return guard.error;

    const bodyRaw = await request.json().catch(() => null);
    if (bodyRaw !== null && (typeof bodyRaw !== "object" || Array.isArray(bodyRaw))) {
      return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
    }
    const body = (bodyRaw ?? {}) as Record<string, unknown>;
    const run = await startDestinationMissionRun({
      companyId: guard.context.unitId,
      destinationKey: guard.context.miniappId,
      missionKind: normalizeMissionKind(body.missionKind),
      missionDefinitionId:
        typeof body.missionDefinitionId === "string" && body.missionDefinitionId.trim()
          ? body.missionDefinitionId.trim()
          : undefined,
      policySnapshot: asRecord(body.policySnapshot),
      metadata: asRecord(body.metadata),
    });

    return NextResponse.json({
      ok: true,
      unitId: guard.context.unitId,
      miniappId: guard.context.miniappId,
      run,
    });
  } catch (error) {
    console.error("[API:Units:Miniapp:Missions] failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
