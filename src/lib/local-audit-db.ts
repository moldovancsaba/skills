import { Prisma, PrismaClient } from "@prisma/client";

const DEFAULT_LOCAL_AUDIT_DATABASE_URL = "mongodb://127.0.0.1:27017/checklist_local?replicaSet=rs0";

declare global {
  var __checklistLocalAuditPrisma: PrismaClient | undefined;
  var __checklistLocalAuditWarningIssued: boolean | undefined;
}

function resolveLocalAuditDatasourceUrl() {
  const explicitUrl = process.env.LOCAL_DATABASE_URL?.trim();
  if (explicitUrl) {
    return explicitUrl;
  }

  if (process.env.NODE_ENV === "production") {
    return null;
  }

  return DEFAULT_LOCAL_AUDIT_DATABASE_URL;
}

function warnLocalAuditUnavailable(message: string) {
  if (globalThis.__checklistLocalAuditWarningIssued) {
    return;
  }

  globalThis.__checklistLocalAuditWarningIssued = true;
  console.warn(message);
}

export const localAuditDatasourceUrl = resolveLocalAuditDatasourceUrl();

export function getLocalAuditPrisma() {
  if (!localAuditDatasourceUrl) {
    warnLocalAuditUnavailable(
      "[AUDIT] LOCAL_DATABASE_URL is not configured. Audit/event persistence is disabled rather than falling back to Atlas.",
    );
    return null;
  }

  if (!globalThis.__checklistLocalAuditPrisma) {
    globalThis.__checklistLocalAuditPrisma = new PrismaClient({
      datasourceUrl: localAuditDatasourceUrl,
    });
  }

  return globalThis.__checklistLocalAuditPrisma;
}

export async function countLocalOutcomeEvents(args: Prisma.OutcomeEventCountArgs) {
  const prisma = getLocalAuditPrisma();
  if (!prisma) {
    return 0;
  }

  try {
    return await prisma.outcomeEvent.count(args);
  } catch (error) {
    console.error("[AUDIT] Failed to count local outcome events:", error);
    return 0;
  }
}

export async function findLocalOutcomeEvents(args: Prisma.OutcomeEventFindManyArgs) {
  const prisma = getLocalAuditPrisma();
  if (!prisma) {
    return [];
  }

  try {
    return await prisma.outcomeEvent.findMany(args);
  } catch (error) {
    console.error("[AUDIT] Failed to read local outcome events:", error);
    return [];
  }
}
