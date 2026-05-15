const { recordPlannerTelemetry } = require("./telemetry");

const FEEDBACK_PRESSURE_KEY = "planner_feedback_pressure_index";
const NEGATIVE_BLOCK_THRESHOLD = -3;
const POSITIVE_PRIORITY_THRESHOLD = 2.5;
const FAMILY_BLOCK_DAYS = 14;

function normalizeIndex(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isBlocked(entry) {
  const until = toDate(entry?.blockedUntil);
  return Boolean(until && until.getTime() > Date.now());
}

function buildTaskFamilyKeys(task = {}) {
  const keys = [];
  if (task.duplicateClusterId) keys.push(`task-duplicate:${task.duplicateClusterId}`);
  if (task.versionFamilyId) keys.push(`task-version:${task.versionFamilyId}`);
  const flashcardIds = Array.isArray(task.sourceFlashcardIds) ? [...new Set(task.sourceFlashcardIds)].sort() : [];
  if (flashcardIds.length > 0) {
    keys.push(`task-sources:${flashcardIds.join(",")}`);
    for (const flashcardId of flashcardIds) {
      keys.push(`flashcard:${flashcardId}`);
    }
  }
  keys.push(`task:${task.id}`);
  return [...new Set(keys)];
}

function deriveFeedbackPressureDelta(feedbackRecord = {}) {
  if (feedbackRecord.action === "DELIVER") return 3;
  if (feedbackRecord.action === "MODIFY_ACCEPT") return 1.5;
  if (feedbackRecord.action === "ACCEPT") return 1;
  if (feedbackRecord.action === "DECLINE") {
    const declineClass = String(feedbackRecord.declineClass || "WRONG").toUpperCase();
    if (declineClass === "DUPLICATE") return -2;
    if (declineClass === "LOW_PRIORITY" || declineClass === "BAD_TIMING") return -0.75;
    if (declineClass === "TOO_VAGUE" || declineClass === "MISSING_CONTEXT" || declineClass === "NOT_ACTIONABLE") return -1.5;
    return -2.25;
  }
  return 0;
}

function deriveFeedbackPressureReason(feedbackRecord = {}) {
  if (feedbackRecord.action === "DECLINE") {
    return `Feedback decline (${String(feedbackRecord.declineClass || "WRONG").toUpperCase()}) adjusted family pressure.`;
  }
  if (feedbackRecord.action === "DELIVER") {
    return "Delivery feedback strongly increased family pressure.";
  }
  if (feedbackRecord.action === "MODIFY_ACCEPT") {
    return "Manual modify-accept feedback increased family pressure and edit demand.";
  }
  return "Positive acceptance feedback increased family pressure.";
}

async function readFeedbackPressureIndex(prisma) {
  const existing = await prisma.globalSetting.findUnique({ where: { key: FEEDBACK_PRESSURE_KEY } });
  return normalizeIndex(existing?.value);
}

async function writeFeedbackPressureIndex(prisma, index) {
  await prisma.globalSetting.upsert({
    where: { key: FEEDBACK_PRESSURE_KEY },
    create: { key: FEEDBACK_PRESSURE_KEY, value: index },
    update: { value: index },
  });
}

function mergePressureEntry(existing = {}, delta, feedbackRecord = {}) {
  const score = Number(existing.score || 0) + Number(delta || 0);
  const positiveCount = Number(existing.positiveCount || 0) + (delta > 0 ? 1 : 0);
  const negativeCount = Number(existing.negativeCount || 0) + (delta < 0 ? 1 : 0);
  const manualEditCount = Number(existing.manualEditCount || 0) + (
    feedbackRecord.action === "MODIFY_ACCEPT" && (feedbackRecord.modifiedTitle || feedbackRecord.modifiedDescription) ? 1 : 0
  );
  const blockedUntil = score <= NEGATIVE_BLOCK_THRESHOLD
    ? new Date(Date.now() + FAMILY_BLOCK_DAYS * 24 * 60 * 60 * 1000).toISOString()
    : existing.blockedUntil && isBlocked(existing)
      ? existing.blockedUntil
      : null;

  return {
    score: Number(score.toFixed(2)),
    positiveCount,
    negativeCount,
    manualEditCount,
    lastAction: String(feedbackRecord.action || "UNKNOWN"),
    lastDeclineClass: feedbackRecord.declineClass ? String(feedbackRecord.declineClass) : null,
    lastUpdatedAt: new Date().toISOString(),
    blockedUntil,
  };
}

async function applyFeedbackPressure(prisma, companyId, feedbackRecord, task) {
  const familyKeys = buildTaskFamilyKeys(task);
  const delta = deriveFeedbackPressureDelta(feedbackRecord);
  if (!familyKeys.length || delta === 0) {
    return {
      familyKeys,
      delta,
      blockedFamilyKeys: [],
      boostedFamilyKeys: [],
    };
  }

  const index = await readFeedbackPressureIndex(prisma);
  const nextIndex = { ...index };
  const blockedFamilyKeys = [];
  const boostedFamilyKeys = [];

  for (const key of familyKeys) {
    const existing = normalizeIndex(nextIndex[key]);
    const nextEntry = mergePressureEntry(existing, delta, feedbackRecord);
    nextEntry.companyId = companyId;
    nextEntry.familyKey = key;
    nextIndex[key] = nextEntry;
    if (isBlocked(nextEntry)) blockedFamilyKeys.push(key);
    if (Number(nextEntry.score || 0) >= POSITIVE_PRIORITY_THRESHOLD) boostedFamilyKeys.push(key);
  }

  await writeFeedbackPressureIndex(prisma, nextIndex);
  await recordPlannerTelemetry(prisma, {
    companyId,
    entityType: "TASK",
    entityId: task.id,
    eventType: blockedFamilyKeys.length > 0 ? "FEEDBACK_PRESSURE_BLOCK" : "FEEDBACK_PRESSURE_UPDATE",
    reason: deriveFeedbackPressureReason(feedbackRecord),
    details: {
      familyKeys,
      delta,
      blockedFamilyKeys,
      boostedFamilyKeys,
    },
  });

  return {
    familyKeys,
    delta,
    blockedFamilyKeys,
    boostedFamilyKeys,
  };
}

function getPressureForFamilyKeys(index, familyKeys = []) {
  return familyKeys.reduce((best, key) => {
    const entry = normalizeIndex(index?.[key]);
    return Number(entry.score || 0) > best ? Number(entry.score || 0) : best;
  }, 0);
}

function isAnyFamilyBlocked(index, familyKeys = []) {
  return familyKeys.some((key) => isBlocked(index?.[key]));
}

function countCompanyBlockedFamilies(index, companyId) {
  return Object.values(normalizeIndex(index))
    .filter((entry) => entry?.companyId === companyId)
    .filter((entry) => isBlocked(entry))
    .length;
}

module.exports = {
  FEEDBACK_PRESSURE_KEY,
  NEGATIVE_BLOCK_THRESHOLD,
  POSITIVE_PRIORITY_THRESHOLD,
  FAMILY_BLOCK_DAYS,
  buildTaskFamilyKeys,
  deriveFeedbackPressureDelta,
  readFeedbackPressureIndex,
  writeFeedbackPressureIndex,
  applyFeedbackPressure,
  getPressureForFamilyKeys,
  isAnyFamilyBlocked,
  countCompanyBlockedFamilies,
};
