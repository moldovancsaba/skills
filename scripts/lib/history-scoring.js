const { clampMetric } = require("../../src/lib/scoring-contract");
const { similarity } = require("./shared");

const HISTORY_CACHE = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;
const HISTORY_LIMIT = 250;

const FLASHCARD_REVIEW_SIGNAL = Object.freeze({
  ACCEPTED: 1.2,
  MODIFIED_ACCEPTED: 1.5,
  DECLINED: -1.4,
});

const TASK_ACTION_SIGNAL = Object.freeze({
  ACCEPT: 1.0,
  MODIFY_ACCEPT: 1.3,
  DELIVER: 2.6,
  DECLINE: -1.7,
});

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeTags(value) {
  return Array.isArray(value)
    ? value.map((item) => normalizeText(item).toLowerCase()).filter(Boolean)
    : [];
}

function combinedSimilarity(a = {}, b = {}) {
  const titleSim = similarity(normalizeText(a.title), normalizeText(b.title));
  const bodySim = similarity(
    normalizeText(a.body ?? a.description),
    normalizeText(b.body ?? b.description),
  );
  const leftTags = new Set(normalizeTags(a.hashtags));
  const rightTags = new Set(normalizeTags(b.hashtags));
  const overlap = [...leftTags].filter((tag) => rightTags.has(tag)).length;
  const tagSim =
    leftTags.size === 0 || rightTags.size === 0
      ? 0
      : overlap / Math.max(leftTags.size, rightTags.size);
  return Number((titleSim * 0.55 + bodySim * 0.3 + tagSim * 0.15).toFixed(4));
}

function toHistorySupportSignal(netSignal) {
  return clampMetric(5 + netSignal * 2.2);
}

function aggregateHistoryOutcome(entries = [], candidate = {}) {
  const scored = entries
    .map((entry) => {
      const sim = combinedSimilarity(entry, candidate);
      if (sim < 0.18) return null;
      const baseSignal = Number(entry.outcomeSignal ?? 0);
      const weightedSignal = sim * Math.abs(baseSignal);
      return {
        sim,
        outcomeSignal: baseSignal,
        weightedSignal,
        impact: clampMetric(entry.impact ?? 5),
        confidence: clampMetric(entry.confidence ?? 5),
      };
    })
    .filter(Boolean);

  if (scored.length === 0) {
    return {
      historyImpact: null,
      historyConfidence: null,
      historySupport: null,
      positiveMatches: 0,
      negativeMatches: 0,
      averageSimilarity: 0,
    };
  }

  const positives = scored.filter((entry) => entry.outcomeSignal > 0);
  const negatives = scored.filter((entry) => entry.outcomeSignal < 0);
  const positiveWeight = positives.reduce((sum, entry) => sum + entry.weightedSignal, 0);
  const negativeWeight = negatives.reduce((sum, entry) => sum + entry.weightedSignal, 0);
  const totalWeight = positiveWeight + negativeWeight;
  const averageSimilarity =
    scored.reduce((sum, entry) => sum + entry.sim, 0) / Math.max(1, scored.length);

  const positiveImpact = positiveWeight > 0
    ? positives.reduce((sum, entry) => sum + entry.impact * entry.weightedSignal, 0) / positiveWeight
    : null;
  const positiveConfidence = positiveWeight > 0
    ? positives.reduce((sum, entry) => sum + entry.confidence * entry.weightedSignal, 0) / positiveWeight
    : null;

  const supportDelta = totalWeight > 0 ? (positiveWeight - negativeWeight) / totalWeight : 0;
  const historySupport = toHistorySupportSignal(supportDelta);

  return {
    historyImpact: positiveImpact == null ? null : clampMetric((positiveImpact + historySupport) / 2),
    historyConfidence: positiveConfidence == null ? historySupport : clampMetric((positiveConfidence + historySupport) / 2),
    historySupport,
    positiveMatches: positives.length,
    negativeMatches: negatives.length,
    averageSimilarity: Number(averageSimilarity.toFixed(3)),
  };
}

