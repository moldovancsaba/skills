/**
 * TRINITY REFINER
 * M2.2 — Full Entropy Reduction
 * v1.0.0
 *
 * Implements the Refiner stage from the Trinity formal production definition §9.
 *
 * The Refiner is the entropy-reducing stage. It receives generated candidate sets
 * and emits a smaller, cleaner, more evaluable set.
 *
 * Operations (per §9.5):
 *   SUPPRESS_WEAK  — pick the champion from exact/near-duplicate neighborhood
 *   MERGE          — combine overlapping candidates into one stronger candidate
 *   SPLIT          — decompose overloaded candidates into evaluable units
 *   ENRICH         — strengthen underspecified but promising candidates
 *   REFINE_AS_IS   — standard single-candidate rewrite (existing Writer behavior)
 *
 * Mandatory rule (§11.1): the Refiner MUST NOT leave obvious duplicates unresolved.
 */
const { callOllamaWithFailover } = require("./ai");
const { STAGE_MODELS, trinity_WRITE_TIMEOUT_MS } = require("./core");
const { truncate, hashValue, getWorkerConfig, getStageModels, similarity, parseBoundedScore, nextPublicId } = require("./shared");
const { getCompanyStrategicContext } = require("./context");
const { unifyObject, unifyArray } = require("./synthesis-utils");
const { CandidateState, toRefined, toSuppressed } = require("./lifecycle");
const {
  buildScoreProfile,
  groundTaskScores,
  persistTaskScoresFromProfile,
} = require("../../src/lib/scoring-contract");
const { computeHistoryAwareTaskSignals } = require("./history-scoring");

// ---------------------------------------------------------------------------
// 1. Neighborhood Detection
// Groups candidates by semantic similarity for operation selection.
// ---------------------------------------------------------------------------

/**
 * Builds candidate neighborhoods — clusters of semantically similar candidates.
 * Each neighborhood will have exactly one operation applied to it.
 *
 * @param {object[]} candidates
 * @param {number} titleThreshold - Title similarity to consider near-duplicate
 * @returns {object[][]} Array of neighborhoods (each is an array of candidates)
 */
function buildCandidateNeighborhoods(candidates, titleThreshold = 0.75) {
  const assigned = new Set();
  const neighborhoods = [];

  for (let i = 0; i < candidates.length; i++) {
    if (assigned.has(i)) continue;

    const neighborhood = [candidates[i]];
    assigned.add(i);

    for (let j = i + 1; j < candidates.length; j++) {
      if (assigned.has(j)) continue;
      const titleSim = similarity(candidates[i].title, candidates[j].title);
      if (titleSim >= titleThreshold) {
        neighborhood.push(candidates[j]);
        assigned.add(j);
      }
    }
    neighborhoods.push(neighborhood);
  }
  return neighborhoods;
}

// ---------------------------------------------------------------------------
// 2. Operation Selection (per spec §11)
// ---------------------------------------------------------------------------

const EXACT_DUPLICATE_THRESHOLD = 0.96;
const HIGH_SEMANTIC_OVERLAP_THRESHOLD = 0.82;

function chooseRefinementOperation(neighborhood) {
  if (neighborhood.length === 1) return "REFINE_AS_IS";

  const champion = selectChampion(neighborhood);
  const others = neighborhood.filter(c => c.id !== champion.id);

  // Check for exact duplicates
  const hasExactDuplicate = others.some(c =>
    similarity(c.title, champion.title) >= EXACT_DUPLICATE_THRESHOLD
  );
  if (hasExactDuplicate) return "SUPPRESS_WEAK";

  // Check for high semantic overlap where merge preserves value
  const allHighOverlap = others.every(c =>
    similarity(c.title, champion.title) >= HIGH_SEMANTIC_OVERLAP_THRESHOLD
  );
  if (allHighOverlap && neighborhood.length <= 4) return "MERGE";

  // Check if champion is overloaded (very long title suggesting bundled decisions)
  const isOverloaded = champion.title && champion.title.split(" and ").length >= 3;
  if (isOverloaded) return "SPLIT";

  // Check if champion is promising but underspecified (low scores, short body)
  const isUnderspecified =
    (champion.description || champion.body || "").length < 100 &&
    (champion.confidence || 0) < 4;
  if (isUnderspecified) return "ENRICH";

  return "SUPPRESS_WEAK"; // Default: keep champion, suppress others
}

