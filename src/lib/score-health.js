const { computePriorityCohortProfiles } = require("./scoring-contract");

const globalForScoreHealth = globalThis;
function createDefaultPrismaClient() {
  const { PrismaClient } = require("@prisma/client");
  return new PrismaClient({
    log: ["error"],
  });
}

function getDefaultPrisma() {
  if (!globalForScoreHealth.__scoreHealthPrisma) {
    globalForScoreHealth.__scoreHealthPrisma = createDefaultPrismaClient();
  }
  return globalForScoreHealth.__scoreHealthPrisma;
}

const defaultPrisma = new Proxy(
  {},
  {
    get(_target, property) {
      const prisma = getDefaultPrisma();
      const value = prisma[property];
      return typeof value === "function" ? value.bind(prisma) : value;
    },
  },
);

const SCORE_HEALTH_THRESHOLDS = Object.freeze({
  exactScoreShare: Object.freeze({
    healthyMax: 0.05,
    warningMin: 0.05,
    suspiciousMin: 0.08,
    criticalMin: 0.12,
  }),
  exactTupleShare: Object.freeze({
    healthyMax: 0.01,
    warningMin: 0.01,
    suspiciousMin: 0.03,
    criticalMin: 0.08,
  }),
  uniqueTupleRatio: Object.freeze({
    healthyMin: 0.3,
    warningMax: 0.3,
    suspiciousMax: 0.2,
    criticalMax: 0.1,
  }),
  priorityBandShare: Object.freeze({
    healthyMax: 0.16,
    warningMin: 0.16,
    suspiciousMin: 0.24,
    criticalMin: 0.35,
  }),
  uniquePriorityRatio: Object.freeze({
    healthyMin: 0.45,
    warningMax: 0.45,
    suspiciousMax: 0.3,
    criticalMax: 0.18,
  }),
});

function roundShare(count, total) {
  if (total <= 0) return 0;
  return Number((count / total).toFixed(4));
}

function normalizeIceValue(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Number(value.toFixed(1));
}

function normalizePriorityValue(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Number(value.toFixed(1));
}

function priorityBandLabel(value, bucketSize = 50) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const start = Math.floor(numeric / bucketSize) * bucketSize;
  const end = start + bucketSize - 1;
  return `${start}-${end}`;
}

function extractProfileTriplet(record, effortKey) {
  const profile = record?.scoreProfile && typeof record.scoreProfile === "object"
    ? record.scoreProfile
    : null;
  const final = profile?.final && typeof profile.final === "object" ? profile.final : null;
  return {
    impact: typeof final?.impact === "number" ? final.impact : record.impact ?? 0,
    confidence: typeof final?.confidence === "number" ? final.confidence : record.confidenceScore ?? 0,
    effort: typeof final?.effort === "number" ? final.effort : record[effortKey] ?? 0,
    iceScore: typeof final?.iceScore === "number" ? final.iceScore : record.iceScore,
  };
}

function resolveShareSeverity(share, thresholds) {
  if (share >= thresholds.criticalMin) return "CRITICAL";
  if (share >= thresholds.suspiciousMin) return "SUSPICIOUS";
  if (share >= thresholds.warningMin) return "WARNING";
  return "HEALTHY";
}

function resolveRatioSeverity(ratio, thresholds) {
  if (ratio <= thresholds.criticalMax) return "CRITICAL";
  if (ratio <= thresholds.suspiciousMax) return "SUSPICIOUS";
  if (ratio <= thresholds.warningMax) return "WARNING";
  return "HEALTHY";
}

function severityRank(severity) {
  switch (severity) {
    case "CRITICAL":
      return 3;
    case "SUSPICIOUS":
      return 2;
    case "WARNING":
      return 1;
    default:
      return 0;
  }
}

function maxSeverity(...severities) {
  return severities.reduce((best, current) =>
    severityRank(current) > severityRank(best) ? current : best,
  "HEALTHY");
}

function makeAlert(scope, metric, severity, actualShare, thresholdShare, detail) {
  return {
    scope,
    metric,
    severity,
    actualShare,
    thresholdShare,
    detail,
  };
}

