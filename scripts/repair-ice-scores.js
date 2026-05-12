const { PrismaClient } = require("@prisma/client");
const {
  buildScoreProfile,
  groundKnowledgeScores,
  groundTaskScores,
  normalizeGoalScores,
  persistKnowledgeScoresFromProfile,
  persistTaskScoresFromProfile,
} = require("../src/lib/scoring-contract");

const prisma = new PrismaClient();

const DEFAULT_BATCH_SIZE = Math.max(1, Number.parseInt(process.env.BATCH_SIZE || "100", 10) || 100);
const DEFAULT_SURFACES = new Set(
  String(process.env.SURFACES || "flashcards,goals,tasks")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);

function progressLabel(label, processed, updated) {
  return `[repair:ice] ${label} processed=${processed} updated=${updated}`;
}

function hasNextPage(batch, batchSize) {
  return Array.isArray(batch) && batch.length === batchSize;
}

function readScoreProfileRationale(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return {};
  const rationale = profile.rationale;
  return rationale && typeof rationale === "object" && !Array.isArray(rationale) ? rationale : {};
}

function buildAfterWhere(baseWhere, lastRecord) {
  if (!lastRecord) return baseWhere;
  return {
    ...baseWhere,
    OR: [
      { createdAt: { gt: lastRecord.createdAt } },
      {
        createdAt: lastRecord.createdAt,
        id: { gt: lastRecord.id },
      },
    ],
  };
}

function compareKnowledgeRepair(normalized, card) {
  return (
    normalized.confidence !== card.confidence ||
    normalized.confidenceScore !== card.confidenceScore ||
    normalized.impact !== card.impact ||
    normalized.weight !== card.weight ||
    normalized.iceScore !== card.iceScore ||
    JSON.stringify(card.scoreProfile || null) !== JSON.stringify(normalized.scoreProfile || null)
  );
}

function compareTaskRepair(normalized, task) {
  return (
    normalized.confidence !== task.confidence ||
    normalized.confidenceScore !== task.confidenceScore ||
    normalized.impact !== task.impact ||
    normalized.ease !== task.ease ||
    normalized.iceScore !== task.iceScore ||
    JSON.stringify(task.scoreProfile || null) !== JSON.stringify(normalized.scoreProfile || null)
  );
}

async function repairFlashcards(batchSize) {
  let updated = 0;
  let processed = 0;
  let lastRecord = null;

  while (true) {
    const flashcards = await prisma.flashcard.findMany({
      where: buildAfterWhere({}, lastRecord),
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: batchSize,
      select: {
        id: true,
        createdAt: true,
        title: true,
        body: true,
        kind: true,
        hashtags: true,
        evidence: true,
        confidence: true,
        confidenceScore: true,
        impact: true,
        weight: true,
        iceScore: true,
        scoreProfile: true,
      },
    });

    if (flashcards.length === 0) break;

    for (const flashcard of flashcards) {
      processed += 1;
      const grounded = groundKnowledgeScores({
        title: flashcard.title,
        body: flashcard.body,
        kind: flashcard.kind,
        hashtags: flashcard.hashtags,
        evidence: flashcard.evidence,
        confidence: flashcard.confidenceScore ?? flashcard.confidence,
        impact: flashcard.impact,
        weight: flashcard.weight,
      });
      const scoreProfile = buildScoreProfile({
        scoreKind: "KNOWLEDGE",
        agent: {
          confidence: flashcard.confidenceScore ?? flashcard.confidence,
          impact: flashcard.impact,
          effort: flashcard.weight,
        },
        calibrated: grounded,
        rationale: {
          repairScript: true,
          batched: true,
        },
      });
      const normalized = {
        ...persistKnowledgeScoresFromProfile(scoreProfile),
        scoreProfile,
      };

      if (compareKnowledgeRepair(normalized, flashcard)) {
        await prisma.flashcard.update({
          where: { id: flashcard.id },
          data: normalized,
        });
        updated += 1;
      }
    }

    lastRecord = flashcards[flashcards.length - 1];
    console.log(progressLabel("flashcards", processed, updated));
    if (!hasNextPage(flashcards, batchSize)) break;
  }

  return { processed, updated };
}

