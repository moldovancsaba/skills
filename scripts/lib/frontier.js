/**
 * TRINITY FRONTIER SELECTOR
 * M3.1 — Top-3 with Multi-Factor Scoring and Three-Tier Fallback
 * v1.0.0
 *
 * Implements the recompute_frontier function from Trinity formal production definition §15.
 *
 * The Frontier is the bounded surface of at most 3 items surfaced to the user.
 * Selection uses a multi-factor scoring function:
 *   frontierScore = stateWeight × qualityWeight × urgencyWeight × freshnessWeight × feedbackWeight × priorityWeight
 *
 * Three-tier fallback (§15.5):
 *   Tier 1: EVALUATED candidates
 *   Tier 2: REFINED candidates (if tier 1 is insufficient)
 *   Tier 3: GENERATED candidates (if tier 2 is insufficient)
 *
 * MANDATORY (§24): Frontier MUST NOT be empty when any eligible candidates exist.
 * MANDATORY: Duplicate cluster siblings MUST NOT appear simultaneously.
 */
const { CandidateState } = require("./lifecycle");

// ---------------------------------------------------------------------------
// 1. Configuration
// ---------------------------------------------------------------------------

const FRONTIER_MAX_SIZE = 3;

// State weights per spec §15.3
const STATE_WEIGHTS = {
  [CandidateState.EVALUATED]:  1.00,
  [CandidateState.REFINED]:    0.72,
  [CandidateState.GENERATED]:  0.45,
};

// Rot threshold — candidates older than this are excluded from frontier (unless fallback)
const ROT_DAYS = 14;

// ---------------------------------------------------------------------------
// 2. Frontier Score Computation
// ---------------------------------------------------------------------------

/**
 * Computes the multi-factor frontier score for a single candidate.
 *
 * @param {object} candidate - NBAItem record
 * @returns {number} frontier score (higher = more surfaceable)
 */
function computeFrontierScore(candidate) {
  const stateWeight = STATE_WEIGHTS[candidate.candidateState] ?? 0.45;

  const qualityWeight = candidate.qualityScore !== null && candidate.qualityScore !== undefined
    ? candidate.qualityScore
    : (candidate.iceScore || 0) / 1000; // normalize legacy ICE

  const urgencyWeight = candidate.urgencyScore !== null && candidate.urgencyScore !== undefined
    ? candidate.urgencyScore
    : (candidate.impact || 5) / 10;

  const freshnessWeight = candidate.freshnessScore !== null && candidate.freshnessScore !== undefined
    ? candidate.freshnessScore
    : computeImpliedFreshness(candidate);

  const feedbackWeight = normalizeFeedbackScore(candidate.feedbackScore || 0);

  // Priority boost for explicitly topic-pinned or high-ICE items
  const priorityWeight = candidate.iceScore >= 500 ? 1.1 : 1.0;

  return stateWeight * qualityWeight * urgencyWeight * freshnessWeight * feedbackWeight * priorityWeight;
}

function computeImpliedFreshness(candidate) {
  const ageMs = Date.now() - new Date(candidate.updatedAt || candidate.createdAt || Date.now()).getTime();
  const windowMs = 30 * 24 * 60 * 60 * 1000;
  return Math.max(0.1, 1 - ageMs / windowMs);
}

function normalizeFeedbackScore(raw) {
  // Clamp accumulated feedback signal to [0.5, 2.0] multiplier range
  if (raw > 0) return Math.min(2.0, 1.0 + raw * 0.1);
  if (raw < 0) return Math.max(0.5, 1.0 + raw * 0.1);
  return 1.0;
}

function isRotten(candidate) {
  if (candidate.rottenAt) {
    return new Date(candidate.rottenAt) < new Date();
  }
  // Implied rot: item hasn't been touched in ROT_DAYS
  const lastTouch = new Date(candidate.updatedAt || candidate.createdAt || Date.now());
  const rotThreshold = new Date(Date.now() - ROT_DAYS * 24 * 60 * 60 * 1000);
  return lastTouch < rotThreshold;
}

// ---------------------------------------------------------------------------
// 3. Duplicate Cluster Collapse
// ---------------------------------------------------------------------------

/**
 * Collapses duplicate clusters so that only one member per cluster can
 * appear on the frontier at a time. Keeps the highest-scored member.
 *
 * @param {object[]} candidates - Scored candidates
 * @returns {object[]} De-duplicated candidates
 */
function collapseDuplicateClusters(candidates) {
  const clusterChampions = new Map(); // clusterId → best candidate

  for (const c of candidates) {
    if (!c.duplicateClusterId) continue;
    const current = clusterChampions.get(c.duplicateClusterId);
    if (!current || c._frontierScore > current._frontierScore) {
      clusterChampions.set(c.duplicateClusterId, c);
    }
  }

  return candidates.filter(c => {
    if (!c.duplicateClusterId) return true;
    return clusterChampions.get(c.duplicateClusterId)?.id === c.id;
  });
}