/**
 * Selects the best candidate from a neighborhood (cluster champion).
 * Priority: highest iceScore, then highest confidence, then oldest.
 */
function selectChampion(neighborhood) {
  return neighborhood.reduce((best, c) => {
    const bScore = (best.iceScore || 0) + (best.confidence || 0) * 0.1;
    const cScore = (c.iceScore || 0) + (c.confidence || 0) * 0.1;
    return cScore > bScore ? c : best;
  });
}

async function normalizeRefinedTaskScores(prisma, raw = {}, fallback = {}) {
  const historySignals = await computeHistoryAwareTaskSignals(prisma, fallback.companyId, {
    title: raw.title ?? fallback.title,
    description: raw.description ?? raw.body ?? fallback.description ?? fallback.body,
    hashtags: Array.isArray(raw.semanticTags) ? raw.semanticTags.slice(0, 5) : fallback.hashtags,
  });
  const grounded = groundTaskScores({
    impact: raw.impact ?? fallback.impact,
    confidence: raw.confidence ?? raw.confidenceScore ?? fallback.confidence ?? fallback.confidenceScore,
    effort: raw.ease ?? fallback.ease,
    title: raw.title ?? fallback.title,
    description: raw.description ?? raw.body ?? fallback.description ?? fallback.body,
    kind: raw.kind ?? fallback.kind,
    sourceImpact: fallback.impact,
    sourceConfidence: fallback.confidence ?? fallback.confidenceScore,
    sourceWeight: fallback.ease,
    sourceIceScore: fallback.iceScore,
    historyImpact: historySignals.historyImpact,
    historyConfidence: historySignals.historyConfidence,
    historySupport: historySignals.historySupport,
    historyEase: historySignals.historyEase,
    historyDifficulty: historySignals.historyDifficulty,
  });

  const scoreProfile = buildScoreProfile({
    scoreKind: "TASK",
    agent: {
      impact: raw.impact ?? fallback.impact,
      confidence: raw.confidence ?? raw.confidenceScore ?? fallback.confidence ?? fallback.confidenceScore,
      effort: raw.ease ?? fallback.ease,
    },
    calibrated: grounded,
    rationale: {
      sourceImpact: fallback.impact,
      sourceConfidence: fallback.confidence ?? fallback.confidenceScore,
      sourceWeight: fallback.ease,
      sourceIceScore: fallback.iceScore,
      refinerStage: "trinity-refiner",
      historyImpact: historySignals.historyImpact,
      historyConfidence: historySignals.historyConfidence,
      historySupport: historySignals.historySupport,
      historyEase: historySignals.historyEase,
      historyDifficulty: historySignals.historyDifficulty,
      historyPositiveMatches: historySignals.positiveMatches,
      historyNegativeMatches: historySignals.negativeMatches,
      historyAverageSimilarity: historySignals.averageSimilarity,
      historyDeliveredMatches: historySignals.deliveredMatches,
      historyAcceptedMatches: historySignals.acceptedMatches,
      historyFrictionMatches: historySignals.frictionMatches,
    },
  });
  return {
    ...persistTaskScoresFromProfile(scoreProfile),
    scoreProfile,
  };
}

// ---------------------------------------------------------------------------
// 3. Operation Implementations
// ---------------------------------------------------------------------------

/**
 * MERGE: Combine overlapping candidates into one stronger candidate.
 * Preserves lineage from all merged siblings.
 */
