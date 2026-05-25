/**
 * TRINITY MEMORY ENGINE
 * M4.1 — Structured Feedback Memory with Scoped Lessons
 *
 * Implements the Memory Layer from Trinity formal production definition §22.
 *
 * Memory is now structured, scoped, and consumable by all pipeline stages.
 *
 * Lesson scopes:
 *   GLOBAL      — applies to all generation for this company
 *   TOPIC       — applies to generation for a specific topic
 *   ITEM_FAMILY — applies to candidates in the same versionFamilyId cluster
 *
 * Lesson types:
 *   HARD_CONSTRAINT  — must NOT appear again
 *   SOFT_PREFERENCE  — should prefer
 *   ANTI_PATTERN     — avoid this pattern
 *   DUPLICATE_HINT   — specific near-duplicate to suppress
 *   SUCCESS_PATTERN  — emulate this pattern (from ACCEPT/DELIVER)
 *
 * All five feedback event types produce structured lessons:
 *   DECLINE        → HARD_CONSTRAINT or ANTI_PATTERN
 *   ACCEPT         → SOFT_PREFERENCE or SUCCESS_PATTERN
 *   DELIVER        → SUCCESS_PATTERN (high weight)
 *   MODIFY_ACCEPT  → corrective lesson (SOFT_PREFERENCE + correction detail)
 *   COMMENT        → contextual SOFT_PREFERENCE
 */

const { truncate } = require("./shared");

const MEMORY_SETTING_PREFIX = "memory:";
const MAX_PERSISTED_GUIDELINES = 50;

// Legacy helpers kept for backward compatibility with existing callers

async function loadPersistedMemory(prisma, companyId) {
  const key = `${MEMORY_SETTING_PREFIX}${companyId}`;
  try {
    const setting = await prisma.globalSetting.findUnique({ where: { key } });
    if (setting?.value?.guidelines && Array.isArray(setting.value.guidelines)) {
      return setting.value.guidelines;
    }
  } catch (e) {}
  return [];
}

async function savePersistedMemory(prisma, companyId, guidelines) {
  const key = `${MEMORY_SETTING_PREFIX}${companyId}`;
  const deduped = [...new Set(guidelines)].slice(0, MAX_PERSISTED_GUIDELINES);
  try {
    await prisma.globalSetting.upsert({
      where: { key },
      create: { key, value: { guidelines: deduped, updatedAt: new Date().toISOString() } },
      update: { value: { guidelines: deduped, updatedAt: new Date().toISOString() }, updatedAt: new Date() }
    });
  } catch (e) {
    console.warn(`[MEMORY] Failed to persist memory for ${companyId}: ${e.message}`);
  }
}

function buildLegacyMemoryPrompt(guidelines) {
  if (!Array.isArray(guidelines) || guidelines.length === 0) {
    return "";
  }

  return [
    "### MEMORY GUIDELINES",
    ...guidelines.slice(0, MAX_PERSISTED_GUIDELINES).map((guideline) => `- ${guideline}`),
  ].join("\n");
}

// Lesson distillation converts feedback events into memory entries

/**
 * Maps a feedback action + decline class → lesson type
 */
function classifyLesson(action, declineClass) {
  if (action === "DELIVER") return "SUCCESS_PATTERN";
  if (action === "ACCEPT")  return "SUCCESS_PATTERN";
  if (action === "MODIFY_ACCEPT") return "SOFT_PREFERENCE";
  if (action === "COMMENT") return "SOFT_PREFERENCE";
  if (action !== "DECLINE") return null;

  const hardClasses = ["WRONG", "IRRELEVANT", "IGNORANT_OUTPUT", "ALREADY_DONE"];
  const antiPatterns = ["NOT_ACTIONABLE", "TOO_VAGUE", "MISSING_CONTEXT"];
  const duplicateHints = ["DUPLICATE"];

  if (hardClasses.includes(declineClass)) return "HARD_CONSTRAINT";
  if (antiPatterns.includes(declineClass)) return "ANTI_PATTERN";
  if (duplicateHints.includes(declineClass)) return "DUPLICATE_HINT";
  return "SOFT_PREFERENCE"; // BAD_TIMING, LOW_PRIORITY
}

