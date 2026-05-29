const { PrismaClient } = require("@prisma/client");

const DEFAULT_LOCAL_AUDIT_DATABASE_URL = "mongodb://127.0.0.1:27017/checklist_local?replicaSet=rs0";

function resolveLocalAuditDatasourceUrl() {
  const explicitUrl = typeof process.env.LOCAL_DATABASE_URL === "string" ? process.env.LOCAL_DATABASE_URL.trim() : "";
  if (explicitUrl) {
    return explicitUrl;
  }

  if (process.env.NODE_ENV === "production") {
    return null;
  }

  return DEFAULT_LOCAL_AUDIT_DATABASE_URL;
}

function warnLocalAuditUnavailable(message) {
  if (global.__checklistLocalAuditWarningIssued) {
    return;
  }

  global.__checklistLocalAuditWarningIssued = true;
  console.warn(message);
}

const localAuditDatasourceUrl = resolveLocalAuditDatasourceUrl();

function getLocalAuditPrisma() {
  if (!localAuditDatasourceUrl) {
    warnLocalAuditUnavailable(
      "[AUDIT] LOCAL_DATABASE_URL is not configured. Audit/event persistence is disabled rather than falling back to Atlas.",
    );
    return null;
  }

  if (!global.__checklistLocalAuditPrisma) {
    global.__checklistLocalAuditPrisma = new PrismaClient({
      datasourceUrl: localAuditDatasourceUrl,
    });
  }

  return global.__checklistLocalAuditPrisma;
}

async function countOutcomeEvents(args) {
  const prisma = getLocalAuditPrisma();
  if (!prisma) {
    return 0;
  }

  try {
    return await prisma.outcomeEvent.count(args);
  } catch (error) {
    console.error("[AUDIT] Worker failed to count local outcome events:", error.message);
    return 0;
  }
}

async function findOutcomeEvents(args) {
  const prisma = getLocalAuditPrisma();
  if (!prisma) {
    return [];
  }

  try {
    return await prisma.outcomeEvent.findMany(args);
  } catch (error) {
    console.error("[AUDIT] Worker failed to read local outcome events:", error.message);
    return [];
  }
}

module.exports = {
  localAuditDatasourceUrl,
  getLocalAuditPrisma,
  countOutcomeEvents,
  findOutcomeEvents,
};
