import { NextRequest, NextResponse } from "next/server";
import { startDestinationMissionRun } from "@/lib/destination-missions";
import { recordDestinationOutcomeMemory } from "@/lib/destination-review-bridge";
import { assertUnitPermission } from "@/lib/check-foundation/permissions-audit";
import { resolveMiniappRouteContext } from "@/lib/check-foundation/miniapp-route-guard";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ unitId: string; miniappId: string; contentId: string }> },
) {
  try {
    const { unitId, miniappId, contentId } = await params;
    const guard = await resolveMiniappRouteContext({
      request,
      unitId,
      miniappIdRaw: miniappId,
      requiredRole: "ADMIN",
    });
    if ("error" in guard) return guard.error;

    await assertUnitPermission({
      companyId: guard.context.unitId,
      actorId: guard.context.membership.id,
      actorEmail: guard.context.sessionEmail,
      role: guard.context.membership.role,
      permission: "miniapp.card.publish",
      targetType: "miniappcard",
      targetId: contentId,
      reason: "Miniapp content refresh via canonical units API.",
      payload: {
        miniappId: guard.context.miniappId,
      },
    });

    const bodyRaw = await request.json().catch(() => null);
    if (bodyRaw !== null && (typeof bodyRaw !== "object" || Array.isArray(bodyRaw))) {
      return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
    }
    const body = (bodyRaw ?? {}) as Record<string, unknown>;
    const run = await startDestinationMissionRun({
      companyId: guard.context.unitId,
      destinationKey: guard.context.miniappId,
      missionKind: "rulebook_new_listing",
      missionDefinitionId:
        typeof body.missionDefinitionId === "string" && body.missionDefinitionId.trim()
          ? body.missionDefinitionId.trim()
          : undefined,
      metadata: {
        source: "miniapp-content-refresh",
        miniappId: guard.context.miniappId,
        refreshContentId: contentId,
        ...(body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {}),
      },
    });

    await recordDestinationOutcomeMemory({
      companyId: guard.context.unitId,
      destinationKey: guard.context.miniappId,
      workflowRunId: run.id,
      bridgeVersion: "miniapp-refresh@v1",
      eventType: "refresh_requested",
      reasonCode:
        typeof body.reasonCode === "string" && body.reasonCode.trim()
          ? body.reasonCode.trim()
          : "manual_refresh_requested",
      notes: typeof body.notes === "string" ? body.notes : undefined,
      actorType: "HUMAN",
      actorId: guard.context.sessionEmail,
      payload: {
        miniappId: guard.context.miniappId,
        contentId,
      },
    });

    return NextResponse.json({
      ok: true,
      unitId: guard.context.unitId,
      miniappId: guard.context.miniappId,
      contentId,
      run,
    });
  } catch (error) {
    const statusCode = (error as Error & { statusCode?: number })?.statusCode;
    if (statusCode === 403) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Forbidden" }, { status: 403 });
    }
    console.error("[API:Units:Miniapp:Content:Refresh] failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