/**
 * Builds a human-readable lesson string from a feedback event.
 */
function buildLessonContent(action, declineClass, item, annotation) {
  const title = item?.title || "(unknown)";

  if (action === "DELIVER") {
    return `DELIVER SUCCESS: "${title}" was executed in reality. ${annotation ? `Comment: "${annotation}"` : ""}`.trim();
  }
  if (action === "ACCEPT") {
    return `ACCEPTED: "${title}" — generate more candidates like this.`;
  }
  if (action === "MODIFY_ACCEPT") {
    return `USER MODIFIED & ACCEPTED: "${title}" ${annotation ? `— correction: "${annotation}"` : ""}`.trim();
  }
  if (action === "COMMENT") {
    return `USER COMMENT on "${title}": "${annotation}"`;
  }
  if (action === "DECLINE" && declineClass) {
    return `DECLINED(${declineClass}): "${title}" — ${annotation || "No comment provided."}`;
  }
  return `FEEDBACK(${action}): "${title}"`;
}

/**
 * Determines the scope of a lesson.
 */
function determineScope(item, declineClass) {
  // ITEM_FAMILY scope if item has a versionFamilyId
  if (item?.versionFamilyId) return { scope: "ITEM_FAMILY", itemFamilyId: item.versionFamilyId };
  // TOPIC scope if item has hashtags (first hashtag as topic hint)
  if (item?.hashtags?.length > 0) return { scope: "TOPIC", topicHint: item.hashtags[0] };
  return { scope: "GLOBAL" };
}

// processMemoryUpdates: M4.1 core function

/**
 * Processes all unprocessed feedback events and distills them into structured
 * MemoryEntry records, consumable by Generator, Refiner, Evaluator, and Frontier.
 *
 * @param {PrismaClient} prisma
 * @param {object} company
 * @returns {number} count of new memory entries created
 */
