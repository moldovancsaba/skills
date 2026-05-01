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
const { unifyObject } = require("./synthesis-utils");
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
async function evaluateNBAItemBatch(prisma, company, candidates, memoryPrompt) {
  const context = await getCompanyStrategicContext(prisma, company.id);

  // Count current ELIGIBLE items for starvation detection
  const currentEligibleCount = await prisma.nBAItem.count({
    where: {
      companyId: company.id,
      candidateState: CandidateState.EVALUATED,
      activityState: { in: ["ACTIVE", "STALE"] },
    },
  });

  const results = { eligible: [], rework: [], suppressed: [], archived: [] };

  for (const candidate of candidates) {
    try {
      const pool = candidates.filter(c => c.id !== candidate.id);
      const eval_ = await evaluateCandidate(candidate, pool, currentEligibleCount, context, memoryPrompt);

      let stateUpdate;
      if (eval_.disposition === DISPOSITION.ELIGIBLE) {
        stateUpdate = toEvaluated({
          qualityScore: eval_.qualityScore,
          urgencyScore: eval_.urgencyScore,
          freshnessScore: eval_.freshnessScore,
          feedbackScore: eval_.feedbackScore,
          evaluationReason: eval_.evaluationReason,
        });
        stateUpdate.processingStatus = "VERIFIED";
        stateUpdate.activityState = "ACTIVE";
        results.eligible.push(candidate.id);

      } else if (eval_.disposition === DISPOSITION.REVISE || eval_.disposition === DISPOSITION.REGENERATE || eval_.disposition === DISPOSITION.MERGE) {
        stateUpdate = toRework(eval_.reworkRoute || ReworkRoute.REVISE, eval_.evaluationReason);
        stateUpdate.processingStatus = "DRAFT";
        results.rework.push(candidate.id);

      } else if (eval_.disposition === DISPOSITION.SUPPRESS) {
        stateUpdate = toSuppressed(eval_.evaluationReason);
        stateUpdate.processingStatus = "DECLINED";
        stateUpdate.activityState = "ARCHIVED";
        results.suppressed.push(candidate.id);

      } else {
        // ARCHIVE
        stateUpdate = toArchived(eval_.evaluationReason);
        stateUpdate.processingStatus = "DECLINED";
        stateUpdate.status = "DECLINED";
        results.archived.push(candidate.id);
      }

      await prisma.nBAItem.update({
        where: { id: candidate.id },
        data: {
          ...stateUpdate,
          qualityScore: eval_.qualityScore,
          urgencyScore: eval_.urgencyScore,
          freshnessScore: eval_.freshnessScore,
          feedbackScore: eval_.feedbackScore,
          evaluationReason: eval_.evaluationReason,
        },
      });
    } catch (err) {
      console.error(`[EVALUATOR] Failed candidate ${candidate.id}:`, err.message);
    }
  }

  console.log(`[EVALUATOR] ${company.name}: eligible=${results.eligible.length} rework=${results.rework.length} suppressed=${results.suppressed.length} archived=${results.archived.length}`);
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
