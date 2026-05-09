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

function roundShare(count, total) {
  if (total <= 0) return 0;
  return Number((count / total).toFixed(4));
}

function normalizeIceValue(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Number(value.toFixed(1));
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

  return {
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
}

function resolveScoreHealthBand(taskcards, knowledge) {
  const taskTupleShare = taskcards.dominantTuple?.share ?? 0;
  const taskDiversityRatio = taskcards.diversityRatio;
  const knowledgeTupleShare = knowledge.dominantTuple?.share ?? 0;

  if (taskTupleShare >= 0.5 || taskDiversityRatio <= 0.1) {
    return "CRITICAL";
  }

  if (taskTupleShare >= 0.3 || taskDiversityRatio <= 0.2 || knowledgeTupleShare >= 0.25) {
    return "WARNING";
  }

  return "HEALTHY";
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
};