// ---------------------------------------------------------------------------
// 4. Frontier Eligibility Query
// ---------------------------------------------------------------------------

/**
 * Loads all candidates eligible for frontier consideration for a company.
 * Applies state-tier ordering (EVALUATED first, then REFINED, then GENERATED).
 */
async function loadEligibleCandidates(prisma, companyId) {
  const statePriority = [CandidateState.EVALUATED, CandidateState.REFINED, CandidateState.GENERATED];

  const candidates = await prisma.nBAItem.findMany({
    where: {
      companyId,
      candidateState: { in: statePriority },
      activityState: { in: ["ACTIVE", "STALE"] },
      processingStatus: { in: ["VERIFIED", "CHECKED", "DRAFT"] },
    },
    orderBy: [
      { iceScore: "desc" },
      { updatedAt: "desc" },
    ],
    take: 200, // Load enough to rank from
  });

  return candidates;
}

// ---------------------------------------------------------------------------
// 5. Main Frontier Computation
// ---------------------------------------------------------------------------

/**
 * Computes and persists the frontier for a company.
 * Returns the list of NBAItem IDs that are now on the frontier.
 *
 * This function replaces refillChecklistFromBacklog.
 *
 * @param {PrismaClient} prisma
 * @param {object} company
 * @param {string} [cycleRunId]
 * @returns {string[]} IDs of items now on the frontier
 */
async function recomputeFrontier(prisma, company, cycleRunId = null) {
  const companyId = company.id;

  // 1. Load all eligible candidates
  const all = await loadEligibleCandidates(prisma, companyId);

  if (all.length === 0) {
    console.log(`[FRONTIER] ${company.name}: No eligible candidates found.`);
    return [];
  }

  // 2. Attach frontier scores
  const scored = all.map(c => ({ ...c, _frontierScore: computeFrontierScore(c) }));

  // 3. Remove rotten items (unless they are the last resort)
  const fresh = scored.filter(c => !isRotten(c));
  const pool = fresh.length > 0 ? fresh : scored; // fallback: allow rotten if nothing else

  // 4. Collapse duplicate clusters
  const deduplicated = collapseDuplicateClusters(pool);

  // 5. Sort by frontier score descending
  deduplicated.sort((a, b) => b._frontierScore - a._frontierScore);

  // 6. Three-tier fallback selection
  let frontier = [];
  for (const state of [CandidateState.EVALUATED, CandidateState.REFINED, CandidateState.GENERATED]) {
    if (frontier.length >= FRONTIER_MAX_SIZE) break;
    const tierCandidates = deduplicated.filter(c => c.candidateState === state);
    const needed = FRONTIER_MAX_SIZE - frontier.length;
    frontier = frontier.concat(tierCandidates.slice(0, needed));
  }

  console.log(`[FRONTIER] ${company.name}: Selected ${frontier.length} items (max ${FRONTIER_MAX_SIZE}). Pool size: ${deduplicated.length}.`);

  // 7. Mark selected items as scheduled (surface them)
  const frontierIds = frontier.map(c => c.id);

  // Remove scheduledDate from items no longer on frontier
  await prisma.nBAItem.updateMany({
    where: {
      companyId,
      scheduledDate: { not: null },
      id: { notIn: frontierIds },
      activityState: { in: ["ACTIVE", "STALE"] },
    },
    data: { scheduledDate: null },
  });

  // Set scheduledDate on frontier items (makes them visible to the NBA API)
  for (const item of frontier) {
    await prisma.nBAItem.update({
      where: { id: item.id },
      data: {
        scheduledDate: new Date(),
        cycleRunId: cycleRunId || item.cycleRunId,
      },
    });
  }

  return frontierIds;
}

/**
 * Backward-compatible Icebox refill — now delegates to recomputeFrontier.
 * Kept so that maintenance.js callers continue to work without changes.
 */
async function refillChecklistFromBacklog(prisma, company) {
  return recomputeFrontier(prisma, company);
}

// ---------------------------------------------------------------------------
// 6. Trigger: recompute frontier after each feedback event
// ---------------------------------------------------------------------------

/**
 * Should be called after any ACCEPT, DECLINE, or DELIVER feedback event.
 */
async function triggerFrontierRecompute(prisma, companyId) {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (company) await recomputeFrontier(prisma, company);
}

module.exports = {
  recomputeFrontier,
  refillChecklistFromBacklog,
  triggerFrontierRecompute,
  computeFrontierScore,
  collapseDuplicateClusters,
  loadEligibleCandidates,
  FRONTIER_MAX_SIZE,
  STATE_WEIGHTS,
};
