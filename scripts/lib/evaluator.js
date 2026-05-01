/**
 * TRINITY EVALUATOR
 * M2.3 — Relative Comparison Pool Scoring & Starvation-Safe Disposition
 * v1.0.0
 *
 * Implements the Evaluator stage from the Trinity formal production definition §10.
 *
 * The Evaluator receives the post-Refiner candidate set and produces:
 *   - A disposition for each candidate (6 options per spec §10.3)
 *   - Full score set: qualityScore, urgencyScore, freshnessScore, feedbackScore
 *   - Starvation-safe fallback (§10.7): when pool is starving, marginal candidates pass
 *
 * This replaces the Judge's binary VERIFIED/REJECTED with a continuous disposition system.
 * The original auditCheckedFlashCard is preserved as a backward-compatible wrapper.
 */
const { callOllamaWithFailover } = require("./ai");
const { STAGE_MODELS, trinity_JUDGE_TIMEOUT_MS } = require("./core");
const { getCompanyStrategicContext } = require("./context");
const { getWorkerConfig, calculatePercentile, parseBoundedInt, canonicalSourceText } = require("./shared");
const { unifyObject, unifyArray } = require("./synthesis-utils");
const { CandidateState, ReworkRoute, toEvaluated, toRework, toSuppressed, toArchived } = require("./lifecycle");

// ---------------------------------------------------------------------------
// 1. Constants
// ---------------------------------------------------------------------------

// Starvation detection: if fewer than this many ELIGIBLE candidates exist,
// apply fallback threshold to avoid frontier emptiness (§10.7)
const STARVATION_THRESHOLD = 3;
const FALLBACK_QUALITY_THRESHOLD = 0.30; // candidates above this pass when starving

// Disposition types per spec §10.3
const DISPOSITION = {
  ELIGIBLE:    "ELIGIBLE",
  REVISE:      "REVISE",
  REGENERATE:  "REGENERATE",
  MERGE:       "MERGE",
  SUPPRESS:    "SUPPRESS",
  ARCHIVE:     "ARCHIVE",
};

// ---------------------------------------------------------------------------
// 2. Score Computation
// ---------------------------------------------------------------------------

/**
 * Computes absolute quality score (0-1) from ICE dimensions.
 */
function computeQualityScore(candidate) {
  const impact = (candidate.impact || 5) / 10;
  const confidence = (candidate.confidence || candidate.confidenceScore || 5) / 10;
  const ease = (candidate.ease || 5) / 10;
  return Math.min(1, (impact * 0.45) + (confidence * 0.35) + (ease * 0.20));
}

/**
 * Computes freshness score (0-1) — decays over time since generation.
 */
function computeFreshnessScore(candidate) {
  if (candidate.freshnessScore !== undefined && candidate.freshnessScore !== null) {
    return candidate.freshnessScore;
  }
  const ageMs = Date.now() - new Date(candidate.createdAt || Date.now()).getTime();
  const windowMs = 30 * 24 * 60 * 60 * 1000; // 30 day default
  return Math.max(0, 1 - ageMs / windowMs);
}

/**
 * Computes urgency score (0-1) — based on topic relevance and recency cues.
 */
function computeUrgencyScore(candidate) {
  // High impact + time-sensitive kind = high urgency
  const impact = (candidate.impact || 5) / 10;
  const urgentKinds = ["NEWS", "FORECAST", "RECOMMENDATION", "TASK"];
  const kindBoost = urgentKinds.includes(String(candidate.kind || "").toUpperCase()) ? 0.2 : 0;
  return Math.min(1, impact * 0.8 + kindBoost);
}

/**
 * Computes relative dominance of a candidate within its comparison pool.
 * Returns 0-1 where 1 = best candidate in the pool.
 */
function computeRelativeDominance(candidate, pool) {
  if (!pool || pool.length === 0) return 0.5;
  const qualityScore = computeQualityScore(candidate);
  const poolQualities = pool.map(c => computeQualityScore(c));
  const rank = poolQualities.filter(q => q > qualityScore).length;
  return 1 - (rank / pool.length);
}