function aggregateTaskDifficultyHistory(entries = [], candidate = {}) {
  const scored = entries
    .map((entry) => {
      const sim = combinedSimilarity(entry, candidate);
      if (sim < 0.18) return null;
      return {
        sim,
        action: entry.action,
        ease: clampMetric(entry.ease ?? 5),
      };
    })
    .filter(Boolean);

  if (scored.length === 0) {
    return {
      historyEase: null,
      historyDifficulty: null,
      deliveredMatches: 0,
      acceptedMatches: 0,
      frictionMatches: 0,
    };
  }

  const delivered = scored.filter((entry) => entry.action === "DELIVER");
  const accepted = scored.filter((entry) => entry.action === "ACCEPT" || entry.action === "MODIFY_ACCEPT");
  const friction = scored.filter((entry) => entry.action === "DECLINE" || entry.action === "ACCEPT" || entry.action === "MODIFY_ACCEPT");

  const weightedAverage = (entriesForAverage) => {
    if (entriesForAverage.length === 0) return null;
    const total = entriesForAverage.reduce((sum, entry) => sum + entry.sim, 0);
    return total > 0
      ? entriesForAverage.reduce((sum, entry) => sum + entry.ease * entry.sim, 0) / total
      : null;
  };

  const deliveredEase = weightedAverage(delivered);
  const acceptedEase = weightedAverage(accepted);
  const frictionWeight = friction.reduce((sum, entry) => sum + entry.sim, 0);
  const deliveredWeight = delivered.reduce((sum, entry) => sum + entry.sim, 0);
  const totalWeight = Math.max(0.001, frictionWeight + deliveredWeight);
  const frictionDelta = (frictionWeight - deliveredWeight) / totalWeight;
  const historyDifficulty = clampMetric(5 + frictionDelta * 2.5);
  const difficultyEase = clampMetric(11 - historyDifficulty);
  const blendedEase = deliveredEase == null
    ? acceptedEase == null
      ? difficultyEase
      : clampMetric((acceptedEase + difficultyEase) / 2)
    : acceptedEase == null
      ? clampMetric((deliveredEase + difficultyEase) / 2)
      : clampMetric((deliveredEase * 2 + acceptedEase + difficultyEase) / 4);

  return {
    historyEase: blendedEase,
    historyDifficulty,
    deliveredMatches: delivered.length,
    acceptedMatches: accepted.length,
    frictionMatches: friction.length,
  };
}

async function loadCompanyHistory(prisma, companyId) {
  const cacheKey = String(companyId);
  const cached = HISTORY_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const [flashcards, feedback] = await Promise.all([
    prisma.flashcard.findMany({
      where: {
        companyId,
        reviewStatus: { in: ["ACCEPTED", "MODIFIED_ACCEPTED", "DECLINED"] },
      },
      orderBy: { updatedAt: "desc" },
      take: HISTORY_LIMIT,
      select: {
        id: true,
        title: true,
        body: true,
        hashtags: true,
        impact: true,
        confidenceScore: true,
        reviewStatus: true,
      },
    }),
    prisma.feedback.findMany({
      where: {
        checklistTask: { companyId },
        action: { in: ["ACCEPT", "MODIFY_ACCEPT", "DECLINE", "DELIVER"] },
      },
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT,
      select: {
        action: true,
        modifiedTitle: true,
        modifiedDescription: true,
        checklistTask: {
          select: {
            title: true,
            description: true,
            hashtags: true,
            impact: true,
            confidenceScore: true,
            ease: true,
          },
        },
      },
    }),
  ]);

  const value = {
    flashcards: flashcards.map((card) => ({
      title: card.title,
      body: card.body,
      hashtags: card.hashtags,
      impact: card.impact,
      confidence: card.confidenceScore,
      outcomeSignal: FLASHCARD_REVIEW_SIGNAL[card.reviewStatus] ?? 0,
    })),
    tasks: feedback.map((entry) => ({
      title: entry.modifiedTitle || entry.checklistTask?.title,
      description: entry.modifiedDescription || entry.checklistTask?.description,
      hashtags: entry.checklistTask?.hashtags || [],
      impact: entry.checklistTask?.impact,
      confidence: entry.checklistTask?.confidenceScore,
      ease: entry.checklistTask?.ease,
      action: entry.action,
      outcomeSignal: TASK_ACTION_SIGNAL[entry.action] ?? 0,
    })),
  };

  HISTORY_CACHE.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value,
  });
  return value;
}

async function computeHistoryAwareKnowledgeSignals(prisma, companyId, candidate = {}) {
  const history = await loadCompanyHistory(prisma, companyId);
  return aggregateHistoryOutcome(history.flashcards, candidate);
}

async function computeHistoryAwareTaskSignals(prisma, companyId, candidate = {}) {
  const history = await loadCompanyHistory(prisma, companyId);
  return {
    ...aggregateHistoryOutcome(history.tasks, candidate),
    ...aggregateTaskDifficultyHistory(history.tasks, candidate),
  };
}

module.exports = {
  computeHistoryAwareKnowledgeSignals,
  computeHistoryAwareTaskSignals,
};
