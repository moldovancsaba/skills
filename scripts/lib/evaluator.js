/**
 * checklist EVALUATOR
 * M2.3 — Tournament Consensus Judging & Strategic Steering
 */
const { callOllamaWithFailover } = require("./ai");
const { STAGE_MODELS, JUDGE_STAGE_TIMEOUT_MS, queueAiInference } = require("./core");
const { getCompanyStrategicContext } = require("./context");
const { truncate, hashValue, getWorkerConfig, parseBoundedInt, getStageModels, canonicalSourceText } = require("./shared");
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
 * M3.4: Tournament Consensus Voter (Phase 5)
 * Resolves a majority disposition from multiple model assessments.
 */
function resolveConsensus(votes, fallbackDisposition = DISPOSITION.ARCHIVE) {
  if (!votes || votes.length === 0) return { disposition: fallbackDisposition, reason: "No votes received." };
  
  const counts = {};
  votes.forEach(v => {
    const d = v.disposition || fallbackDisposition;
    counts[d] = (counts[d] || 0) + 1;
  });

  // Majority rule
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const winner = sorted[0][0];

  // Find the winner's data
  const winVote = votes.find(v => v.disposition === winner) || votes[0];
  
  return {
    disposition: winner,
    reason: `[Consensus: ${sorted[0][1]}/${votes.length}] ${winVote.reason || ""}`,
    reworkRoute: winVote.reworkRoute || null
  };
}

/**
 * Core Evaluator: produces a disposition for a single candidate relative to its pool.
 * Enhanced with Phase 5 Tournament Consensus.
 *
 * @param {PrismaClient} prisma
 * @param {object} company
 * @param {object} candidate
 * @param {object[]} comparisonPool
 * @param {number} currentEligibleCount
 * @param {string} context
 * @param {string} memoryPrompt
 */
async function evaluateCandidate(prisma, company, candidate, comparisonPool, currentEligibleCount, context, memoryPrompt) {
  const qualityScore = computeQualityScore(candidate);
  const urgencyScore = computeUrgencyScore(candidate);
  const freshnessScore = computeFreshnessScore(candidate);
  const feedbackScore = candidate.feedbackScore || 0;
  const relativeDominance = computeRelativeDominance(candidate, comparisonPool);

  const isStarving = currentEligibleCount < STARVATION_THRESHOLD;
  const fallbackEligible = isStarving && qualityScore >= FALLBACK_QUALITY_THRESHOLD;

  const systemPrompt = [
    "You are the checklist Evaluator. Assess this candidate's fitness for the active checklist.",
    "### [STRATEGIC ALIGNMENT]",
    "Review the 'USER-DEFINED PRIORITIES' in the context below. These are the user's manual tactical goals.",
    "If this candidate matches a high-priority user theme or tag, you MUST favor an ELIGIBLE disposition and increase the qualityScore.",
    "### [CONTEXT]", 
    context || "",
    "### [SCORING SIGNALS]",
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

  // NBA 5: Tournament Judging - Fetch specialized models
  const judgeModels = await getStageModels(prisma, "JUDGE", company);
  
  // Call up to 2 models for tournament consensus (Phase 5)
  const votes = [];
  const modelLimit = Math.min(judgeModels.length, 2);
  
  for (let i = 0; i < modelLimit; i++) {
    const res = await callOllamaWithFailover(systemPrompt, userPrompt, [judgeModels[i]], { timeoutMs: JUDGE_STAGE_TIMEOUT_MS });
    const parsed = unifyObject(res);
    if (parsed && parsed.disposition) votes.push(parsed);
  }

  let { disposition, reason, reworkRoute } = resolveConsensus(votes, DISPOSITION.ARCHIVE);

  // Override: starvation fallback takes precedence over conservative Evaluator
  if (fallbackEligible && (disposition === DISPOSITION.ARCHIVE || disposition === DISPOSITION.SUPPRESS)) {
    disposition = DISPOSITION.ELIGIBLE;
    reason = `[Starvation Fallback] ${reason}`;
  }

  // Final validation
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
 * @param {object[]} candidates - ChecklistTask records with candidateState = REFINED
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
  const currentEligibleCount = await prisma.checklistTask.count({
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
    "You are the checklist Evaluator performing a TOURNAMENT BATCH EVALUATION.",
    "Assess the following candidates relative to each other and the company strategy.",
    "### [TACTICAL ALIGNMENT]",
    "Review the 'USER-DEFINED PRIORITIES' in the context. These reflect the user's manual planning intent.",
    "Candidates that align with these manually prioritized themes MUST be ranked higher and given ELIGIBLE status.",
    "### [CONTEXT]",
    context || "",
    isStarving ? "STARVATION MODE: The eligible pool is critically small. Be permissive — borderline candidates SHOULD pass." : "",
    "Dispositions: ELIGIBLE (ready for frontier) | REVISE (send back for rewrite) | REGENERATE (broken) | MERGE (duplicate) | SUPPRESS (dominated) | ARCHIVE (invalid)",
    "Return a JSON array of objects: [{ id, disposition, reason, qualityScore (0-1), reworkRoute? }]",
    "The 'id' MUST match the [Candidate X] index (e.g. 1, 2, 3...).",
    memoryPrompt || ""
  ].join("\n");

  const userPrompt = `Candidates for evaluation:\n${candidateSummary}`;

  // NBA 5: Tournament Judging - Fetch specialized judge model if configured
  const tournamentJudge = await getWorkerConfig(prisma, company, "tournament_judge_model", null);
  const judgeModels = tournamentJudge ? [tournamentJudge, ...STAGE_MODELS.JUDGE] : await getStageModels(prisma, "JUDGE", company);

  const res = await callOllamaWithFailover(systemPrompt, userPrompt, judgeModels, { timeoutMs: JUDGE_STAGE_TIMEOUT_MS });
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

    await prisma.checklistTask.update({
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
    "You are the checklist Evaluator (FlashCard audit mode). Audit the following KnowledgeItem for production quality.",
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
  const res = await callOllamaWithFailover(systemPrompt, userPrompt, STAGE_MODELS.JUDGE, { timeoutMs: JUDGE_STAGE_TIMEOUT_MS });
  const raw = unifyObject(res);

  if (!raw || !raw.decision) {
    return {
      processingStatus: "CHECKED",
      reviewStatus: "PENDING",
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
            reviewStatus: "PENDING",
            userAnnotation: `Hallucination in claim: "${claim.claim}"`,
          };
        }
      }
    }
  }

  const isVerified = raw.decision === "VERIFIED";
  return {
    processingStatus: isVerified ? "VERIFIED" : "DRAFT",
    reviewStatus: "PENDING",
    confidenceScore: parseBoundedInt(raw.confidenceScore, 1, 10),
    evidence: { claims: raw.claims },
    userAnnotation: raw.reason || "Processed.",
    promptName: "evaluator-audit",
    promptVersion: "1.0.0",
    modelName: STAGE_MODELS.JUDGE[0],
    temperature: 0.1,
    lastAuditedAt: new Date(),
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