function buildSurfaceAlerts(scope, metrics) {
  const alerts = [];
  const scoreSeverity = resolveShareSeverity(metrics.dominantIceShare, SCORE_HEALTH_THRESHOLDS.exactScoreShare);
  const tupleSeverity = metrics.dominantTuple ? resolveShareSeverity(metrics.dominantTuple.share, SCORE_HEALTH_THRESHOLDS.exactTupleShare) : "HEALTHY";
  const diversitySeverity = resolveRatioSeverity(metrics.diversityRatio, SCORE_HEALTH_THRESHOLDS.uniqueTupleRatio);

  if (severityRank(scoreSeverity) > 0 && metrics.dominantIceScore !== null) {
    alerts.push(
      makeAlert(
        scope,
        "dominantIceScore",
        scoreSeverity,
        metrics.dominantIceShare,
        scoreSeverity === "WARNING"
          ? SCORE_HEALTH_THRESHOLDS.exactScoreShare.warningMin
          : scoreSeverity === "SUSPICIOUS"
            ? SCORE_HEALTH_THRESHOLDS.exactScoreShare.suspiciousMin
            : SCORE_HEALTH_THRESHOLDS.exactScoreShare.criticalMin,
        `Exact ICE ${metrics.dominantIceScore} owns ${Math.round(metrics.dominantIceShare * 100)}% of ${scope.toLowerCase()} cards.`,
      ),
    );
  }

  if (severityRank(tupleSeverity) > 0 && metrics.dominantTuple) {
    alerts.push(
      makeAlert(
        scope,
        "dominantTuple",
        tupleSeverity,
        metrics.dominantTuple.share,
        tupleSeverity === "WARNING"
          ? SCORE_HEALTH_THRESHOLDS.exactTupleShare.warningMin
          : tupleSeverity === "SUSPICIOUS"
            ? SCORE_HEALTH_THRESHOLDS.exactTupleShare.suspiciousMin
            : SCORE_HEALTH_THRESHOLDS.exactTupleShare.criticalMin,
        `Exact tuple ${metrics.dominantTuple.label} owns ${Math.round(metrics.dominantTuple.share * 100)}% of ${scope.toLowerCase()} cards.`,
      ),
    );
  }

  if (severityRank(diversitySeverity) > 0) {
    alerts.push(
      makeAlert(
        scope,
        "uniqueTupleRatio",
        diversitySeverity,
        metrics.diversityRatio,
        diversitySeverity === "WARNING"
          ? SCORE_HEALTH_THRESHOLDS.uniqueTupleRatio.warningMax
          : diversitySeverity === "SUSPICIOUS"
            ? SCORE_HEALTH_THRESHOLDS.uniqueTupleRatio.suspiciousMax
            : SCORE_HEALTH_THRESHOLDS.uniqueTupleRatio.criticalMax,
        `Only ${Math.round(metrics.diversityRatio * 100)}% of ${scope.toLowerCase()} cards have unique tuples.`,
      ),
    );
  }

  return {
    dominantIceSeverity: scoreSeverity,
    dominantTupleSeverity: tupleSeverity,
    diversitySeverity,
    overallSeverity: maxSeverity(scoreSeverity, tupleSeverity, diversitySeverity),
    alerts,
  };
}

function computeScoreHealthMetrics(records, effortKey) {
  const count = records.length;
  if (count === 0) {
    return {
      count: 0,
      uniqueIceScores: 0,
      uniqueTriples: 0,
      diversityRatio: 0,
      dominantIceScore: null,
      dominantIceShare: 0,
      dominantTuple: null,
      dominantIceSeverity: "HEALTHY",
      dominantTupleSeverity: "HEALTHY",
      diversitySeverity: "HEALTHY",
      overallSeverity: "HEALTHY",
      alerts: [],
    };
  }

  const iceCounts = new Map();
  const tupleCounts = new Map();

  for (const record of records) {
    const profileTriplet = extractProfileTriplet(record, effortKey);
    const normalizedIce = normalizeIceValue(profileTriplet.iceScore);
    if (normalizedIce !== null) {
      iceCounts.set(normalizedIce, (iceCounts.get(normalizedIce) ?? 0) + 1);
    }

    const tupleLabel = `${Number(profileTriplet.impact).toFixed(2)}|${Number(profileTriplet.confidence).toFixed(2)}|${Number(profileTriplet.effort).toFixed(2)}`;
    tupleCounts.set(tupleLabel, (tupleCounts.get(tupleLabel) ?? 0) + 1);
  }

  const dominantIceEntry = [...iceCounts.entries()].sort((left, right) => right[1] - left[1])[0] ?? null;
  const dominantTupleEntry = [...tupleCounts.entries()].sort((left, right) => right[1] - left[1])[0] ?? null;

  const baseMetrics = {
    count,
    uniqueIceScores: iceCounts.size,
    uniqueTriples: tupleCounts.size,
    diversityRatio: Number((tupleCounts.size / count).toFixed(4)),
    dominantIceScore: dominantIceEntry?.[0] ?? null,
    dominantIceShare: dominantIceEntry ? roundShare(dominantIceEntry[1], count) : 0,
    dominantTuple: dominantTupleEntry
      ? {
          label: dominantTupleEntry[0],
          count: dominantTupleEntry[1],
          share: roundShare(dominantTupleEntry[1], count),
        }
      : null,
  };
  return {
    ...baseMetrics,
    ...buildSurfaceAlerts(effortKey === "ease" ? "TASK" : "KNOWLEDGE", baseMetrics),
  };
}