async function mergeNeighborhood(neighborhood, context, memoryPrompt) {
  const champion = selectChampion(neighborhood);
  if (neighborhood.length === 1) return { refined: champion, suppressed: [] };

  const combinedContext = neighborhood.map((c, i) =>
    `[Candidate ${i + 1}]: ${c.title}\n${c.description || c.body || ""}`
  ).join("\n\n---\n\n");

  const systemPrompt = [
    "You are the Trinity Refiner performing a MERGE operation.",
    "You have received multiple candidates that represent overlapping operational ideas.",
    "Merge them into ONE stronger, more precise candidate that captures the combined insight.",
    "Preserve the most specific claims from all candidates. Do not lose supporting evidence.",
    context || "",
    "Return a single JSON object: { title, description, impact, confidence, ease, semanticTags[] }",
    memoryPrompt || ""
  ].join("\n");

  const userPrompt = `Candidates to merge:\n${combinedContext}`;

  const modelList = await getStageModels(prisma, "WRITE", company);
  const res = await callOllamaWithFailover(systemPrompt, userPrompt, modelList, { timeoutMs: trinity_WRITE_TIMEOUT_MS });
  const raw = unifyObject(res);

  if (!raw || !raw.title) return { refined: champion, suppressed: neighborhood.filter(c => c.id !== champion.id) };

  // Build merged lineage: collect all source IDs from all siblings
  const mergedGeneratedFromIds = [...new Set(
    neighborhood.flatMap(c => c.generatedFromIds || []).concat(
      neighborhood.flatMap(c => c.sourceFlashcardIds || [])
    )
  )];

  const mergedScores = await normalizeRefinedTaskScores(prisma, raw, champion);
  const merged = {
    ...champion,
    title: truncate(raw.title, 160),
    description: truncate(raw.description || champion.description || "", 1200),
    body: truncate(raw.description || champion.body || "", 1200),
    impact: mergedScores.impact,
    confidence: mergedScores.confidence,
    confidenceScore: mergedScores.confidenceScore,
    ease: mergedScores.ease,
    iceScore: mergedScores.iceScore,
    scoreProfile: mergedScores.scoreProfile,
    hashtags: Array.isArray(raw.semanticTags) ? raw.semanticTags.slice(0, 5) : (champion.hashtags || []),
    // Trinity lineage: merge all sources
    generatedFromIds: mergedGeneratedFromIds,
    refinedFromId: champion.id,
    versionFamilyId: champion.versionFamilyId,
    // Refiner state
    ...toRefined({ evaluationReason: `MERGE: combined ${neighborhood.length} overlapping candidates` }),
    processingStatus: "CHECKED",
    activityState: "ACTIVE",
  };

  return {
    refined: merged,
    suppressed: neighborhood.filter(c => c.id !== champion.id),
  };
}

/**
 * SUPPRESS_WEAK: Keep champion, suppress all other members.
 */
async function suppressWeak(neighborhood, context, memoryPrompt) {
  const champion = selectChampion(neighborhood);
  const refined = {
    ...champion,
    ...toRefined({ evaluationReason: `SUPPRESS_WEAK: champion of ${neighborhood.length}-member cluster` }),
    refinedFromId: champion.id,
    processingStatus: "CHECKED",
    activityState: "ACTIVE",
  };
  return {
    refined,
    suppressed: neighborhood.filter(c => c.id !== champion.id),
  };
}

/**
 * ENRICH: Strengthen an underspecified but promising candidate.
 */
