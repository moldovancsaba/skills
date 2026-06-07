const { getLocalAuditPrisma } = require("./local-audit-db");

const LOCAL_AUDIT_UNSUPPORTED_PATTERN = /Transactions are not supported by this deployment|Transaction failed/i;

function normalizeTeachingWeight(weight) {
  const numeric = Number.isFinite(weight) ? Number(weight) : 30;
  return Math.max(30, Math.min(100, Math.round(numeric)));
}

function isWriteUnsupported(error) {
  return LOCAL_AUDIT_UNSUPPORTED_PATTERN.test(error?.message || "");
}

function warnFallbackOnce(message) {
  if (global.__checklistAuditFallbackWarningIssued) {
    return;
  }

  global.__checklistAuditFallbackWarningIssued = true;
  console.warn(message);
}

async function writeAuditRecord(primaryPrisma, modelName, data) {
  const localAuditPrisma = getLocalAuditPrisma();
  if (localAuditPrisma) {
    try {
      await localAuditPrisma[modelName].create({ data });
      return;
    } catch (error) {
      if (!isWriteUnsupported(error) || !primaryPrisma?.[modelName]) {
        throw error;
      }

      warnFallbackOnce(
        "[AUDIT] Local audit datasource does not support required writes; falling back to primary Prisma client for audit persistence.",
      );
    }
  }

  if (!primaryPrisma?.[modelName]) {
    return;
  }

  await primaryPrisma[modelName].create({ data });
}

async function recordDecisionEvent(prisma, input) {
  try {
    await writeAuditRecord(
      prisma,
      "decisionEvent",
      {
        companyId: input.companyId,
        decisionMaker: input.decisionMaker,
        decisionType: input.decisionType,
        entityType: input.entityType || undefined,
        entityId: input.entityId || undefined,
        sourceEntityIds: input.sourceEntityIds || [],
        beforeState: input.beforeState || undefined,
        afterState: input.afterState || undefined,
        payload: input.payload || undefined,
        rationale: input.rationale || undefined,
        alternatives: input.alternatives || undefined,
        teachingWeight: normalizeTeachingWeight(input.teachingWeight),
        cycleRunId: input.cycleRunId || undefined,
      },
    );
  } catch (error) {
    console.error("[AUDIT] Worker failed to record decision event:", error.message);
  }
}

async function recordGenerationEvent(prisma, input) {
  try {
    await writeAuditRecord(
      prisma,
      "generationEvent",
      {
        companyId: input.companyId,
        entityType: input.entityType,
        entityId: input.entityId || undefined,
        sourceEntityIds: input.sourceEntityIds || [],
        promptName: input.promptName || undefined,
        promptVersion: input.promptVersion || undefined,
        promptHash: input.promptHash || undefined,
        modelName: input.modelName || undefined,
        modelVersion: input.modelVersion || undefined,
        temperature: input.temperature ?? undefined,
        inputSummary: input.inputSummary || undefined,
        generatedTitle: input.generatedTitle || undefined,
        generatedBody: input.generatedBody || undefined,
        variantIndex: input.variantIndex ?? undefined,
        selected: input.selected ?? false,
        payload: input.payload || undefined,
        teachingWeight: normalizeTeachingWeight(input.teachingWeight),
        cycleRunId: input.cycleRunId || undefined,
      },
    );
  } catch (error) {
    console.error("[AUDIT] Worker failed to record generation event:", error.message);
  }
}

async function recordOutcomeEvent(prisma, input) {
  try {
    await writeAuditRecord(
      prisma,
      "outcomeEvent",
      {
        companyId: input.companyId,
        actorType: input.actorType,
        actorId: input.actorId || undefined,
        actorEmail: input.actorEmail || undefined,
        entityType: input.entityType,
        entityId: input.entityId,
        outcomeType: input.outcomeType,
        outcomeValue: input.outcomeValue || undefined,
        annotation: input.annotation || undefined,
        beforeState: input.beforeState || undefined,
        afterState: input.afterState || undefined,
        linkedDecisionId: input.linkedDecisionId || undefined,
        linkedInteractionId: input.linkedInteractionId || undefined,
        payload: input.payload || undefined,
        teachingWeight: normalizeTeachingWeight(input.teachingWeight),
        cycleRunId: input.cycleRunId || undefined,
      },
    );
  } catch (error) {
    console.error("[AUDIT] Worker failed to record outcome event:", error.message);
  }
}

module.exports = {
  recordDecisionEvent,
  recordGenerationEvent,
  recordOutcomeEvent,
};
