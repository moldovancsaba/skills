const { PrismaClient } = require("@prisma/client");
const {
  buildScoreProfile,
  groundKnowledgeScores,
  normalizeGoalScores,
  persistKnowledgeScoresFromProfile,
  persistTaskScoresFromProfile,
} = require("../src/lib/scoring-contract");

const prisma = new PrismaClient();

async function repairFlashcards() {
  const flashcards = await prisma.flashcard.findMany({
    select: {
      id: true,
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
    },
  });

  let updated = 0;

  for (const flashcard of flashcards) {
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
      },
    });
    const normalized = {
      ...persistKnowledgeScoresFromProfile(scoreProfile),
      scoreProfile,
    };

    if (
      normalized.confidence !== flashcard.confidence ||
      normalized.confidenceScore !== flashcard.confidenceScore ||
      normalized.impact !== flashcard.impact ||
      normalized.weight !== flashcard.weight ||
      normalized.iceScore !== flashcard.iceScore
    ) {
      await prisma.flashcard.update({
        where: { id: flashcard.id },
        data: normalized,
      });
      updated += 1;
    }
  }

  return updated;
}

async function repairGoals() {
  const goals = await prisma.goalcard.findMany({
    select: {
      id: true,
      confidence: true,
      confidenceScore: true,
      impact: true,
      weight: true,
      iceScore: true,
    },
  });

  let updated = 0;

  for (const goal of goals) {
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

  return updated;
}

async function repairTasks() {
  const tasks = await prisma.nBAItem.findMany({
    select: {
      id: true,
      confidence: true,
      confidenceScore: true,
      impact: true,
      ease: true,
      iceScore: true,
    },
  });

  let updated = 0;

  for (const task of tasks) {
    const scoreProfile = buildScoreProfile({
      scoreKind: "TASK",
      agent: {
        confidence: task.confidenceScore ?? task.confidence,
        impact: task.impact,
        effort: task.ease,
      },
      calibrated: {
        confidence: task.confidenceScore ?? task.confidence,
        impact: task.impact,
        effort: task.ease,
      },
      rationale: {
        repairScript: true,
      },
    });
    const normalized = {
      ...persistTaskScoresFromProfile(scoreProfile),
      scoreProfile,
    };

    if (
      normalized.confidence !== task.confidence ||
      normalized.confidenceScore !== task.confidenceScore ||
      normalized.impact !== task.impact ||
      normalized.ease !== task.ease ||
      normalized.iceScore !== task.iceScore
    ) {
      await prisma.nBAItem.update({
        where: { id: task.id },
        data: normalized,
      });
      updated += 1;
    }
  }

  return updated;
}

async function main() {
  console.log("Repairing ICE score contract across flashcards, goalcards, and taskcards...");

  const [flashcards, goals, tasks] = await Promise.all([
    repairFlashcards(),
    repairGoals(),
    repairTasks(),
  ]);

  console.log(`Flashcards updated: ${flashcards}`);
  console.log(`Goalcards updated: ${goals}`);
  console.log(`Taskcards updated: ${tasks}`);
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
