/**
 * TRINITY GENERATOR (Drafter)
 * M2.1 — Multi-Cardinality Synthesis & Recurrent Depth Transformer (RDT)
 * v1.2.0-PRODUCTION
 *
 * Implements the Generator stage from the Trinity formal production definition §8.
 * Refactored into a Multi-Phase Recurrent Agent loop inspired by the OpenMythos RDT philosophy.
 *
 * Key changes since v1.0.0:
 *   - Recurrent Synthesis: 3-phase computational loop (Prelude, Recurrence, Coda).
 *   - Input Injection (§217): Re-injects raw evidence in every loop to prevent drift.
 *   - Strategic Learning: Harvests user-defined Kanban priorities from context.js.
 *   - Cardinality Support: 1→1, 1→many, many→1, many→many.
 *   - Lineage Preservation: versionFamilyId and generatedFromIds tracking.
 */
const crypto = require("crypto");
const { callOllamaJson, callOllamaWithFailover } = require("./ai");
const { STAGE_MODELS, trinity_DRAFT_TIMEOUT_MS } = require("./core");
const { truncate, hashValue, nextPublicId, getWorkerConfig, parseBoundedInt, getStageModels } = require("./shared");
const { getCompanyStrategicContext } = require("./context");
const { unifyArray } = require("./synthesis-utils");
const { CandidateState, toGenerated } = require("./lifecycle");
const { computeInitialFreshnessScore } = require("./evidence");
const {
  calculateKnowledgeIceScore,
  groundTaskScores,
  normalizeKnowledgeScores,
  normalizeTaskScores,
} = require("../../src/lib/scoring-contract");

// --- UTILITIES ---

function joinBody(body) {
  if (typeof body === "string") return body;
  if (Array.isArray(body)) {
    return body.map(item => {
      if (typeof item === "string") return item;
      if (item.text) return `${item.key ? `**${item.key}**: ` : ""}${item.text}`;
      return JSON.stringify(item);
    }).join("\n\n");
  }
  if (typeof body === "object" && body !== null) {
    return Object.entries(body).map(([key, val]) => `**${key}**: ${val}`).join("\n\n");
  }
  return String(body);
}

// ---------------------------------------------------------------------------
// Active-inventory dedup guard
// Pre-persistence check: skip candidates with identical fingerprints to what
// already exists in the ACTIVE candidate pool. Generator is allowed to be
// prolific — but not careless (§8.6).
// ---------------------------------------------------------------------------
async function buildActiveInventoryFingerprints(prisma, companyId) {
  const active = await prisma.nBAItem.findMany({
    where: {
      companyId,
      activityState: { in: ["ACTIVE", "STALE"] },
    },
    select: { fingerprint: true, title: true },
  });
  const set = new Set();
  for (const item of active) {
    if (item.fingerprint) set.add(item.fingerprint);
    if (item.title) set.add(item.title.toLowerCase().slice(0, 80));
  }
  return set;
}

// ---------------------------------------------------------------------------
// 1. Flashcard Generator (KnowledgeItem generation from EvidenceUnit batch)
// Supports 1→many and many→1 cardinalities via evidence batch context.
// ---------------------------------------------------------------------------

/**
 * Generates one or more Flashcard DRAFTs from a batch of EvidenceUnits.
 * Writes CandidateState.GENERATED and generatedFromIds[] lineage.
 *
 * @param {PrismaClient} prisma
 * @param {object} company
 * @param {Source[]} evidenceBatch - One or more source records (supports multi-cardinality)
 * @param {string} memoryPrompt
 * @param {object|null} topic
 * @returns {object[]} Draft flashcard records ready for prisma.flashcard.create
 */
async function draftFlashcardFromDataCard(prisma, company, dataCard, memoryPrompt, topic = null) {
  // Legacy single-source call — wrap in batch
  return draftFlashcardsFromEvidenceBatch(prisma, company, [dataCard], memoryPrompt, topic);
}