// ---------------------------------------------------------------------------
// 3. Disposition Engine
// ---------------------------------------------------------------------------

/**
 * Core Evaluator: produces a disposition for a single candidate relative to its pool.
 *
 * @param {object} candidate
 * @param {object[]} comparisonPool - Other REFINED candidates for the same company
 * @param {number} currentEligibleCount - Current count of ELIGIBLE items in inventory
 * @param {string} context - Strategic context string
 * @param {string} memoryPrompt
 * @returns {{ disposition, qualityScore, urgencyScore, freshnessScore, feedbackScore, evaluationReason, reworkRoute? }}
 */
async function evaluateCandidate(candidate, comparisonPool, currentEligibleCount, context, memoryPrompt) {
  const qualityScore = computeQualityScore(candidate);
  const urgencyScore = computeUrgencyScore(candidate);
  const freshnessScore = computeFreshnessScore(candidate);
  const feedbackScore = candidate.feedbackScore || 0;
  const relativeDominance = computeRelativeDominance(candidate, comparisonPool);

  // Starvation-safe fallback: if eligible pool is critically small, be permissive
  const isStarving = currentEligibleCount < STARVATION_THRESHOLD;
  const fallbackEligible = isStarving && qualityScore >= FALLBACK_QUALITY_THRESHOLD;

  // Use LLM for disposition on borderline cases
  const systemPrompt = [
    "You are the Trinity Evaluator. Assess this candidate's fitness for the active checklist.",
    "Context:", context || "",
    "Scoring: qualityScore=" + qualityScore.toFixed(2) +
      ", urgencyScore=" + urgencyScore.toFixed(2) +
      ", freshnessScore=" + freshnessScore.toFixed(2) +
      ", relativeDominance=" + relativeDominance.toFixed(2) +
      ", feedbackScore=" + feedbackScore.toFixed(2),
    "Comparison pool size: " + comparisonPool.length,
    isStarving ? "STARVATION MODE: The eligible pool is critically small. Be permissive — borderline candidates SHOULD pass." : "",
    "Dispositions: ELIGIBLE (ready for frontier) | REVISE (send back for rewrite) | REGENERATE (fundamentally broken, re-generate from evidence) | MERGE (too similar to another candidate) | SUPPRESS (dominated by superior sibling) | ARCHIVE (permanently invalid)",
    "Return JSON: { disposition, reason, reworkRoute? (REVISE|REGENERATE|MERGE|ENRICH|DOWNRANK_ONLY) }",
    memoryPrompt || ""
  ].join("\n");

  const userPrompt = `Title: ${candidate.title}\nDescription: ${candidate.description || candidate.body || ""}`;

  const res = await callOllamaWithFailover(systemPrompt, userPrompt, STAGE_MODELS.JUDGE, { timeoutMs: trinity_JUDGE_TIMEOUT_MS });
  const raw = unifyObject(res);

  let disposition = raw?.disposition || DISPOSITION.ARCHIVE;
  const reason = raw?.reason || "No reason provided";
  const reworkRoute = raw?.reworkRoute || null;

  // Override: starvation fallback takes precedence over conservative Evaluator
  if (fallbackEligible && (disposition === DISPOSITION.ARCHIVE || disposition === DISPOSITION.SUPPRESS)) {
    disposition = DISPOSITION.ELIGIBLE;
  }

  // Validate disposition
  if (!Object.values(DISPOSITION).includes(disposition)) {
    disposition = qualityScore >= 0.4 ? DISPOSITION.ELIGIBLE : DISPOSITION.ARCHIVE;
  }

  return {
    disposition,
    qualityScore,
    urgencyScore,
    freshnessScore,
    feedbackScore,
    evaluationReason: reason,
    reworkRoute: [DISPOSITION.REVISE, DISPOSITION.REGENERATE, DISPOSITION.MERGE].includes(disposition)
      ? (reworkRoute || ReworkRoute.REVISE)
      : null,
  };
}

