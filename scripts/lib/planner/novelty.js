const { similarity } = require("../shared");
const crypto = require("crypto");

const NOVELTY_THRESHOLDS = Object.freeze({
  FLASHCARD: 0.24,
  TASK: 0.2,
  GOAL: 0.22,
});

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeTags(value) {
  return Array.isArray(value)
    ? value.map((item) => normalizeText(item).toLowerCase()).filter(Boolean)
    : [];
}

function combinedSimilarity(left = {}, right = {}) {
  const titleSim = similarity(normalizeText(left.title), normalizeText(right.title));
  const bodySim = similarity(
    normalizeText(left.body ?? left.description),
    normalizeText(right.body ?? right.description),
  );
  const leftTags = new Set(normalizeTags(left.hashtags));
  const rightTags = new Set(normalizeTags(right.hashtags));
  const overlap = [...leftTags].filter((tag) => rightTags.has(tag)).length;
  const tagSim =
    leftTags.size === 0 || rightTags.size === 0
      ? 0
      : overlap / Math.max(leftTags.size, rightTags.size);
  return Number((titleSim * 0.55 + bodySim * 0.3 + tagSim * 0.15).toFixed(4));
}

function buildNoveltyClusterId(entityType, candidate, closestMatch = null) {
  const raw = [
    entityType,
    normalizeText(candidate?.title).toLowerCase(),
    normalizeText(closestMatch?.title).toLowerCase(),
    closestMatch?.publicId ?? closestMatch?.id ?? "none",
  ].join("|");
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

async function loadComparableInventory(prisma, companyId, entityType) {
  if (entityType === "FLASHCARD") {
    return prisma.flashcard.findMany({
      where: {
        companyId,
        activityState: { in: ["ACTIVE", "STALE"] },
      },
      orderBy: { updatedAt: "desc" },
      take: 150,
      select: {
        id: true,
        publicId: true,
        title: true,
        body: true,
        hashtags: true,
      },
    });
  }

  if (entityType === "TASK") {
    return prisma.checklistTask.findMany({
      where: {
        companyId,
        activityState: { in: ["ACTIVE", "STALE"] },
        status: { notIn: ["ARCHIVED", "COMPLETED"] },
      },
      orderBy: { updatedAt: "desc" },
      take: 150,
      select: {
        id: true,
        publicId: true,
        title: true,
        description: true,
        hashtags: true,
      },
    });
  }

  return prisma.goalcard.findMany({
    where: {
      companyId,
      activityState: { in: ["ACTIVE", "STALE"] },
    },
    orderBy: { updatedAt: "desc" },
    take: 150,
    select: {
      id: true,
      publicId: true,
      title: true,
      body: true,
      hashtags: true,
    },
  });
}

async function evaluateCandidateNovelty(prisma, {
  companyId,
  entityType,
  candidate,
  inventory = null,
}) {
  const comparableInventory = Array.isArray(inventory)
    ? inventory
    : await loadComparableInventory(prisma, companyId, entityType);

  if (comparableInventory.length === 0) {
    return {
      entityType,
      noveltyScore: 1,
      maxSimilarity: 0,
      shouldPublish: true,
      threshold: NOVELTY_THRESHOLDS[entityType] ?? 0.2,
      closestMatch: null,
      comparedCount: 0,
      reason: "No comparable active inventory exists.",
    };
  }

  let closestMatch = null;
  let maxSimilarity = 0;
  for (const existing of comparableInventory) {
    const currentSimilarity = combinedSimilarity(candidate, existing);
    if (currentSimilarity > maxSimilarity) {
      maxSimilarity = currentSimilarity;
      closestMatch = existing;
    }
  }

  const noveltyScore = Number(Math.max(0, 1 - maxSimilarity).toFixed(4));
  const threshold = NOVELTY_THRESHOLDS[entityType] ?? 0.2;
  const shouldPublish = noveltyScore >= threshold;

  return {
    entityType,
    noveltyScore,
    maxSimilarity,
    shouldPublish,
    threshold,
    noveltyClusterId: buildNoveltyClusterId(entityType, candidate, closestMatch),
    closestMatch: closestMatch
      ? {
          id: closestMatch.id,
          publicId: closestMatch.publicId ?? null,
          title: closestMatch.title,
        }
      : null,
    comparedCount: comparableInventory.length,
    reason: shouldPublish
      ? "Candidate is sufficiently novel relative to active inventory."
      : "Candidate is too close to existing active inventory and should not be published.",
  };
}

module.exports = {
  NOVELTY_THRESHOLDS,
  combinedSimilarity,
  buildNoveltyClusterId,
  evaluateCandidateNovelty,
};