async function enrichCandidate(candidate, context, memoryPrompt) {
  const systemPrompt = [
    "You are the Trinity Refiner performing an ENRICH operation.",
    "The candidate below is promising but underspecified. Add specific context, grounding, and actionability.",
    "Do not change the core insight — make it more concrete and business-specific.",
    context || "",
    "Return a single JSON object: { title, description, impact, confidence, ease }",
    memoryPrompt || ""
  ].join("\n");

  const userPrompt = `Candidate to enrich:\nTitle: ${candidate.title}\nDescription: ${candidate.description || candidate.body || "(empty)"}`;

  const res = await callOllamaWithFailover(systemPrompt, userPrompt, STAGE_MODELS.WRITE, { timeoutMs: trinity_WRITE_TIMEOUT_MS });
  const raw = unifyObject(res);
  if (!raw || !raw.title) return candidate;

  const enrichedScores = await normalizeRefinedTaskScores(prisma, raw, candidate);
  return {
    ...candidate,
    title: truncate(raw.title, 160),
    description: truncate(raw.description || candidate.description || "", 1200),
    body: truncate(raw.description || candidate.body || "", 1200),
    impact: enrichedScores.impact,
    confidence: enrichedScores.confidence,
    confidenceScore: enrichedScores.confidenceScore,
    ease: enrichedScores.ease,
    iceScore: enrichedScores.iceScore,
    scoreProfile: enrichedScores.scoreProfile,
    ...toRefined({ evaluationReason: "ENRICH: underspecified candidate strengthened" }),
    refinedFromId: candidate.id,
    processingStatus: "CHECKED",
    activityState: "ACTIVE",
  };
}

/**
 * REFINE_AS_IS: Standard single-candidate rewrite (existing Writer behavior).
 */
async function refineAsIs(candidate, context, memoryPrompt) {
  const systemPrompt = [
    "You are the Trinity Refiner. Refine this candidate for clarity, precision, and impact.",
    "Improve the language and make claims more specific and business-relevant.",
    context || "",
    "Return a single JSON object: { title, description, impact, confidence, ease, hashtags }",
    "AXIOM: Decimal scores 1.0-10.0 for impact, confidence, ease with up to one decimal place. NO zeros.",
    memoryPrompt || ""
  ].join("\n");

  const userPrompt = `Title: ${candidate.title}\nDescription: ${candidate.description || candidate.body || ""}`;

  const res = await callOllamaWithFailover(systemPrompt, userPrompt, STAGE_MODELS.WRITE, { timeoutMs: trinity_WRITE_TIMEOUT_MS });
  const raw = unifyObject(res);
  if (!raw || !raw.title) return candidate;

  const refinedScores = await normalizeRefinedTaskScores(prisma, raw, candidate);
  return {
    ...candidate,
    title: truncate(raw.title, 160),
    description: truncate(raw.description || candidate.description || "", 1200),
    body: truncate(raw.description || candidate.body || "", 1200),
    impact: refinedScores.impact,
    confidence: refinedScores.confidence,
    confidenceScore: refinedScores.confidenceScore,
    ease: refinedScores.ease,
    iceScore: refinedScores.iceScore,
    scoreProfile: refinedScores.scoreProfile,
    hashtags: Array.isArray(raw.hashtags) ? raw.hashtags.slice(0, 5) : (candidate.hashtags || []),
    ...toRefined({ evaluationReason: "REFINE_AS_IS: standard refinement" }),
    refinedFromId: candidate.id,
    processingStatus: "CHECKED",
    activityState: "ACTIVE",
  };
}

function parseSafe(val, fallback) {
  try { return parseBoundedScore(val, 1, 10); } catch { return fallback; }
}

// ---------------------------------------------------------------------------
// 4. Main Refiner Entry Points
// ---------------------------------------------------------------------------

/**
 * Runs the Refiner over a batch of generated NBA (TaskCard) candidates.
 * Detects neighborhoods, selects operations, and returns refined + suppressed sets.
 *
 * @param {PrismaClient} prisma
 * @param {object} company
 * @param {object[]} candidates - Generated NBAItem records
 * @param {string} memoryPrompt
 * @returns {{ refined: object[], suppressed: object[] }}
 */
