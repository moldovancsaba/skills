import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership, type Role } from "@/lib/permissions";
import { resolveEffectiveUnitCapabilities } from "@/lib/check-foundation/capabilities-v3";
import { assertKnownMiniappId, type MiniappId } from "@/lib/check-foundation/miniapp-registry";

export type MiniappRouteContext = {
  unitId: string;
  miniappId: MiniappId;
  sessionEmail: string;
  membership: {
    id: string;
    role: Role;
    email: string;
  };
};

export async function resolveMiniappRouteContext(input: {
  request: NextRequest;
  unitId: string;
  miniappIdRaw: string;
  requiredRole?: Role;
}): Promise<{ context: MiniappRouteContext } | { error: NextResponse }> {
  const unitId = String(input.unitId || "").trim();
  if (!unitId) {
    return { error: NextResponse.json({ error: "Missing unitId" }, { status: 400 }) };
  }

  let miniappId: MiniappId;
  try {
    const normalizedMiniappId = String(input.miniappIdRaw || "").trim().toLowerCase();
    assertKnownMiniappId(normalizedMiniappId);
    miniappId = normalizedMiniappId;
  } catch (error) {
    return {
      error: NextResponse.json(
        { error: error instanceof Error ? error.message : "Unknown miniapp id" },
        { status: 400 },
      ),
    };
  }

  const auth = await verifyMembership(input.request, unitId, input.requiredRole);
  if (auth.error) return { error: auth.error };

  const [company, compareInstance] = await Promise.all([
    prisma.company.findUnique({
      where: { id: unitId },
      select: {
        id: true,
        workerConfig: true,
      },
    }),
    prisma.destinationInstance.findFirst({
      where: { companyId: unitId, destinationKey: "compare", isActive: true },
      select: { id: true },
    }),
  ]);

  if (!company) {
    return { error: NextResponse.json({ error: "Unit not found" }, { status: 404 }) };
  }

  const effective = resolveEffectiveUnitCapabilities({
    workerConfig: company.workerConfig,
    hasCompareDestination: Boolean(compareInstance),
  });

  if (!effective.enabledMiniapps.includes(miniappId)) {
    return {
      error: NextResponse.json(
        { error: `Miniapp ${miniappId} is not enabled for this unit.` },
        { status: 403 },
      ),
    };
  }

  return {
    context: {
      unitId,
      miniappId,
      sessionEmail: auth.session.email,
      membership: {
        id: auth.membership.id,
        role: auth.membership.role,
        email: auth.membership.email,
      },
    },
  };
}