function computePriorityHealthMetrics(records) {
  const count = records.length;
  if (count === 0) {
    return {
      count: 0,
      uniquePriorityScores: 0,
      uniquePriorityBands: 0,
      priorityDiversityRatio: 0,
      dominantPriorityScore: null,
      dominantPriorityShare: 0,
      dominantPriorityBand: null,
      dominantPrioritySeverity: "HEALTHY",
      priorityDiversitySeverity: "HEALTHY",
      overallSeverity: "HEALTHY",
      alerts: [],
    };
  }

  const priorityProfiles = computePriorityCohortProfiles(records);
  const scoreCounts = new Map();
  const bandCounts = new Map();

  for (const profile of priorityProfiles) {
    const normalizedScore = normalizePriorityValue(profile?.score);
    if (normalizedScore !== null) {
      scoreCounts.set(normalizedScore, (scoreCounts.get(normalizedScore) ?? 0) + 1);
    }

    const bandLabel = priorityBandLabel(profile?.score);
    if (bandLabel) {
      bandCounts.set(bandLabel, (bandCounts.get(bandLabel) ?? 0) + 1);
    }
  }

  const dominantScoreEntry = [...scoreCounts.entries()].sort((left, right) => right[1] - left[1])[0] ?? null;
  const dominantBandEntry = [...bandCounts.entries()].sort((left, right) => right[1] - left[1])[0] ?? null;
  const baseMetrics = {
    count,
    uniquePriorityScores: scoreCounts.size,
    uniquePriorityBands: bandCounts.size,
    priorityDiversityRatio: Number((scoreCounts.size / count).toFixed(4)),
    dominantPriorityScore: dominantScoreEntry?.[0] ?? null,
    dominantPriorityShare: dominantScoreEntry ? roundShare(dominantScoreEntry[1], count) : 0,
    dominantPriorityBand: dominantBandEntry
      ? {
          label: dominantBandEntry[0],
          count: dominantBandEntry[1],
          share: roundShare(dominantBandEntry[1], count),
        }
      : null,
  };

  const bandSeverity = baseMetrics.dominantPriorityBand
    ? resolveShareSeverity(baseMetrics.dominantPriorityBand.share, SCORE_HEALTH_THRESHOLDS.priorityBandShare)
    : "HEALTHY";
  const diversitySeverity = resolveRatioSeverity(baseMetrics.priorityDiversityRatio, SCORE_HEALTH_THRESHOLDS.uniquePriorityRatio);
  const alerts = [];

  if (severityRank(bandSeverity) > 0 && baseMetrics.dominantPriorityBand) {
    alerts.push(
      makeAlert(
        "TASK",
        "dominantPriorityBand",
        bandSeverity,
        baseMetrics.dominantPriorityBand.share,
        bandSeverity === "WARNING"
          ? SCORE_HEALTH_THRESHOLDS.priorityBandShare.warningMin
          : bandSeverity === "SUSPICIOUS"
            ? SCORE_HEALTH_THRESHOLDS.priorityBandShare.suspiciousMin
            : SCORE_HEALTH_THRESHOLDS.priorityBandShare.criticalMin,
        `Priority band ${baseMetrics.dominantPriorityBand.label} owns ${Math.round(baseMetrics.dominantPriorityBand.share * 100)}% of active taskcards.`,
      ),
    );
  }

  if (severityRank(diversitySeverity) > 0) {
    alerts.push(
      makeAlert(
        "TASK",
        "uniquePriorityRatio",
        diversitySeverity,
        baseMetrics.priorityDiversityRatio,
        diversitySeverity === "WARNING"
          ? SCORE_HEALTH_THRESHOLDS.uniquePriorityRatio.warningMax
          : diversitySeverity === "SUSPICIOUS"
            ? SCORE_HEALTH_THRESHOLDS.uniquePriorityRatio.suspiciousMax
            : SCORE_HEALTH_THRESHOLDS.uniquePriorityRatio.criticalMax,
        `Only ${Math.round(baseMetrics.priorityDiversityRatio * 100)}% of active taskcards have unique priority scores.`,
      ),
    );
  }

  return {
    ...baseMetrics,
    dominantPrioritySeverity: bandSeverity,
    priorityDiversitySeverity: diversitySeverity,
    overallSeverity: maxSeverity(bandSeverity, diversitySeverity),
    alerts,
  };
}