async function processMemoryUpdates(prisma, company) {
  const cid = company.id;

  // Load feedback events not yet turned into memory entries
  const feedbackEvents = await prisma.feedback.findMany({
    where: {
      checklistTask: { companyId: cid },
      processedByWorkerAt: { not: null }, // Only process already-handled events
    },
    include: { checklistTask: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Avoid re-distilling already-memorized events
  const existingSourceIds = await prisma.memoryEntry.findMany({
    where: { companyId: cid, sourceEventId: { in: feedbackEvents.map(f => f.id) } },
    select: { sourceEventId: true },
  });
  const alreadyProcessed = new Set(existingSourceIds.map(e => e.sourceEventId));

  let created = 0;
  for (const f of feedbackEvents) {
    if (alreadyProcessed.has(f.id)) continue;

    const item = f.checklistTask;
    const declineClass = f.declineClass || null;
    const lessonType = classifyLesson(f.action, declineClass);
    if (!lessonType) continue;

    const lessonContent = buildLessonContent(f.action, declineClass, item, f.annotation || f.deliveryComment);
    const { scope, topicHint, itemFamilyId } = determineScope(item, declineClass);

    // Weight: DELIVER=2.0, ACCEPT=1.0, MODIFY_ACCEPT=1.2, DECLINE(hard)=1.5, DECLINE(soft)=0.8
    const weight =
      f.action === "DELIVER" ? 2.0 :
      f.action === "ACCEPT" ? 1.0 :
      f.action === "MODIFY_ACCEPT" ? 1.2 :
      lessonType === "HARD_CONSTRAINT" ? 1.5 :
      lessonType === "ANTI_PATTERN" ? 1.0 : 0.8;

    try {
      await prisma.memoryEntry.create({
        data: {
          companyId: cid,
          scope,
          lessonType,
          lessonContent,
          weight,
          topicHint: topicHint || null,
          itemFamilyId: itemFamilyId || null,
          sourceEventId: f.id,
          sourceEventType: f.action,
        },
      });
      created++;
    } catch (e) {
      console.warn(`[MEMORY] Failed to create entry for feedback ${f.id}: ${e.message}`);
    }
  }

  if (created > 0) {
    console.log(`[MEMORY] ${company.name}: Distilled ${created} new structured memory entries.`);
  }

  // Also run legacy distillation for backward compat
  await updateCompanyMemory(prisma, company);

  // M4.4: Distill #crm-context signals into strategic lessons
  await distillContextSignals(prisma, company);

  return created;
}

/**
 * M4.4: Strategic Context Distillation
 * Scans for unprocessed #crm-context sources and converts them into GLOBAL success patterns.
 */
async function distillContextSignals(prisma, company) {
  const cid = company.id;

  const sources = await prisma.source.findMany({
    where: {
      companyId: cid,
      hashtags: { has: "crm-context" },
      // Check if already distilled (we use legacyOriginKey as a marker or just search memoryEntry)
    },
    take: 20
  });

  const alreadyDistilled = await prisma.memoryEntry.findMany({
    where: { companyId: cid, lessonType: "SUCCESS_PATTERN" },
    select: { lessonContent: true }
  });
  const distilledContents = new Set(alreadyDistilled.map(e => e.lessonContent));

  for (const s of sources) {
    const lessonContent = `STRATEGIC CONTEXT: ${s.content.replace(/\n/g, " | ")}`;
    if (distilledContents.has(lessonContent)) continue;

    try {
      await prisma.memoryEntry.create({
        data: {
          companyId: cid,
          scope: "GLOBAL",
          lessonType: "SUCCESS_PATTERN",
          lessonContent,
          weight: 1.8, // High weight for CRM signals
          active: true
        }
      });
      console.log(`[MEMORY] Distilled CRM context signal: ${s.id}`);
    } catch (e) {
      console.warn(`[MEMORY] Failed to distill context signal ${s.id}: ${e.message}`);
    }
  }
}

// Stage-specific memory retrieval

/**
 * Retrieves a structured memory prompt for a specific pipeline stage.
 * Each stage gets lessons relevant to its function.
 *
 * @param {PrismaClient} prisma
 * @param {object} company
 * @param {string} stage - 'GENERATOR' | 'REFINER' | 'EVALUATOR' | 'FRONTIER'
 * @param {object} [context] - { topicHint?, itemFamilyId? }
 * @returns {string} Formatted memory prompt
 */
async function getStagedMemoryPrompt(prisma, company, stage, context = {}) {
  const cid = company.id;
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Lesson types relevant to each stage (aligned with synthesis.js STAGES)
  const stageLessonTypes = {
    WRITING:    ["HARD_CONSTRAINT", "ANTI_PATTERN", "SUCCESS_PATTERN"],
    JUDGING:    ["HARD_CONSTRAINT", "ANTI_PATTERN", "SOFT_PREFERENCE", "SUCCESS_PATTERN"],
    ACTION:     ["HARD_CONSTRAINT", "ANTI_PATTERN", "SUCCESS_PATTERN"],
    SCRUBBING:  ["HARD_CONSTRAINT", "ANTI_PATTERN"],
    GENERATOR:  ["HARD_CONSTRAINT", "ANTI_PATTERN", "SUCCESS_PATTERN"], // aliases
    REFINER:    ["DUPLICATE_HINT", "ANTI_PATTERN", "HARD_CONSTRAINT"],
    EVALUATOR:  ["HARD_CONSTRAINT", "ANTI_PATTERN", "SOFT_PREFERENCE", "SUCCESS_PATTERN"],
    FRONTIER:   ["HARD_CONSTRAINT", "SOFT_PREFERENCE", "SUCCESS_PATTERN"],
  };
  const relevantTypes = stageLessonTypes[stage] || stageLessonTypes.WRITING;

  // Build OR conditions for scope
  const scopeConditions = [
    { scope: "GLOBAL" },
  ];
  if (context.topicHint) scopeConditions.push({ scope: "TOPIC", topicHint: context.topicHint });
  if (context.itemFamilyId) scopeConditions.push({ scope: "ITEM_FAMILY", itemFamilyId: context.itemFamilyId });

  const entries = await prisma.memoryEntry.findMany({
    where: {
      companyId: cid,
      active: true,
      lessonType: { in: relevantTypes },
      OR: scopeConditions,
      createdAt: { gte: thirtyDaysAgo },
    },
    orderBy: [{ weight: "desc" }, { createdAt: "desc" }],
    take: 20,
  });

  if (entries.length === 0) {
    const guidelines = await loadPersistedMemory(prisma, cid);
    return buildLegacyMemoryPrompt(guidelines);
  }

  const hardConstraints = entries.filter(e => e.lessonType === "HARD_CONSTRAINT");
  const antiPatterns    = entries.filter(e => e.lessonType === "ANTI_PATTERN");
  const successPatterns = entries.filter(e => e.lessonType === "SUCCESS_PATTERN");
  const softPrefs       = entries.filter(e => e.lessonType === "SOFT_PREFERENCE");
  const duplicateHints  = entries.filter(e => e.lessonType === "DUPLICATE_HINT");

  const sections = [];
  if (hardConstraints.length) {
    sections.push("### HARD CONSTRAINTS (MUST NOT violate)");
    sections.push(...hardConstraints.map(e => `- ${e.lessonContent}`));
  }
  if (antiPatterns.length) {
    sections.push("### ANTI-PATTERNS (avoid)");
    sections.push(...antiPatterns.map(e => `- ${e.lessonContent}`));
  }
  if (duplicateHints.length) {
    sections.push("### KNOWN DUPLICATES (suppress)");
    sections.push(...duplicateHints.map(e => `- ${e.lessonContent}`));
  }
  if (successPatterns.length) {
    sections.push("### SUCCESS PATTERNS (emulate)");
    sections.push(...successPatterns.slice(0, 5).map(e => `- ${e.lessonContent}`));
  }
  if (softPrefs.length) {
    sections.push("### SOFT PREFERENCES");
    sections.push(...softPrefs.slice(0, 5).map(e => `- ${e.lessonContent}`));
  }

  return sections.join("\n");
}

// Legacy updateCompanyMemory kept for backward compatibility

async function updateCompanyMemory(prisma, company) {
  const cid = company.id;
  const guidelines = [];

  const { getWorkerConfig } = require("./shared");
  const corrections = await prisma.flashcardCorrection.findMany({
    where: { companyId: cid },
    orderBy: { createdAt: "desc" }
  });

  const now = new Date();
  const halfLife = await getWorkerConfig(prisma, company, "memory_half_life_days", 30);
  const lambda = Math.log(2) / halfLife;

  corrections.forEach(c => {
    const ageDays = (now - new Date(c.createdAt)) / (1000 * 60 * 60 * 24);
    if (ageDays > halfLife * 3) return;
    const decay = Math.exp(-lambda * ageDays);
    const weight = (1.0 * decay).toFixed(2);
    const scope = c.flashcardId ? `[SCOPE:CARD:${c.flashcardId}]` : "[SCOPE:GLOBAL]";
    if (c.originalValue && c.correctedValue) {
      guidelines.push(`${scope} [CORR:${c.id}] USER CORRECTION (Weight ${weight}): Change "${c.originalValue}" to "${c.correctedValue}"`);
    } else if (c.note) {
      guidelines.push(`${scope} [CORR:${c.id}] USER CORRECTION NOTE (Weight ${weight}): "${c.note}"`);
    }
  });

  if (guidelines.length > 0) {
    await savePersistedMemory(prisma, cid, guidelines);
    console.log(`[MEMORY] ${company.name}: Distilled ${guidelines.length} legacy signals.`);
  }
}

// Legacy getHumanMemoryPrompt calls getStagedMemoryPrompt for backward compatibility

async function getHumanMemoryPrompt(prisma, company) {
  return getStagedMemoryPrompt(prisma, company, "GENERATOR");
}

module.exports = {
  // M4.1: Structured memory
  processMemoryUpdates,
  getStagedMemoryPrompt,
  // Legacy (backward compat)
  getHumanMemoryPrompt,
  updateCompanyMemory,
  loadPersistedMemory,
  savePersistedMemory,
};
