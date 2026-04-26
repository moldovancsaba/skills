const { truncate } = require("./shared");

/**
 * SOVEREIGN MEMORY ENGINE
 * v0.12.0-DURABLE
 * 
 * Harvests human feedback and historical outcomes into rigid strategic constraints.
 * 
 * v0.12.0 UPGRADE: Durable Memory Layer (#109)
 * ─────────────────────────────────────────────
 * Problem: Old feedback (beyond take:15) was silently dropped each cycle.
 * Solution: After every maintenance pass, all signals are distilled and persisted
 * to a GlobalSetting record keyed by `memory:${companyId}`. On the next cycle,
 * fresh signals are layered ON TOP of the persisted core — so nothing is lost.
 */

const MEMORY_SETTING_PREFIX = "memory:";
const MAX_PERSISTED_GUIDELINES = 50; // Cap the persisted set to prevent unbounded growth

/**
 * Loads the persisted memory summary for a company.
 * Returns an array of guideline strings (the accumulated canon).
 */
async function loadPersistedMemory(prisma, companyId) {
  const key = `${MEMORY_SETTING_PREFIX}${companyId}`;
  try {
    const setting = await prisma.globalSetting.findUnique({ where: { key } });
    if (setting?.value?.guidelines && Array.isArray(setting.value.guidelines)) {
      return setting.value.guidelines;
    }
  } catch (e) {
    // Silent — if GlobalSetting is unavailable, degrade gracefully
  }
  return [];
}

/**
 * Persists the distilled memory for a company to GlobalSetting.
 * Called at the end of each maintenance cycle by updateCompanyMemory().
 */
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

/**
 * Scavenges ALL available signals (no take limit) and rebuilds the persisted memory.
 * Called from runMaintenance() after each synthesis cycle.
 * This is the "distillation pass" — it processes the entire history and saves the canon.
 * 
 * @param {PrismaClient} prisma
 * @param {object} company
 */
async function updateCompanyMemory(prisma, company) {
  const cid = company.id;
  const guidelines = [];

  // 1. All DECLINE/REJECT/ANNOTATE actions with notes (no limit — full history)
  const actions = await prisma.flashcardAction.findMany({
    where: { flashcard: { companyId: cid }, action: { in: ["DECLINE", "REJECT", "ANNOTATE"] } },
    orderBy: { createdAt: "asc" }
  });
  actions.forEach(a => {
    if (a.annotation) guidelines.push(`USER REJECTED: "${a.annotation}"`);
  });

  // 2. All feedback comments (no limit)
  const feedbacks = await prisma.feedback.findMany({
    where: { nbaItem: { companyId: cid } },
    orderBy: { createdAt: "asc" }
  });
  feedbacks.forEach(f => {
    if (f.comment) guidelines.push(`USER FEEDBACK: "${f.comment}"`);
  });

  // 3. All corrections (no limit)
  const corrections = await prisma.flashcardCorrection.findMany({
    where: { companyId: cid },
    orderBy: { createdAt: "asc" }
  });
  corrections.forEach(c => {
    if (c.originalValue && c.correctedValue) {
      guidelines.push(`USER CORRECTION: Change "${c.originalValue}" to "${c.correctedValue}"`);
    } else if (c.note) {
      guidelines.push(`USER CORRECTION NOTE: "${c.note}"`);
    }
  });

  if (guidelines.length > 0) {
    await savePersistedMemory(prisma, cid, guidelines);
    console.log(`[MEMORY] ${company.name}: Distilled ${guidelines.length} signals into durable memory.`);
  }
}

/**
 * Aggregates all human feedback signals into a single memory-injected prompt.
 * 
 * Strategy:
 * 1. Load PERSISTED canon (accumulated full history, never drops off)
 * 2. Layer FRESH signals on top (most recent, may overlap — deduped)
 * 3. Inject GOLDEN EXAMPLES (positive patterns to emulate)
 * 
 * @param {PrismaClient} prisma - Database client
 * @param {object} company - Company database record
 * @returns {Promise<string>} Formatted AI memory prompt
 */
async function getHumanMemoryPrompt(prisma, company) {
  // 1. Load the persisted, accumulated memory canon
  const persistedGuidelines = await loadPersistedMemory(prisma, company.id);

  // 2. Scavenge fresh recent signals (last 15 to catch anything since last distillation)
  const freshActions = await prisma.flashcardAction.findMany({
    where: { flashcard: { companyId: company.id }, action: { in: ["DECLINE", "REJECT", "ANNOTATE"] } },
    take: 15,
    orderBy: { createdAt: "desc" }
  });
  const freshFeedbacks = await prisma.feedback.findMany({
    where: { nbaItem: { companyId: company.id } },
    take: 10,
    orderBy: { createdAt: "desc" }
  });
  const freshCorrections = await prisma.flashcardCorrection.findMany({
    where: { companyId: company.id },
    take: 10,
    orderBy: { createdAt: "desc" }
  });

  const freshGuidelines = [];
  freshActions.forEach(a => { if (a.annotation) freshGuidelines.push(`USER REJECTED: "${a.annotation}"`); });
  freshFeedbacks.forEach(f => { if (f.comment) freshGuidelines.push(`USER FEEDBACK: "${f.comment}"`); });
  freshCorrections.forEach(c => {
    if (c.originalValue && c.correctedValue) {
      freshGuidelines.push(`USER CORRECTION: Change "${c.originalValue}" to "${c.correctedValue}"`);
    }
  });

  // 3. Merge: persisted canon + fresh (deduplicated)
  const allGuidelines = [...new Set([...persistedGuidelines, ...freshGuidelines])];

  // 4. Golden Examples (most recent VERIFIED cards as positive templates)
  const acceptedFlash = await prisma.flashcard.findMany({
    where: { companyId: company.id, processingStatus: "VERIFIED" },
    take: 5,
    orderBy: { updatedAt: "desc" }
  });
  const acceptedTasks = await prisma.nBAItem.findMany({
    where: { companyId: company.id, processingStatus: "VERIFIED" },
    take: 5,
    orderBy: { updatedAt: "desc" }
  });

  if (!allGuidelines.length && !acceptedFlash.length && !acceptedTasks.length) {
    return "No prior human feedback detected. Focus on high-quality marketing extraction.";
  }

  let goldenExamples = "";
  if (acceptedFlash.length || acceptedTasks.length) {
    goldenExamples = "\n### [GOLDEN EXAMPLES / POSITIVE PATTERNS]\nThe user highly values these existing items. Follow their depth and tone:\n";
    acceptedFlash.forEach(f => goldenExamples += `- ${f.title}: ${truncate(f.body, 200)}\n`);
    acceptedTasks.forEach(t => goldenExamples += `- ${t.title}: ${truncate(t.description || "", 200)}\n`);
  }

  return [
    "### RIGID HUMAN CONSTRAINTS (MANDATORY)",
    `The following feedback from the owner is ABSOLUTE LAW. You MUST NOT violate these principles (${allGuidelines.length} total accumulated signals):`,
    ...allGuidelines.slice(0, 30).map(g => `- ${g}`),
    goldenExamples
  ].join("\n");
}

module.exports = {
  getHumanMemoryPrompt,
  updateCompanyMemory
};
