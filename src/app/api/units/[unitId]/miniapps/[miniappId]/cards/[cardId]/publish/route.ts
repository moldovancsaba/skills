import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { publishDestinationReviewPacket } from "@/lib/destination-publish-bridge";
import { assertUnitPermission } from "@/lib/check-foundation/permissions-audit";
import { resolveMiniappRouteContext } from "@/lib/check-foundation/miniapp-route-guard";

export const dynamic = "force-dynamic";

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
      permission: "miniapp.card.publish",
      targetType: "miniappcard",
      targetId: cardId,
      reason: "Miniapp card publish via canonical units API.",
      payload: {
        miniappId: guard.context.miniappId,
      },
    });

    const result = await publishDestinationReviewPacket({
      companyId: guard.context.unitId,
      reviewPacketId: cardId,
      reviewedBy: guard.context.sessionEmail,
    });

    return NextResponse.json({
      ok: result.ok,
      status: result.status,
      error: result.error,
      data: result.data,
      unitId: guard.context.unitId,
      miniappId: guard.context.miniappId,
    }, { status: result.status });
  } catch (error) {
    const statusCode = (error as Error & { statusCode?: number })?.statusCode;
    if (statusCode === 403) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Forbidden" }, { status: 403 });
    }
    console.error("[API:Units:Miniapp:Cards:Publish] failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