// ---------------------------------------------------------------------------
// 4. Batch Evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluates a batch of REFINED NBA candidates and writes dispositions to the database.
 *
 * @param {PrismaClient} prisma
 * @param {object} company
 * @param {object[]} candidates - NBAItem records with candidateState = REFINED
 * @param {string} memoryPrompt
 * @returns {{ eligible: string[], rework: string[], suppressed: string[], archived: string[] }}
 */
/**
 * M4.4: Tournament-style Batch Evaluation
 * Evaluates a batch of REFINED NBA candidates by presenting them all to the LLM
 * at once, allowing for direct relative ranking and champion selection.
 */
async function evaluateNBAItemBatch(prisma, company, candidates, memoryPrompt) {
  if (candidates.length === 0) return { eligible: [], rework: [], suppressed: [], archived: [] };
  
  const context = await getCompanyStrategicContext(prisma, company.id);
  const currentEligibleCount = await prisma.nBAItem.count({
    where: {
      companyId: company.id,
      candidateState: CandidateState.EVALUATED,
      activityState: { in: ["ACTIVE", "STALE"] },
    },
  });

  const isStarving = currentEligibleCount < STARVATION_THRESHOLD;

  const candidateSummary = candidates.map((c, i) => 
    `[Candidate ${i + 1}]: ${c.title}\nDescription: ${c.description || c.body || ""}\nImpact: ${c.impact}, Confidence: ${c.confidence || c.confidenceScore}, Ease: ${c.ease}`
  ).join("\n\n---\n\n");

  const systemPrompt = [
    "You are the Trinity Evaluator performing a TOURNAMENT BATCH EVALUATION.",
    "Assess the following candidates relative to each other and the company strategy.",
    "Context:", context || "",
    isStarving ? "STARVATION MODE: The eligible pool is critically small. Be permissive — borderline candidates SHOULD pass." : "",
    "Dispositions: ELIGIBLE (ready for frontier) | REVISE (send back for rewrite) | REGENERATE (broken) | MERGE (duplicate) | SUPPRESS (dominated) | ARCHIVE (invalid)",
    "Return a JSON array of objects: [{ id, disposition, reason, qualityScore (0-1), reworkRoute? }]",
    "The 'id' MUST match the [Candidate X] index (e.g. 1, 2, 3...).",
    memoryPrompt || ""
  ].join("\n");

  const userPrompt = `Candidates for evaluation:\n${candidateSummary}`;

  const res = await callOllamaWithFailover(systemPrompt, userPrompt, STAGE_MODELS.JUDGE, { timeoutMs: trinity_JUDGE_TIMEOUT_MS });
  const rawArray = unifyArray(res);

  const results = { eligible: [], rework: [], suppressed: [], archived: [] };

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const eval_ = (Array.isArray(rawArray) ? rawArray.find(r => r.id === i + 1) : null) || {
      disposition: computeQualityScore(candidate) > 0.4 ? DISPOSITION.ELIGIBLE : DISPOSITION.ARCHIVE,
      reason: "Fallback evaluation."
    };

    let stateUpdate;
    const qualityScore = eval_.qualityScore || computeQualityScore(candidate);
    const urgencyScore = computeUrgencyScore(candidate);
    const freshnessScore = computeFreshnessScore(candidate);

    if (eval_.disposition === DISPOSITION.ELIGIBLE) {
      stateUpdate = toEvaluated({
        qualityScore,
        urgencyScore,
        freshnessScore,
        evaluationReason: eval_.reason,
      });
      stateUpdate.processingStatus = "VERIFIED";
      stateUpdate.activityState = "ACTIVE";
      results.eligible.push(candidate.id);
    } else if ([DISPOSITION.REVISE, DISPOSITION.REGENERATE, DISPOSITION.MERGE].includes(eval_.disposition)) {
      stateUpdate = toRework(eval_.reworkRoute || ReworkRoute.REVISE, eval_.reason);
      stateUpdate.processingStatus = "DRAFT";
      results.rework.push(candidate.id);
    } else if (eval_.disposition === DISPOSITION.SUPPRESS) {
      stateUpdate = toSuppressed(eval_.reason);
      stateUpdate.processingStatus = "DECLINED";
      stateUpdate.activityState = "ARCHIVED";
      results.suppressed.push(candidate.id);
    } else {
      stateUpdate = toArchived(eval_.reason);
      stateUpdate.processingStatus = "DECLINED";
      results.archived.push(candidate.id);
    }

    await prisma.nBAItem.update({
      where: { id: candidate.id },
      data: {
        ...stateUpdate,
        qualityScore,
        urgencyScore,
        freshnessScore,
        evaluationReason: eval_.reason,
      }
    });
  }

  console.log(`[EVALUATOR] ${company.name}: Batch tournament complete. eligible=${results.eligible.length} total=${candidates.length}`);
  return results;
}

