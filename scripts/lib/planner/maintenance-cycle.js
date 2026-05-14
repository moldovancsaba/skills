const {
  normalizeGoalScores,
  normalizeKnowledgeScores,
  normalizeTaskScores,
} = require("../../../src/lib/scoring-contract");
const { deriveDataCardScoreProfile } = require("../../../src/lib/upstream-card-scoring");
const { deriveSourceProcessingStatus } = require("../../../src/lib/source-contract");
const { CandidateState } = require("../lifecycle");

const PLANNER_MAINTENANCE_COUNTS = Object.freeze({
  flashcards: 3,
  taskcards: 2,
  datacards: 1,
  goalcards: 1,
});

function buildActiveMaintenanceWhere() {
  return {
    activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] },
    processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED", "REVIEW"] },
  };
}

async function loadOldestModifiedBatch(model, where, take) {
  if (!take || take <= 0) {
    return [];
  }

  return model.findMany({
    where,
    orderBy: [
      { updatedAt: "asc" },
      { createdAt: "asc" },
    ],
    take,
  });
}

async function refreshOldestFlashcards(prisma, _company = null, refreshedAt = new Date()) {
  const flashcards = await loadOldestModifiedBatch(
    prisma.flashcard,
    buildActiveMaintenanceWhere(),
    PLANNER_MAINTENANCE_COUNTS.flashcards,
  );

  for (const flashcard of flashcards) {
    await prisma.flashcard.update({
      where: { id: flashcard.id },
      data: {
        ...normalizeKnowledgeScores({
          confidence: flashcard.confidenceScore ?? flashcard.confidence,
          impact: flashcard.impact,
          weight: flashcard.weight,
        }),
        lastRescoredAt: refreshedAt,
        lastTaxonomyAuditedAt: refreshedAt,
        hashtagEvaluationPending: true,
      },
    });
  }

  return flashcards;
}

async function refreshOldestGoals(prisma, _company = null, refreshedAt = new Date()) {
  const goalcards = await loadOldestModifiedBatch(
    prisma.goalcard,
    buildActiveMaintenanceWhere(),
    PLANNER_MAINTENANCE_COUNTS.goalcards,
  );

  for (const goalcard of goalcards) {
    await prisma.goalcard.update({
      where: { id: goalcard.id },
      data: {
        ...normalizeGoalScores({
          confidence: goalcard.confidenceScore ?? goalcard.confidence,
          impact: goalcard.impact,
          weight: goalcard.weight,
        }),
        lastRescoredAt: refreshedAt,
        lastTaxonomyAuditedAt: refreshedAt,
        hashtagEvaluationPending: true,
      },
    });
  }

  return goalcards;
}

async function refreshOldestTasks(prisma, _company = null, refreshedAt = new Date()) {
  const taskcards = await loadOldestModifiedBatch(
    prisma.checklistTask,
    {
      ...buildActiveMaintenanceWhere(),
      candidateState: {
        in: [
          CandidateState.GENERATED,
          CandidateState.REFINED,
          CandidateState.EVALUATED,
          CandidateState.REWORK,
        ],
      },
      status: { notIn: ["ARCHIVED", "COMPLETED"] },
    },
    PLANNER_MAINTENANCE_COUNTS.taskcards,
  );

  for (const taskcard of taskcards) {
    await prisma.checklistTask.update({
      where: { id: taskcard.id },
      data: {
        ...normalizeTaskScores({
          confidence: taskcard.confidenceScore ?? taskcard.confidence,
          impact: taskcard.impact,
          ease: taskcard.ease,
        }),
        lastRescoredAt: refreshedAt,
        lastTaxonomyAuditedAt: refreshedAt,
        hashtagEvaluationPending: true,
      },
    });
  }

  return taskcards;
}

async function refreshOldestDatacards(prisma, _company = null, refreshedAt = new Date()) {
  const sources = await loadOldestModifiedBatch(
    prisma.source,
    {},
    PLANNER_MAINTENANCE_COUNTS.datacards,
  );

  for (const source of sources) {
    const profile = deriveDataCardScoreProfile({
      content: source.content,
      hashtags: source.hashtags,
      entityTag: source.entityTag,
      aiClusters: source.aiClusters,
      metadata: source.metadata,
      intelligenceType: source.intelligenceType,
      sourceName: source.entityTag,
    });

    await prisma.source.update({
      where: { id: source.id },
      data: {
        confidence: profile.confidence,
        confidenceScore: profile.confidence,
        impact: profile.impact,
        weight: profile.weight,
        iceScore: profile.iceScore,
        scoreProfile: profile.scoreProfile ?? null,
        processingStatus: deriveSourceProcessingStatus({
          ...source,
          confidence: profile.confidence,
          confidenceScore: profile.confidence,
        }),
        hashtagEvaluationPending: true,
      },
    });
  }

  return sources;
}

async function runPlannerMaintenanceCycle(prisma, company) {
  const refreshedAt = new Date();
  const [flashcards, goalcards, taskcards, datacards] = await Promise.all([
    refreshOldestFlashcards(prisma, company, refreshedAt),
    refreshOldestGoals(prisma, company, refreshedAt),
    refreshOldestTasks(prisma, company, refreshedAt),
    refreshOldestDatacards(prisma, company, refreshedAt),
  ]);

  const totalRefreshed = flashcards.length + goalcards.length + taskcards.length + datacards.length;
  const touchedCompanyIds = [
    ...new Set(
      [...flashcards, ...goalcards, ...taskcards, ...datacards]
        .map((item) => item?.companyId)
        .filter(Boolean),
    ),
  ];

  if (totalRefreshed > 0) {
    console.log(
      `[PLANNER_MAINTENANCE] global batch refreshed ${flashcards.length} flashcards, ${taskcards.length} taskcards, ${datacards.length} datacards, ${goalcards.length} goalcards across ${touchedCompanyIds.length} compan${touchedCompanyIds.length === 1 ? "y" : "ies"} by oldest modified timestamp.`,
    );
  }

  return {
    totalRefreshed,
    flashcards: flashcards.length,
    goalcards: goalcards.length,
    taskcards: taskcards.length,
    datacards: datacards.length,
    touchedCompanyIds,
  };
}

module.exports = {
  PLANNER_MAINTENANCE_COUNTS,
  loadOldestModifiedBatch,
  refreshOldestFlashcards,
  refreshOldestGoals,
  refreshOldestTasks,
  refreshOldestDatacards,
  runPlannerMaintenanceCycle,
};
