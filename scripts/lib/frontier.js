/**
 * Frontier placement and tactical horizon orchestration.
 *
 * Recomputes planning/checklist placement across the five tactical horizons
 * while preserving explicit human ordering anchors where they exist.
 */
const { CandidateState } = require("./lifecycle");
const { recordDecisionEvent, recordOutcomeEvent } = require("./audit-ledger");
const { computeBlendedPriorityProfile, computePriorityCohortProfiles } = require("../../src/lib/scoring-contract");

// ---------------------------------------------------------------------------
// 1. Configuration
// ---------------------------------------------------------------------------

const FRONTIER_MAX_SIZE = 3;
const PRIORITY_THRESHOLD = Object.freeze({
  CHECKLIST: 700,
  TODO: 500,
  BACKLOG: 250,
  ROADMAP: 100,
});

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
  return computeBlendedPriorityProfile({
    ...candidate,
    memoryMultiplier: candidate._memoryMultiplier ?? 1,
  }).score;
}

function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 4);
}

function computeFrontierMemoryMultiplier(candidate, entries = []) {
  if (!entries.length) return 1.0;

  const candidateTokens = new Set([
    ...tokenize(candidate.title),
    ...tokenize(candidate.description),
    ...((candidate.hashtags || []).map((tag) => String(tag || "").toLowerCase().replace(/^#/, ""))),
  ]);

  if (candidateTokens.size === 0) return 1.0;

  let multiplier = 1.0;
  for (const entry of entries) {
    const entryTokens = tokenize(entry.lessonContent);
    const overlap = entryTokens.filter((token) => candidateTokens.has(token)).length;
    if (overlap < 2) continue;

    if (entry.lessonType === "HARD_CONSTRAINT" || entry.lessonType === "ANTI_PATTERN") {
      multiplier *= 0.9;
    } else if (entry.lessonType === "SUCCESS_PATTERN" || entry.lessonType === "SOFT_PREFERENCE") {
      multiplier *= 1.08;
    }
  }

  return Math.max(0.6, Math.min(1.4, multiplier));
}

async function loadFrontierMemoryEntries(prisma, companyId) {
  const thirtyDaysAgo = new Date(Date.now() - ROT_DAYS * 24 * 60 * 60 * 1000 * 2);
  return prisma.memoryEntry.findMany({
    where: {
      companyId,
      active: true,
      lessonType: { in: ["HARD_CONSTRAINT", "ANTI_PATTERN", "SOFT_PREFERENCE", "SUCCESS_PATTERN"] },
      createdAt: { gte: thirtyDaysAgo },
    },
    orderBy: [{ weight: "desc" }, { updatedAt: "desc" }],
    take: 20,
  });
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
      { updatedAt: "asc" },
      { createdAt: "asc" },
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
  const frontierMemoryEntries = await loadFrontierMemoryEntries(prisma, companyId);

  if (all.length === 0) {
    console.log(`[KANBAN] ${company.name}: No eligible candidates found.`);
    return [];
  }

  // 2. Attach scores
  const scoredInputs = all.map((candidate) => ({
    ...candidate,
    _memoryMultiplier: computeFrontierMemoryMultiplier(candidate, frontierMemoryEntries),
  }));
  const scoredProfiles = computePriorityCohortProfiles(
    scoredInputs.map((candidate) => ({
      ...candidate,
      memoryMultiplier: candidate._memoryMultiplier,
    })),
  );
  const scored = scoredInputs.map((candidate, index) => {
    const priorityProfile = scoredProfiles[index];
    return {
      ...candidate,
      _priorityProfile: priorityProfile,
      _frontierScore: priorityProfile.score,
    };
  });

  // 3. Remove rotten items (unless they are the last resort)
  const fresh = scored.filter(c => !isRotten(c));
  const pool = fresh.length > 0 ? fresh : scored;

  // 4. Collapse duplicate clusters
  const deduplicated = collapseDuplicateClusters(pool);

  // 5. Global Rank by frontier score descending
  deduplicated.sort((left, right) => {
    const leftProfile = left._priorityProfile || { components: {} };
    const rightProfile = right._priorityProfile || { components: {} };
    if ((right._frontierScore || 0) !== (left._frontierScore || 0)) {
      return (right._frontierScore || 0) - (left._frontierScore || 0);
    }
    if ((rightProfile.components?.human || 0) !== (leftProfile.components?.human || 0)) {
      return (rightProfile.components?.human || 0) - (leftProfile.components?.human || 0);
    }
    if ((rightProfile.components?.urgency || 0) !== (leftProfile.components?.urgency || 0)) {
      return (rightProfile.components?.urgency || 0) - (leftProfile.components?.urgency || 0);
    }
    if ((rightProfile.components?.risk || 0) !== (leftProfile.components?.risk || 0)) {
      return (rightProfile.components?.risk || 0) - (leftProfile.components?.risk || 0);
    }
    if ((rightProfile.components?.freshness || 0) !== (leftProfile.components?.freshness || 0)) {
      return (rightProfile.components?.freshness || 0) - (leftProfile.components?.freshness || 0);
    }
    return new Date(left.updatedAt || left.createdAt || 0) - new Date(right.updatedAt || right.createdAt || 0);
  });

  // ---------------------------------------------------------------------------
  // 6. Blended-Priority Column Distribution (§24)
  // ---------------------------------------------------------------------------
  // Cards earn their AI-selected column by blended priority, not raw ICE alone.
  // ICE remains the visible card score; frontier placement blends ICE, quality,
  // urgency, freshness, human signal, risk, lifecycle state, and memory signal.
  // Thresholds are intentional gates — a card must improve to advance.
  //
  //   CHECKLIST  : priority >= 700 (hard-capped at FRONTIER_MAX_SIZE = 3)
  //   TODO       : priority >= 500
  //   BACKLOG    : priority >= 250
  //   ROADMAP    : priority >= 100
  //   IDEABANK   : priority <  100  (default holding pen for all new cards)

  const columnMap = [
    { items: [], column: "CHECKLIST" },
    { items: [], column: "TODO" },
    { items: [], column: "BACKLOG" },
    { items: [], column: "ROADMAP" },
    { items: [], column: "IDEABANK" },
  ];

  const rankCount = deduplicated.length;
  const relativeBandForIndex = (index) => {
    const percentile = rankCount <= 1 ? 1 : 1 - index / (rankCount - 1);
    if (index < FRONTIER_MAX_SIZE) return "CHECKLIST";
    if (percentile >= 0.82) return "TODO";
    if (percentile >= 0.52) return "BACKLOG";
    if (percentile >= 0.24) return "ROADMAP";
    return "IDEABANK";
  };

  for (const [index, item] of deduplicated.entries()) {
    const targetByRank = relativeBandForIndex(index);

    // Respect user-set hard priority (sortOrder < 0) — Anchor in their current column
    if (item.sortOrder < 0 && item.kanbanColumn) {
      const targetCol = columnMap.find(c => c.column === item.kanbanColumn) || columnMap[4];
      
      // Special case: CHECKLIST (Now) has a hard cap of 3
      if (item.kanbanColumn === "CHECKLIST" && columnMap[0].items.length >= FRONTIER_MAX_SIZE) {
        columnMap[1].items.push(item); // Overflow to TODO (Next)
      } else {
        targetCol.items.push(item);
      }
    } else if (targetByRank === "CHECKLIST" && columnMap[0].items.length < FRONTIER_MAX_SIZE) {
      columnMap[0].items.push(item);
    } else if (targetByRank === "TODO") {
      columnMap[1].items.push(item);
    } else if (targetByRank === "BACKLOG") {
      columnMap[2].items.push(item);
    } else if (targetByRank === "ROADMAP") {
      columnMap[3].items.push(item);
    } else {
      columnMap[4].items.push(item);
    }
  }

  console.log(`[KANBAN] ${company.name}: Orchestrating ${deduplicated.length} items across 5 columns.`);

  for (const [rank, item] of deduplicated.entries()) {
    const targetColumn = columnMap.find((group) => group.items.some((candidate) => candidate.id === item.id))?.column || item.kanbanColumn || "IDEABANK";
    await recordDecisionEvent(prisma, {
      companyId,
      decisionMaker: "frontier-orchestrator",
      decisionType: "KANBAN_COLUMN_ASSIGNMENT",
      entityType: "TASK",
      entityId: item.id,
      beforeState: {
        kanbanColumn: item.kanbanColumn,
        sortOrder: item.sortOrder,
        iceScore: item.iceScore,
        candidateState: item.candidateState,
      },
      afterState: {
        kanbanColumn: targetColumn,
        frontierRank: rank + 1,
      },
      payload: {
        blendedPriorityScore: item._frontierScore,
        priorityProfile: item._priorityProfile,
        checklistThreshold: PRIORITY_THRESHOLD.CHECKLIST,
        todoThreshold: PRIORITY_THRESHOLD.TODO,
        backlogThreshold: PRIORITY_THRESHOLD.BACKLOG,
        roadmapThreshold: PRIORITY_THRESHOLD.ROADMAP,
        manualPriority: item.sortOrder < 0,
        memoryMultiplier: item._memoryMultiplier ?? 1,
      },
      rationale: item.sortOrder < 0
        ? "User-prioritized hard anchor respected during blended-priority frontier recompute"
        : `Column assigned by blended priority: ${item._priorityProfile?.reasons?.join(", ") ?? "no reasons"}`,
      teachingWeight: targetColumn === "CHECKLIST" ? 80 : 60,
      cycleRunId,
    });
  }

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

    for (const item of group.items) {
      if (item.kanbanColumn !== group.column) {
        await recordOutcomeEvent(prisma, {
          companyId,
          actorType: "AI",
          actorId: "frontier-orchestrator",
          entityType: "TASK",
          entityId: item.id,
          outcomeType: "KANBAN_REASSIGNMENT",
          outcomeValue: group.column,
          beforeState: {
            kanbanColumn: item.kanbanColumn,
          },
          afterState: {
            kanbanColumn: group.column,
            scheduledDate: group.column === "CHECKLIST" ? new Date() : null,
          },
          payload: {
            blendedPriorityScore: item._frontierScore,
            priorityProfile: item._priorityProfile,
          },
          teachingWeight: group.column === "CHECKLIST" ? 80 : 60,
          cycleRunId,
        });
      }
    }

    // Handle sortOrder for manual overrides - only reset if it was 0
    // We don't want to wipe the user's "hard feedback"
  }

  // Final cleanup for items no longer eligible (e.g. archived)
  // Handled byprisma query filters in loadEligibleCandidates

  const checklist = columnMap[0].items;
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