async function draftFlashcardsFromEvidenceBatch(prisma, company, evidenceBatch, memoryPrompt, topic = null) {
  const bodyLimit = await getWorkerConfig(prisma, company, "draft_body_limit", 1200);
  const strategicContext = await getCompanyStrategicContext(prisma, company.id);
  const activeFingerprints = await buildActiveInventoryFingerprints(prisma, company.id);

  const { getSkillForSource } = require("./skills");
  const skill = getSkillForSource(evidenceBatch[0]);
  const skillPrompt = skill
    ? `\n### [SPECIALIZED SKILL ACTIVATED: ${skill.label}]\nYou MUST apply the following marketing framework to this synthesis:\n${skill.framework}\n`
    : "";

  // Build combined evidence context for multi-cardinality synthesis
  const evidenceContext = evidenceBatch.map((e, i) =>
    `[Evidence ${i + 1}]${e.entityTag ? ` (${e.entityTag})` : ""}: ${truncate(e.canonicalContent || e.content, 800)}`
  ).join("\n\n---\n\n");

  const isGrouped = evidenceBatch.length > 1;

  const hasCrm = evidenceBatch.some(e => e.sourceType === "CRM");
  const crmGuidance = hasCrm
    ? `\n### [CRM CONTEXT HARVESTING ACTIVATED]\nYou are processing high-fidelity CRM data. You MUST look for customer-specific pain points, product adoption signals, or competitor mentions in the data blobs. Be extremely specific with customer entity names and proprietary product IDs if they are present.`
    : "";

  const systemPromptBase = [
    "You are the checklist GENERATOR (formerly Drafter). Your goal is to extract intelligence from evidence into structured cards.",
    "Your synthesis MUST align with the following strategic context of the company:",
    strategicContext,
    topic ? `\n### [PRIMARY STRATEGIC GOAL: ${topic.label}]\nYou MUST prioritize insights that relate to: ${topic.notes || topic.label}\n` : "",
    skillPrompt,
    crmGuidance,
    isGrouped
      ? `\nYou are processing ${evidenceBatch.length} RELATED evidence units simultaneously. Look for CROSS-EVIDENCE insights. You MUST emit at least one cross-evidence candidate if one exists.`
      : "\nYou are processing one evidence unit. Extract all distinct insights.",
    "### [CATALOGING AXIOM]",
    "You MUST classify every insight into one of these categories based on the content's nature relative to the company identity:",
    "  - 'FLASHCARD': Fact, capability, current state, or research finding (What the company IS or DOES).",
    "  - 'GOALCARD': Strategic objective, milestone, or aspirational state (What the company WANTS TO BECOME/ACHIEVE).",
    "  - 'TASKCARD': Specific actionable directive or execution step (What the company MUST DO).",
    "Example: For a tech company, 'Achieve Social Media Dominance' is a GOALCARD. For a marketing agency, it is a FLASHCARD (Capability).",
    "\nRequired fields per item: title, body, category, kind, confidence, impact, weight, semanticTags (array of 3-5 lowercase hashtag strings).",
    "AXIOM: Strict integer scores for confidence, impact, weight. Scale: 1-10. NO zeros. NO percentages.",
    "COVERAGE OVER POLISH: Prefer extracting more distinct insights over perfecting fewer.",
    "Required field [intelligenceType]: Categorize as 'INTERNAL' if the insight is about the company's own operations/performance, or 'COMPETITOR' if it is about market competitors or industry benchmarks.",
    "Format: Return a JSON array of objects.",
    "APERTUS Purity: Each card must be 100% monolingual in an allowed language.",
    memoryPrompt
  ].join("\n");

  const modelList = await getStageModels(prisma, "DRAFT", company);
  const maxLoops = await getWorkerConfig(prisma, company, "recurrent_draft_loops", 2);
  let currentDraftsRaw = null;
  let finalDraftsArray = [];

  // --- RECURRENT SYNTHESIS LOOP (Mythos RDT Logic §315) ---
  // We simulate "Recurrent Depth" by iterating the model over its own latent 
  // draft. This allows for deeper reasoning while remaining grounded via 
  // continuous input injection.
  for (let loop = 0; loop < maxLoops; loop++) {
    const isFirstLoop = loop === 0;
    
    // Loop-Index Prompting (§315)
    let loopGuidance = "";
    if (loop === 0) loopGuidance = "\n### [PHASE 1: PRELUDE - INITIAL EXTRACTION]\nFocus on high-recall extraction of all distinct intelligence points from the evidence.";
    if (loop === 1) loopGuidance = "\n### [PHASE 2: RECURRENCE - STRATEGIC DEPTH]\nReview your previous draft. Deepen the reasoning. Are there strategic implications for marketing or sales that you missed? Refine the 'body' and 'impact' fields.";
    if (loop === 2) loopGuidance = "\n### [PHASE 3: CODA - COHERENCE & PRUNING]\nFinal polish. Ensure each KnowledgeItem is distinct, actionable, and 100% aligned with the company strategy. Merge duplicates.";

    const loopSystemPrompt = systemPromptBase + loopGuidance;

    // Input Injection (§217): We ALWAYS re-inject the raw evidence to prevent drift
    let loopUserPrompt = `Company: ${company.name}\n\n[INPUT INJECTION: RAW EVIDENCE]\n${evidenceContext}`;
    
    if (!isFirstLoop && currentDraftsRaw) {
      loopUserPrompt += `\n\n[CURRENT STATE: PREVIOUS DRAFT]\n${JSON.stringify(currentDraftsRaw, null, 2)}\n\n[TASK] Improve and refine the previous draft based on the Phase Guidance above. Return the FULL updated JSON array.`;
    }

    const raw = await callOllamaWithFailover(loopSystemPrompt, loopUserPrompt, modelList, { timeoutMs: trinity_DRAFT_TIMEOUT_MS });
    const loopArray = unifyArray(raw);

    if (Array.isArray(loopArray) && loopArray.length > 0) {
      currentDraftsRaw = loopArray;
      finalDraftsArray = loopArray;
    } else if (isFirstLoop) {
      // If the first loop fails to yield anything, we stop early
      return [];
    }
    // Halting Condition: If we got nothing new in a refinement loop, we can keep the previous best
  }

  const drafts = [];
  const evidenceIds = evidenceBatch.map(e => e.id);
  const versionFamilyId = crypto.randomUUID(); // shared across multi-output batch

  for (const item of finalDraftsArray) {
    if (!item.title || !item.body) continue;

    // Pre-persistence dedup against active inventory
    const titleKey = String(item.title).toLowerCase().slice(0, 80);
    if (activeFingerprints.has(titleKey)) continue;

    const publicId = await nextPublicId(prisma, "Flashcard");
    let confidence, impact, weight;
    let procStatus = "DRAFT";

    try {
      confidence = parseBoundedInt(item.confidence, 1, 10);
      impact = parseBoundedInt(item.impact, 1, 10);
      weight = parseBoundedInt(item.weight, 1, 10);
    } catch (e) {
      confidence = 1; impact = 1; weight = 1;
      procStatus = "REVIEW";
    }

    const normalizedScores = normalizeKnowledgeScores({
      impact,
      confidence,
      weight,
    });
    const freshnessScore = computeInitialFreshnessScore(evidenceBatch[0]);
    const fingerprint = hashValue(`GEN:FC:${company.id}:${evidenceBatch.map(e => e.id).join(",")}:${item.title}`);

    drafts.push({
      id: crypto.randomUUID(),
      publicId,
      companyId: company.id,
      title: truncate(item.title, 160),
      body: truncate(joinBody(item.body), bodyLimit),
      confidenceScore: normalizedScores.confidenceScore,
      confidence: normalizedScores.confidence,
      impact: normalizedScores.impact,
      weight: normalizedScores.weight,
      processingStatus: procStatus,
      activityState: "ACTIVE",
      status: "ACTIVE",
      reviewStatus: "PENDING",
      category: String(item.category || "FLASHCARD").toUpperCase(),
      kind: String(item.kind || "SUMMARY").toUpperCase(),
      hashtags: Array.isArray(item.semanticTags) ? item.semanticTags.slice(0, 5) :
                Array.isArray(item.hashtags) ? item.hashtags.slice(0, 5) : [],
      intelligenceType: String(item.intelligenceType || "INTERNAL").toUpperCase() === "COMPETITOR" ? "COMPETITOR" : "INTERNAL",
      fingerprint,
      createdBy: "generator-agent",
      // Trinity M2.1: lineage fields
      generatedFromIds: evidenceIds,
      versionFamilyId,
      candidateState: CandidateState.GENERATED,
      freshnessScore,
      iceScore: normalizedScores.iceScore,
      feedbackScore: 0,
      // Legacy source linking (for backward compat)
      sourceId: evidenceBatch[0].id,
      sourceType: "SOURCE",
    });
  }
  return drafts;
}

