const { PrismaClient } = require("@prisma/client");

const globalForScoreHealth = globalThis;
const defaultPrisma =
  globalForScoreHealth.__scoreHealthPrisma ??
  new PrismaClient({
    log: ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForScoreHealth.__scoreHealthPrisma = defaultPrisma;
}

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
});

function roundShare(count, total) {
  if (total <= 0) return 0;
  return Number((count / total).toFixed(4));
}

function normalizeIceValue(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Number(value.toFixed(1));
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
    const normalizedIce = normalizeIceValue(record.iceScore);
    if (normalizedIce !== null) {
      iceCounts.set(normalizedIce, (iceCounts.get(normalizedIce) ?? 0) + 1);
    }

    const tupleLabel = `${record.impact ?? 0}|${record.confidenceScore ?? 0}|${record[effortKey] ?? 0}`;
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

function resolveScoreHealthBand(taskcards, knowledge) {
  return maxSeverity(taskcards.overallSeverity, knowledge.overallSeverity);
}

async function computeCompanyScoreHealth(companyId, prismaClient = defaultPrisma) {
  const [taskcards, flashcards] = await Promise.all([
    prismaClient.nBAItem.findMany({
      where: {
        companyId,
        activityState: { in: ["ACTIVE", "STALE"] },
      },
      select: {
        impact: true,
        confidenceScore: true,
        ease: true,
        iceScore: true,
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
      },
    }),
  ]);

  const taskMetrics = computeScoreHealthMetrics(taskcards, "ease");
  const knowledgeMetrics = computeScoreHealthMetrics(flashcards, "weight");
  const overallBand = resolveScoreHealthBand(taskMetrics, knowledgeMetrics);
  const taskPressure = taskMetrics.dominantTuple?.share ?? 0;
  const knowledgePressure = knowledgeMetrics.dominantTuple?.share ?? 0;

  return {
    companyId,
    generatedAt: new Date().toISOString(),
    taskcards: taskMetrics,
    knowledge: knowledgeMetrics,
    overallBand,
    thresholds: SCORE_HEALTH_THRESHOLDS,
    alerts: [...taskMetrics.alerts, ...knowledgeMetrics.alerts].sort(
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
