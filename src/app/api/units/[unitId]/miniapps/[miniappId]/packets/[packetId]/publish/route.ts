import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { publishDestinationReviewPacket } from "@/lib/destination-publish-bridge";
import { assertUnitPermission } from "@/lib/check-foundation/permissions-audit";
import { resolveMiniappRouteContext } from "@/lib/check-foundation/miniapp-route-guard";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ unitId: string; miniappId: string; packetId: string }> },
) {
  try {
    const { unitId, miniappId, packetId } = await params;
    const guard = await resolveMiniappRouteContext({
      request,
      unitId,
      miniappIdRaw: miniappId,
      requiredRole: "ADMIN",
    });
    if ("error" in guard) return guard.error;

    const packet = await prisma.destinationReviewPacket.findFirst({
      where: {
        id: packetId,
        companyId: guard.context.unitId,
        destinationInstance: {
          destinationKey: guard.context.miniappId,
        },
      },
      select: { id: true },
    });
    if (!packet) {
      return NextResponse.json({ error: "Packet not found for this miniapp." }, { status: 404 });
    }

    await assertUnitPermission({
      companyId: guard.context.unitId,
      actorId: guard.context.membership.id,
      actorEmail: guard.context.sessionEmail,
      role: guard.context.membership.role,
      permission: "miniapp.packet.publish",
      targetType: "miniapp_packet",
      targetId: packetId,
      reason: "Miniapp packet publish via canonical units API.",
      payload: {
        miniappId: guard.context.miniappId,
      },
    });

    const result = await publishDestinationReviewPacket({
      companyId: guard.context.unitId,
      reviewPacketId: packetId,
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
    console.error("[API:Units:Miniapp:Packets:Publish] failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