async function repairGoals(batchSize) {
  let updated = 0;
  let processed = 0;
  let lastRecord = null;

  while (true) {
    const goals = await prisma.goalcard.findMany({
      where: buildAfterWhere({}, lastRecord),
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: batchSize,
      select: {
        id: true,
        createdAt: true,
        confidence: true,
        confidenceScore: true,
        impact: true,
        weight: true,
        iceScore: true,
      },
    });

    if (goals.length === 0) break;

    for (const goal of goals) {
      processed += 1;
      const normalized = normalizeGoalScores({
        confidence: goal.confidenceScore ?? goal.confidence,
        impact: goal.impact,
        weight: goal.weight,
      });

      if (
        normalized.confidence !== goal.confidence ||
        normalized.confidenceScore !== goal.confidenceScore ||
        normalized.impact !== goal.impact ||
        normalized.weight !== goal.weight ||
        normalized.iceScore !== goal.iceScore
      ) {
        await prisma.goalcard.update({
          where: { id: goal.id },
          data: normalized,
        });
        updated += 1;
      }
    }

    lastRecord = goals[goals.length - 1];
    console.log(progressLabel("goals", processed, updated));
    if (!hasNextPage(goals, batchSize)) break;
  }

  return { processed, updated };
}

async function repairTasks(batchSize) {
  let updated = 0;
  let processed = 0;
  let lastRecord = null;

  while (true) {
    const tasks = await prisma.nBAItem.findMany({
      where: buildAfterWhere({}, lastRecord),
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: batchSize,
      select: {
        id: true,
        createdAt: true,
        title: true,
        description: true,
        kind: true,
        confidence: true,
        confidenceScore: true,
        impact: true,
        ease: true,
        iceScore: true,
        scoreProfile: true,
      },
    });

    if (tasks.length === 0) break;

    for (const task of tasks) {
      processed += 1;
      const priorRationale = readScoreProfileRationale(task.scoreProfile);
      const grounded = groundTaskScores({
        impact: task.impact,
        confidence: task.confidenceScore ?? task.confidence,
        effort: task.ease,
        title: task.title,
        description: task.description,
        kind: task.kind,
        sourceImpact: priorRationale.sourceImpact,
        sourceConfidence: priorRationale.sourceConfidence,
        sourceWeight: priorRationale.sourceWeight,
        sourceIceScore: priorRationale.sourceIceScore,
      });
      const scoreProfile = buildScoreProfile({
        scoreKind: "TASK",
        agent: {
          confidence: task.confidenceScore ?? task.confidence,
          impact: task.impact,
          effort: task.ease,
        },
        calibrated: grounded,
        rationale: {
          repairScript: true,
          batched: true,
          sourceImpact: priorRationale.sourceImpact ?? null,
          sourceConfidence: priorRationale.sourceConfidence ?? null,
          sourceWeight: priorRationale.sourceWeight ?? null,
          sourceIceScore: priorRationale.sourceIceScore ?? null,
        },
      });
      const normalized = {
        ...persistTaskScoresFromProfile(scoreProfile),
        scoreProfile,
      };

      if (compareTaskRepair(normalized, task)) {
        await prisma.nBAItem.update({
          where: { id: task.id },
          data: normalized,
        });
        updated += 1;
      }
    }

    lastRecord = tasks[tasks.length - 1];
    console.log(progressLabel("tasks", processed, updated));
    if (!hasNextPage(tasks, batchSize)) break;
  }

  return { processed, updated };
}

async function main() {
  console.log(`Repairing ICE score contract in bounded batches (batchSize=${DEFAULT_BATCH_SIZE})...`);

  const results = {};

  if (DEFAULT_SURFACES.has("flashcards")) {
    results.flashcards = await repairFlashcards(DEFAULT_BATCH_SIZE);
  }
  if (DEFAULT_SURFACES.has("goals")) {
    results.goals = await repairGoals(DEFAULT_BATCH_SIZE);
  }
  if (DEFAULT_SURFACES.has("tasks")) {
    results.tasks = await repairTasks(DEFAULT_BATCH_SIZE);
  }

  if (results.flashcards) {
    console.log(`Flashcards processed: ${results.flashcards.processed}`);
    console.log(`Flashcards updated: ${results.flashcards.updated}`);
  }
  if (results.goals) {
    console.log(`Goalcards processed: ${results.goals.processed}`);
    console.log(`Goalcards updated: ${results.goals.updated}`);
  }
  if (results.tasks) {
    console.log(`Taskcards processed: ${results.tasks.processed}`);
    console.log(`Taskcards updated: ${results.tasks.updated}`);
  }
  console.log("ICE repair complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
