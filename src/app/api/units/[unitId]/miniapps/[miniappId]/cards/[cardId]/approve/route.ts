import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { submitDestinationReviewDecision } from "@/lib/destination-review-bridge";
import { assertUnitPermission } from "@/lib/check-foundation/permissions-audit";
import { resolveMiniappRouteContext } from "@/lib/check-foundation/miniapp-route-guard";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ unitId: string; miniappId: string; cardId: string }> },
) {
  try {
    const { unitId, miniappId, cardId } = await params;
    const guard = await resolveMiniappRouteContext({
      request,
      unitId,
      miniappIdRaw: miniappId,
      requiredRole: "ADMIN",
    });
    if ("error" in guard) return guard.error;

    const card = await prisma.destinationReviewPacket.findFirst({
      where: {
        id: cardId,
        companyId: guard.context.unitId,
        destinationInstance: {
          destinationKey: guard.context.miniappId,
        },
      },
      select: { id: true },
    });
    if (!card) {
      return NextResponse.json({ error: "Card not found for this miniapp." }, { status: 404 });
    }

    await assertUnitPermission({
      companyId: guard.context.unitId,
      actorId: guard.context.membership.id,
      actorEmail: guard.context.sessionEmail,
      role: guard.context.membership.role,
      permission: "miniapp.card.approve",
      targetType: "miniappcard",
      targetId: cardId,
      reason: "Miniapp card approval via canonical units API.",
      payload: {
        miniappId: guard.context.miniappId,
      },
    });

    const bodyRaw = await request.json().catch(() => null);
    if (bodyRaw !== null && (typeof bodyRaw !== "object" || Array.isArray(bodyRaw))) {
      return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
    }
    const body = (bodyRaw ?? {}) as Record<string, unknown>;
    const decision = await submitDestinationReviewDecision({
      companyId: guard.context.unitId,
      reviewPacketId: cardId,
      bridgeVersion:
        typeof body.bridgeVersion === "string" && body.bridgeVersion.trim()
          ? body.bridgeVersion.trim()
          : "miniapp-approve@v1",
      decision: "APPROVE",
      decisionReasonCode:
        typeof body.decisionReasonCode === "string" && body.decisionReasonCode.trim()
          ? body.decisionReasonCode.trim()
          : "approved_by_operator",
      decisionNotes: typeof body.decisionNotes === "string" ? body.decisionNotes : undefined,
      requestedAction: typeof body.requestedAction === "string" ? body.requestedAction : undefined,
      correctedDraftPayload: asRecord(body.correctedDraftPayload),
      correctedFactsJson: asRecord(body.correctedFactsJson),
      reviewedBy: guard.context.sessionEmail,
      reviewedAt: typeof body.reviewedAt === "string" ? body.reviewedAt : undefined,
      metadata: asRecord(body.metadata),
    });

    if (!decision) {
      return NextResponse.json({ error: "Review card not found" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      unitId: guard.context.unitId,
      miniappId: guard.context.miniappId,
      decision,
    });
  } catch (error) {
    const statusCode = (error as Error & { statusCode?: number })?.statusCode;
    if (statusCode === 403) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Forbidden" }, { status: 403 });
    }
    console.error("[API:Units:Miniapp:Cards:Approve] failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