// ---------------------------------------------------------------------------
// 5. Backward-Compatible Judge Wrappers
// ---------------------------------------------------------------------------

/**
 * Backward-compatible wrapper — audits a CHECKED Flashcard (used by synthesis.js).
 * Writes CandidateState to the result for downstream lifecycle tracking.
 */
async function auditCheckedFlashCard(prisma, flashCard, memoryPrompt, topic = null, sourceContent = null, workerContext = {}) {
  const strategicContext = await getCompanyStrategicContext(prisma, flashCard.companyId);

  const systemPrompt = [
    "You are the Trinity Evaluator (FlashCard audit mode). Audit the following KnowledgeItem for production quality.",
    "### [GROUNDING RULES]",
    "Every factual claim MUST have at least one verifiable citation.",
    "If any claim is unsupported, decision = REJECTED.",
    "### [VALIDATION]",
    "- Max 160 char title, 1200 char body.",
    "- 100% Monolingual.",
    memoryPrompt,
    sourceContent ? `SOURCE CONTENT:\n${canonicalSourceText(sourceContent)}` : ""
  ].join("\n");

  const userPrompt = `Title: ${flashCard.title}\nBody: ${flashCard.body}`;
  const res = await callOllamaWithFailover(systemPrompt, userPrompt, STAGE_MODELS.JUDGE, { timeoutMs: trinity_JUDGE_TIMEOUT_MS });
  const raw = unifyObject(res);

  if (!raw || !raw.decision) {
    return {
      processingStatus: "CHECKED",
      candidateState: CandidateState.REFINED,
    };
  }

  if (raw.decision === "VERIFIED" && sourceContent) {
    const canonicalText = canonicalSourceText(sourceContent);
    const claims = raw.claims || [];
    for (const claim of claims) {
      for (const cit of (claim.citations || [])) {
        const actual = canonicalText.substring(cit.startOffset, cit.endOffset);
        if (actual !== cit.quote) {
          return {
            processingStatus: "DRAFT",
            candidateState: CandidateState.REWORK,
            reworkRoute: ReworkRoute.REVISE,
            evaluationReason: `Hallucination in claim: "${claim.claim}"`,
          };
        }
      }
    }
  }

  const isVerified = raw.decision === "VERIFIED";
  return {
    processingStatus: isVerified ? "VERIFIED" : "DRAFT",
    candidateState: isVerified ? CandidateState.EVALUATED : CandidateState.REWORK,
    reworkRoute: isVerified ? null : ReworkRoute.REVISE,
    confidenceScore: parseBoundedInt(raw.confidenceScore, 1, 10),
    qualityScore: isVerified ? 0.7 : 0.2,
    evidence: { claims: raw.claims },
    evaluationReason: raw.reason || "Processed.",
    promptName: "evaluator-audit",
    promptVersion: "1.0.0",
    modelName: STAGE_MODELS.JUDGE[0],
    temperature: 0.1,
  };
}

module.exports = {
  // M2.3: Relative scoring and batch evaluation
  evaluateCandidate,
  evaluateNBAItemBatch,
  DISPOSITION,
  // Backward-compatible judge wrappers
  auditCheckedFlashCard,
};