async function refineNBAItemBatch(prisma, company, candidates, memoryPrompt) {
  const strategicContext = await getCompanyStrategicContext(prisma, company.id);
  const neighborhoods = buildCandidateNeighborhoods(candidates);

  const refined = [];
  const suppressed = [];

  for (const neighborhood of neighborhoods) {
    const operation = chooseRefinementOperation(neighborhood);
    let result;

    if (operation === "MERGE") {
      result = await mergeNeighborhood(neighborhood, strategicContext, memoryPrompt);
    } else if (operation === "SUPPRESS_WEAK") {
      result = await suppressWeak(neighborhood, strategicContext, memoryPrompt);
    } else if (operation === "ENRICH") {
      const enriched = await enrichCandidate(neighborhood[0], strategicContext, memoryPrompt);
      result = { refined: enriched, suppressed: neighborhood.slice(1) };
    } else {
      const refineResult = await refineAsIs(neighborhood[0], strategicContext, memoryPrompt);
      result = { refined: refineResult, suppressed: neighborhood.slice(1) };
    }

    refined.push(result.refined);
    suppressed.push(...(result.suppressed || []));
  }

  return { refined, suppressed };
}

/**
 * Runs the Refiner over a batch of generated Flashcard (KnowledgeItem) candidates.
 */
async function refineFlashcardBatch(prisma, company, candidates, memoryPrompt) {
  const strategicContext = await getCompanyStrategicContext(prisma, company.id);
  const neighborhoods = buildCandidateNeighborhoods(candidates);

  const refined = [];
  const suppressed = [];

  for (const neighborhood of neighborhoods) {
    const operation = chooseRefinementOperation(neighborhood);
    let result;

    if (operation === "MERGE") {
      result = await mergeNeighborhood(neighborhood, strategicContext, memoryPrompt);
    } else if (operation === "SUPPRESS_WEAK") {
      result = await suppressWeak(neighborhood, strategicContext, memoryPrompt);
    } else if (operation === "ENRICH") {
      const enriched = await enrichCandidate(neighborhood[0], strategicContext, memoryPrompt);
      result = { refined: enriched, suppressed: neighborhood.slice(1) };
    } else {
      const refineResult = await refineAsIs(neighborhood[0], strategicContext, memoryPrompt);
      result = { refined: refineResult, suppressed: neighborhood.slice(1) };
    }

    refined.push(result.refined);
    suppressed.push(...(result.suppressed || []));
  }

  return { refined, suppressed };
}

/**
 * Backward-compatible wrapper — refines a single DRAFT TaskCard (used by synthesis.js).
 * Wraps the existing writer.js behavior but writes CandidateState.REFINED.
 */
async function refineDraftTaskCard(prisma, taskCard, memoryPrompt, topic = null) {
  // Delegate to writer.js for single-item refinement to avoid breaking the pipeline
  const { refineDraftTaskCard: writerRefine } = require("./writer");
  const result = await writerRefine(prisma, taskCard, memoryPrompt, topic);
  if (!result) return null;

  // Annotate with Trinity lifecycle state
  return {
    ...result,
    candidateState: result.processingStatus === "DECLINED" ? CandidateState.SUPPRESSED : CandidateState.REFINED,
    refinedFromId: taskCard.id,
  };
}

/**
 * Backward-compatible wrapper for Flashcard refinement.
 */
async function refineDraftFlashCard(prisma, flashCard, memoryPrompt, topic = null) {
  const { refineDraftFlashCard: writerRefine } = require("./writer");
  const result = await writerRefine(prisma, flashCard, memoryPrompt, topic);
  if (!result) return null;

  return {
    ...result,
    candidateState: result.processingStatus === "DECLINED" ? CandidateState.SUPPRESSED : CandidateState.REFINED,
    refinedFromId: flashCard.id,
  };
}

module.exports = {
  // M2.2: Full entropy reduction
  refineNBAItemBatch,
  refineFlashcardBatch,
  buildCandidateNeighborhoods,
  chooseRefinementOperation,
  selectChampion,
  mergeNeighborhood,
  suppressWeak,
  enrichCandidate,
  refineAsIs,
  // Backward-compatible wrappers
  refineDraftFlashCard,
  refineDraftTaskCard,
};