// ---------------------------------------------------------------------------
// 2. TaskCard Generator (ActionItem generation from KnowledgeItem)
// Implements the Knowledge-to-Action path from Trinity §25.
// Writes CandidateState.GENERATED and sourceFlashcardIds[] lineage.
// ---------------------------------------------------------------------------

/**
 * Generates actionable TaskCard DRAFTs from a verified Flashcard (KnowledgeItem).
 */
async function draftTaskcardFromFlashCard(prisma, company, flashCard, memoryPrompt, topic = null) {
  const descLimit = await getWorkerConfig(prisma, company, "draft_desc_limit", 1200);
  const strategicContext = await getCompanyStrategicContext(prisma, company.id);
  const activeFingerprints = await buildActiveInventoryFingerprints(prisma, company.id);

  const kind = String(flashCard.kind || "").toUpperCase();
  let tacticalGuidance = "";
  if (kind === "SUMMARY") {
    tacticalGuidance = "The source is a STRATEGIC SUMMARY. Generate tasks that focus on high-level operational reviews, policy updates, or strategic planning.";
  } else if (kind === "RECOMMENDATION") {
    tacticalGuidance = "The source is a TACTICAL RECOMMENDATION. Generate concrete, highly specific execution tasks with clear next steps.";
  } else if (kind === "EVALUATION") {
    tacticalGuidance = "The source is a PERFORMANCE EVALUATION. Generate corrective actions, audit tasks, or optimization steps based on the findings.";
  } else if (kind === "RESEARCH") {
    tacticalGuidance = "The source is RAW RESEARCH. Generate exploratory tasks, competitive intelligence reviews, or validation experiments.";
  }

  const systemPrompt = [
    "You are the checklist GENERATOR (Action path). Your goal is to convert KnowledgeItems (FlashCards) into executable ActionItems (TaskCards).",
    "Your tasks MUST be strategically aligned with the company's TopicCards and existing work:",
    strategicContext,
    topic ? `\n### [PRIMARY STRATEGIC GOAL: ${topic.label}]\nEnsure this task directly supports the following objective: ${topic.notes || topic.label}\n` : "",
    tacticalGuidance ? `\n### [TACTICAL GUIDANCE]\n${tacticalGuidance}\n` : "",
    "Required fields: title, description, kind, impact, confidence, ease, semanticTags (array of 3-5 lowercase strings).",
    "AXIOM: Strict integer scores for confidence, impact, ease. Scale: 1-10. NO zeros.",
    "SCORING DISCIPLINE: Score each dimension independently from the actual task text. Impact = business upside, confidence = evidence strength and clarity, ease = implementation effort. Do not reuse favorite tuples across tasks.",
    "SCORING RATIONALE: Titles or descriptions that differ materially should usually not receive identical triplets unless the evidence truly supports it.",
    "ACTIONABILITY REQUIREMENT: Every task must be concretely executable by a real human in a business context.",
    "Check the context carefully. Do NOT draft a task that is already present.",
    "You may propose MULTIPLE TaskCards if one KnowledgeItem implies multiple distinct actions.",
    "Format: Return a JSON array of objects.",
    "APERTUS Purity: Each card must be 100% monolingual. Translate if needed.",
    memoryPrompt
  ].join("\n");

  const userPrompt = `Company: ${company.name}\nKnowledgeItem Title: ${flashCard.title}\nKnowledgeItem Body: ${truncate(flashCard.body || flashCard.generatedBody || "", 1000)}`;

  const modelList = await getStageModels(prisma, "WRITE", company);
  const res = await callOllamaWithFailover(systemPrompt, userPrompt, modelList, { timeoutMs: trinity_WRITE_TIMEOUT_MS });
  const rawArray = unifyArray(res);
  if (!Array.isArray(rawArray)) return [];

  const drafts = [];
  const versionFamilyId = crypto.randomUUID();

  for (const item of rawArray) {
    if (!item.title || !item.description) continue;

    const titleKey = String(item.title).toLowerCase().slice(0, 80);
    if (activeFingerprints.has(titleKey)) continue;

    const publicId = await nextPublicId(prisma, "NBAItem");
    let confidence, impact, ease;
    let procStatus = "DRAFT";

    try {
      confidence = parseBoundedInt(item.confidence, 1, 10);
      impact = parseBoundedInt(item.impact, 1, 10);
      ease = parseBoundedInt(item.ease, 1, 10);
    } catch (e) {
      confidence = 1; impact = 1; ease = 1;
      procStatus = "REVIEW";
    }

    const groundedScores = groundTaskScores({
      impact,
      confidence,
      effort: ease,
      sourceImpact: flashCard.impact,
      sourceConfidence: flashCard.confidenceScore ?? flashCard.confidence,
      sourceWeight: flashCard.weight ?? flashCard.ease,
      kind: item.kind,
      title: item.title,
      description: item.description,
    });
    const normalizedTaskScores = normalizeTaskScores({
      impact: groundedScores.impact,
      confidence: groundedScores.confidence,
      ease: groundedScores.effort,
    });

    drafts.push({
      id: crypto.randomUUID(),
      publicId,
      companyId: company.id,
      title: truncate(item.title, 160),
      description: truncate(joinBody(item.description), descLimit),
      kind: String(item.kind || "TASK").toUpperCase(),
      impact: normalizedTaskScores.impact,
      confidenceScore: normalizedTaskScores.confidenceScore,
      confidence: normalizedTaskScores.confidence,
      ease: normalizedTaskScores.ease,
      iceScore: normalizedTaskScores.iceScore,
      processingStatus: procStatus,
      activityState: "ACTIVE",
      status: "PENDING",
      createdBy: "generator-agent",
      fingerprint: hashValue(`GEN:TC:${company.id}:${flashCard.id}:${item.title}`),
      // Trinity M2.1: lineage
      sourceFlashcardIds: [flashCard.id],
      versionFamilyId,
      candidateState: CandidateState.GENERATED,
      feedbackScore: 0,
      generatedFromIds: [flashCard.id],
    });
  }
  return drafts;
}

module.exports = {
  draftFlashcardFromDataCard,
  draftFlashcardsFromEvidenceBatch,
  draftTaskcardFromFlashCard,
};