function resolveScoreHealthBand(taskcards, knowledge) {
  return maxSeverity(taskcards.overallSeverity, taskcards.priorityHealth?.overallSeverity ?? "HEALTHY", knowledge.overallSeverity);
}

async function computeCompanyScoreHealth(companyId, prismaClient = defaultPrisma) {
  const [taskcards, flashcards] = await Promise.all([
    prismaClient.checklistTask.findMany({
      where: {
        companyId,
        activityState: { in: ["ACTIVE", "STALE"] },
      },
      select: {
        title: true,
        description: true,
        kind: true,
        impact: true,
        confidence: true,
        confidenceScore: true,
        ease: true,
        iceScore: true,
        qualityScore: true,
        urgencyScore: true,
        freshnessScore: true,
        feedbackScore: true,
        candidateState: true,
        activityState: true,
        processingStatus: true,
        sortOrder: true,
        updatedAt: true,
        createdAt: true,
        rottenAt: true,
        scheduledDate: true,
        scoreProfile: true,
      },
    }),
    prismaClient.flashcard.findMany({
      where: {
        companyId,
        activityState: { in: ["ACTIVE", "STALE"] },
      },
      select: {
        impact: true,
        confidenceScore: true,
        weight: true,
        iceScore: true,
        scoreProfile: true,
      },
    }),
  ]);

  const taskMetrics = computeScoreHealthMetrics(taskcards, "ease");
  const taskPriorityMetrics = computePriorityHealthMetrics(taskcards);
  const knowledgeMetrics = computeScoreHealthMetrics(flashcards, "weight");
  const overallBand = resolveScoreHealthBand({ ...taskMetrics, priorityHealth: taskPriorityMetrics }, knowledgeMetrics);
  const taskPressure = taskMetrics.dominantTuple?.share ?? 0;
  const knowledgePressure = knowledgeMetrics.dominantTuple?.share ?? 0;

  return {
    companyId,
    generatedAt: new Date().toISOString(),
    taskcards: {
      ...taskMetrics,
      priorityHealth: taskPriorityMetrics,
      overallSeverity: maxSeverity(taskMetrics.overallSeverity, taskPriorityMetrics.overallSeverity),
      alerts: [...taskMetrics.alerts, ...taskPriorityMetrics.alerts].sort(
        (left, right) => severityRank(right.severity) - severityRank(left.severity),
      ),
    },
    knowledge: knowledgeMetrics,
    overallBand,
    thresholds: SCORE_HEALTH_THRESHOLDS,
    alerts: [...taskMetrics.alerts, ...taskPriorityMetrics.alerts, ...knowledgeMetrics.alerts].sort(
      (left, right) => severityRank(right.severity) - severityRank(left.severity),
    ),
    dominantSurface:
      Math.abs(taskPressure - knowledgePressure) < 0.05
        ? "BALANCED"
        : taskPressure > knowledgePressure
          ? "TASK"
          : "KNOWLEDGE",
  };
}

module.exports = {
  computeCompanyScoreHealth,
  defaultPrisma,
  SCORE_HEALTH_THRESHOLDS,
};
