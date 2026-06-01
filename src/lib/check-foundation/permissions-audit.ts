import type { NextRequest } from "next/server";
import type { Role } from "@/lib/permissions";
import { recordOutcomeEvent } from "@/lib/audit-ledger";

export type UnitPermission =
  | "unit.block.enable"
  | "unit.block.disable"
  | "card.create"
  | "card.update"
  | "local.job.retry"
  | "miniapp.packet.approve"
  | "miniapp.packet.publish"
  | "miniapp.publish.rollback";

export type UnitAuditTargetType = "unit" | "block" | "module" | "card" | "local_job" | "miniapp_packet";

type PermissionCheckContext = {
  companyId: string;
  actorId?: string | null;
  actorEmail?: string | null;
  role: Role;
  permission: UnitPermission;
  targetType: UnitAuditTargetType;
  targetId: string;
  reason?: string | null;
  payload?: Record<string, unknown> | null;
};

const ROLE_PERMISSION_MATRIX: Record<Role, UnitPermission[]> = {
  SUPERADMIN: [
    "unit.block.enable",
    "unit.block.disable",
    "card.create",
    "card.update",
    "local.job.retry",
    "miniapp.packet.approve",
    "miniapp.packet.publish",
    "miniapp.publish.rollback",
  ],
  OWNER: [
    "unit.block.enable",
    "unit.block.disable",
    "card.create",
    "card.update",
    "local.job.retry",
    "miniapp.packet.approve",
    "miniapp.packet.publish",
    "miniapp.publish.rollback",
  ],
  ADMIN: [
    "card.create",
    "card.update",
    "local.job.retry",
    "miniapp.packet.approve",
    "miniapp.packet.publish",
  ],
  MEMBER: [
    "card.create",
  ],
};

export function hasUnitPermission(role: Role, permission: UnitPermission): boolean {
  return ROLE_PERMISSION_MATRIX[role]?.includes(permission) ?? false;
}

export async function recordUnitPermissionOutcome(input: PermissionCheckContext & {
  result: "allowed" | "denied" | "succeeded" | "failed";
}) {
  await recordOutcomeEvent({
    companyId: input.companyId,
    actorType: "HUMAN",
    actorId: input.actorId ?? null,
    actorEmail: input.actorEmail ?? null,
    entityType: input.targetType.toUpperCase(),
    entityId: input.targetId,
    outcomeType: "UNIT_PERMISSION_CHECK",
    outcomeValue: `${input.permission}:${input.result}`,
    annotation: input.reason ?? undefined,
    payload: {
      role: input.role,
      permission: input.permission,
      result: input.result,
      targetType: input.targetType,
      targetId: input.targetId,
      ...(input.payload ?? {}),
    },
    teachingWeight: 70,
  });
}

export async function assertUnitPermission(input: PermissionCheckContext) {
  const allowed = hasUnitPermission(input.role, input.permission);
  await recordUnitPermissionOutcome({
    ...input,
    result: allowed ? "allowed" : "denied",
    reason: allowed
      ? input.reason
      : `Role ${input.role} is not allowed to perform ${input.permission}.`,
  });

  if (!allowed) {
    const error = new Error(`Forbidden: ${input.permission} permission required`);
    (error as Error & { statusCode?: number }).statusCode = 403;
    throw error;
  }
}

export async function guardedUnitMutation<T>(input: PermissionCheckContext & {
  request?: NextRequest;
  action: () => Promise<T>;
}) {
  await assertUnitPermission(input);

  try {
    const result = await input.action();
    await recordUnitPermissionOutcome({
      ...input,
      result: "succeeded",
    });
    return result;
  } catch (error) {
    await recordUnitPermissionOutcome({
      ...input,
      result: "failed",
      reason: error instanceof Error ? error.message : "Unknown mutation failure",
    });
    throw error;
  }
}
