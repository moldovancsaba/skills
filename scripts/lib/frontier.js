/**
 * TRINITY FRONTIER ORCHESTRATOR
 * M3.1 — 5-Horizon Kanban Distribution & Manual Priority Harvesting
 * v1.2.0-PRODUCTION
 *
 * Implements the recomputeFrontier function from Trinity formal production definition §15.
 * 
 * Orchestrates taskcards across 5 tactical horizons based on ICE thresholds (§24):
 *   - CHECKLIST: ICE >= 700 (max 3, unless manual)
 *   - TODO:      ICE >= 500
 *   - BACKLOG:   ICE >= 250
 *   - ROADMAP:   ICE >= 100
 *   - IDEABANK:  ICE < 100
 *
 * Manual Priority (§24.5):
 *   User-defined drags set sortOrder < 0. These are "Hard Anchors" that override 
 *   ICE thresholds and force the candidate to the CHECKLIST/TODO horizons.
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

  // Kanban Manual Priority Override (§24)
  // userPriority is represented by sortOrder. If sortOrder < 0, it acts as a massive boost.
  const userPriorityMultiplier = candidate.sortOrder < 0 ? Math.abs(candidate.sortOrder) * 10 : 1.0;

  return stateWeight * qualityWeight * urgencyWeight * freshnessWeight * feedbackWeight * priorityWeight * userPriorityMultiplier;
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
// 5. Main Frontier & Kanban Orchestration
// ---------------------------------------------------------------------------

/**
 * Computes and persists the tactical distribution (Kanban) for a company.
 * Reorganizes all eligible items into IDEABANK, ROADMAP, BACKLOG, TODO, and CHECKLIST.
 *
 * @param {PrismaClient} prisma
 * @param {object} company
 * @param {string} [cycleRunId]
 * @returns {string[]} IDs of items now on the CHECKLIST
 */
async function recomputeFrontier(prisma, company, cycleRunId = null) {
  const companyId = company.id;

  // 1. Load all eligible candidates
  const all = await loadEligibleCandidates(prisma, companyId);

  if (all.length === 0) {
    console.log(`[KANBAN] ${company.name}: No eligible candidates found.`);
    return [];
  }

  // 2. Attach scores
  const scored = all.map(c => ({ ...c, _frontierScore: computeFrontierScore(c) }));

  // 3. Remove rotten items (unless they are the last resort)
  const fresh = scored.filter(c => !isRotten(c));
  const pool = fresh.length > 0 ? fresh : scored;

  // 4. Collapse duplicate clusters
  const deduplicated = collapseDuplicateClusters(pool);

  // 5. Global Rank by frontier score descending
  deduplicated.sort((a, b) => b._frontierScore - a._frontierScore);

  // ---------------------------------------------------------------------------
  // 6. ICE-Threshold Column Distribution (§24)
  // ---------------------------------------------------------------------------
  // Cards earn their column by ICE score. Higher ICE = closer to execution.
  // Thresholds are intentional gates — a card must improve to advance.
  //
  //   CHECKLIST  : ICE >= 700 (hard-capped at FRONTIER_MAX_SIZE = 3)
  //   TODO       : ICE >= 500
  //   BACKLOG    : ICE >= 250
  //   ROADMAP    : ICE >= 100
  //   IDEABANK   : ICE <  100  (default holding pen for all new cards)

  const ICE_THRESHOLD = {
    CHECKLIST: 700,
    TODO:      500,
    BACKLOG:   250,
    ROADMAP:   100,
  };

  const columnMap: { items: typeof deduplicated; column: string }[] = [
    { items: [], column: "CHECKLIST" },
    { items: [], column: "TODO" },
    { items: [], column: "BACKLOG" },
    { items: [], column: "ROADMAP" },
    { items: [], column: "IDEABANK" },
  ];

  for (const item of deduplicated) {
    const ice = item.iceScore || 0;

    // Respect user-set hard priority (sortOrder < 0) — always surface to CHECKLIST
    if (item.sortOrder < 0) {
      if (columnMap[0].items.length < FRONTIER_MAX_SIZE) {
        columnMap[0].items.push(item);
      } else {
        columnMap[1].items.push(item); // overflow to TODO
      }
    } else if (ice >= ICE_THRESHOLD.CHECKLIST && columnMap[0].items.length < FRONTIER_MAX_SIZE) {
      columnMap[0].items.push(item);
    } else if (ice >= ICE_THRESHOLD.TODO) {
      columnMap[1].items.push(item);
    } else if (ice >= ICE_THRESHOLD.BACKLOG) {
      columnMap[2].items.push(item);
    } else if (ice >= ICE_THRESHOLD.ROADMAP) {
      columnMap[3].items.push(item);
    } else {
      columnMap[4].items.push(item);
    }
  }

  console.log(`[KANBAN] ${company.name}: Orchestrating ${deduplicated.length} items across 5 columns.`);

  // 7. Persist Column State
  for (const group of columnMap) {
    if (group.items.length === 0) continue;
    
    const ids = group.items.map(i => i.id);
    
    // Update column and clearing scheduledDate if not in CHECKLIST
    await prisma.nBAItem.updateMany({
      where: { id: { in: ids } },
      data: { 
        kanbanColumn: group.column,
        scheduledDate: group.column === "CHECKLIST" ? new Date() : null,
        cycleRunId: cycleRunId || undefined
      }
    });

    // Handle sortOrder for manual overrides - only reset if it was 0
    // We don't want to wipe the user's "hard feedback"
  }

  // Final cleanup for items no longer eligible (e.g. archived)
  // Handled byprisma query filters in loadEligibleCandidates

  return checklist.map(i => i.id);
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
