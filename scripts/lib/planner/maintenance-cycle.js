const {
  normalizeGoalScores,
  normalizeKnowledgeScores,
  normalizeTaskScores,
} = require("../../../src/lib/scoring-contract");
const { deriveDataCardScoreProfile } = require("../../../src/lib/upstream-card-scoring");
const {
  buildSourceLifecycleData,
  deriveSourceProcessingStatus,
  getWeakestProcessingStatus,
} = require("../../../src/lib/source-contract");
const { CandidateState } = require("../lifecycle");
const { processMemoryUpdates, getHumanMemoryPrompt } = require("../memory");
const { fetchUrlContent } = require("../fetcher");
const { refineDraftFlashCard, refineDraftTaskCard, refineGoalCard } = require("../writer");
const { auditCheckedFlashCard, evaluateNBAItemBatch } = require("../evaluator");
const { auditCardTaxonomy } = require("../auditor");
const { truncate } = require("../shared");
const { recordPlannerTelemetry } = require("./telemetry");
const { decideResearchPolicy, buildResearchContextFromDecision } = require("./research-policy");
const { applyEditorialQualityGate } = require("./editorial-gate");
const {
  buildFlashcardRefineUpdatePayload,
  buildFlashcardJudgeUpdatePayload,
  buildTaskUpdatePayload,
} = require("../runtime-write-contract");

const PLANNER_MAINTENANCE_COUNTS = Object.freeze({
  flashcards: 3,
  taskcards: 2,
  datacards: 1,
  goalcards: 1,
});

function resolveMaintenanceTake(cardType, executionOptions = {}) {
  const override = executionOptions?.countOverrides?.[cardType];
  const fallback = PLANNER_MAINTENANCE_COUNTS[cardType] || 1;
  if (!Number.isFinite(override)) return fallback;
  return Math.max(1, Math.min(fallback, Number(override)));
}
const PROCESSING_STATUS_ORDER = Object.freeze({
  DRAFT: 0,
  CHECKED: 1,
  VERIFIED: 2,
  ACCEPTED: 2,
});

function buildActiveMaintenanceWhere() {
  return {
    activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] },
    processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED", "REVIEW"] },
  };
}

async function loadOldestModifiedBatch(model, where, take, executionOptions = {}) {
  if (!take || take <= 0) {
    return [];
  }

  const skip = Number.isFinite(executionOptions?.selectionOffset)
    ? Math.max(0, Number(executionOptions.selectionOffset))
    : 0;

  return model.findMany({
    where,
    orderBy: [
      { updatedAt: "asc" },
      { createdAt: "asc" },
    ],
    skip,
    take,
  });
}

function extractUrlsFromText(value) {
  if (typeof value !== "string" || value.length === 0) return [];
  return Array.from(new Set(value.match(/https?:\/\/[^\s)>"']+/g) || []));
}

async function getCompanyRefreshContext(prisma, companyId, cache) {
  if (!cache.has(companyId)) {
    cache.set(companyId, (async () => {
      const company = await prisma.company.findUnique({ where: { id: companyId } });
      if (!company) throw new Error(`[PLANNER_MAINTENANCE] company ${companyId} not found`);
      await processMemoryUpdates(prisma, company);
      const memoryPrompt = await getHumanMemoryPrompt(prisma, company);
      return { company, memoryPrompt };
    })());
  }
  return cache.get(companyId);
}

async function loadFlashcardLinkedSources(prisma, flashcardId) {
  const links = await prisma.flashcardSource.findMany({
    where: { flashcardId, sourceType: "SOURCE" },
    select: { sourceId: true },
  });
  if (links.length === 0) return [];
  return prisma.source.findMany({
    where: { id: { in: links.map((link) => link.sourceId) } },
  });
}

async function loadGoalcardLinkedSources(prisma, goalcardId) {
  const links = await prisma.goalcardSource.findMany({
    where: { goalcardId, sourceType: "SOURCE" },
    select: { sourceId: true },
  });
  if (links.length === 0) return [];
  return prisma.source.findMany({
    where: { id: { in: links.map((link) => link.sourceId) } },
  });
}

async function loadTaskLinkedSources(prisma, task) {
  const flashcardIds = Array.isArray(task.sourceFlashcardIds) ? task.sourceFlashcardIds : [];
  if (flashcardIds.length === 0) return [];
  const links = await prisma.flashcardSource.findMany({
    where: {
      flashcardId: { in: flashcardIds },
      sourceType: "SOURCE",
    },
    select: { sourceId: true },
  });
  if (links.length === 0) return [];
  return prisma.source.findMany({
    where: { id: { in: Array.from(new Set(links.map((link) => link.sourceId))) } },
  });
}

async function buildResearchContextFromSources(sources, policyInput = null) {
  const decision = decideResearchPolicy({
    ...(policyInput || {}),
    sources,
  });

  const remoteContext = await buildResearchContextFromDecision(decision);
  if (remoteContext) {
    return {
      decision,
      context: remoteContext,
    };
  }

  if (!decision.shouldResearch) {
    const sourceSummaries = sources
      .slice(0, 2)
      .map((source) => truncate(source.canonicalContent || source.content || "", 800))
      .filter(Boolean);
    if (sourceSummaries.length === 0) {
      return { decision, context: null };
    }
    return {
      decision,
      context: `Linked evidence snapshots:\n${sourceSummaries.join("\n\n---\n\n")}`,
    };
  }
  return { decision, context: null };
}

async function enforceSourceBoundStatus(model, id, currentStatus, sourceStatuses, telemetry = null) {
  const ceilingStatus = getWeakestProcessingStatus(sourceStatuses);
  if (!ceilingStatus) return;
  const currentRank = PROCESSING_STATUS_ORDER[String(currentStatus || "DRAFT").toUpperCase()] ?? 0;
  const ceilingRank = PROCESSING_STATUS_ORDER[ceilingStatus] ?? 0;
  if (currentRank <= ceilingRank) return;
  await model.update({
    where: { id },
    data: { processingStatus: ceilingStatus },
  });
  if (telemetry?.prisma && telemetry.companyId) {
    await recordPlannerTelemetry(telemetry.prisma, {
      companyId: telemetry.companyId,
      entityType: telemetry.entityType || null,
      entityId: id,
      eventType: "QUALITY_CEILING_APPLIED",
      reason: telemetry.reason || `Lifecycle was capped to ${ceilingStatus} by weaker upstream evidence.`,
      details: {
        fromStatus: currentStatus,
        toStatus: ceilingStatus,
        sourceStatuses,
      },
    });
  }
}

async function enforceTaskBoundStatus(prisma, task) {
  const flashcardIds = Array.isArray(task.sourceFlashcardIds) ? task.sourceFlashcardIds : [];
  if (flashcardIds.length === 0) return;
  const flashcards = await prisma.flashcard.findMany({
    where: { id: { in: flashcardIds } },
    select: { processingStatus: true },
  });
  await enforceSourceBoundStatus(
    prisma.checklistTask,
    task.id,
    task.processingStatus,
    flashcards.map((flashcard) => flashcard.processingStatus),
    {
      prisma,
      companyId: task.companyId,
      entityType: "TASK",
      reason: "Task lifecycle was capped to the weakest upstream flashcard status during maintenance refresh.",
    },
  );
}

async function refreshOldestFlashcards(prisma, _company = null, refreshedAt = new Date(), executionOptions = {}) {
  const contextCache = new Map();
  const flashcards = await loadOldestModifiedBatch(
    prisma.flashcard,
    buildActiveMaintenanceWhere(),
    resolveMaintenanceTake("flashcards", executionOptions),
    executionOptions,
  );

  for (const flashcard of flashcards) {
    const { company, memoryPrompt } = await getCompanyRefreshContext(prisma, flashcard.companyId, contextCache);
    const linkedSources = await loadFlashcardLinkedSources(prisma, flashcard.id);
    const { decision, context: refreshContext } = await buildResearchContextFromSources(linkedSources, {
      operation: "FLASHCARD_REFRESH",
      entity: flashcard,
    });
    await recordPlannerTelemetry(prisma, {
      companyId: flashcard.companyId,
      entityType: "FLASHCARD",
      entityId: flashcard.id,
      eventType: decision.shouldResearch ? "RESEARCH_POLICY_RUN" : "RESEARCH_POLICY_SKIP",
      reason: decision.reason,
      details: decision,
    });
    const rewritten = await refineDraftFlashCard(
      prisma,
      { ...flashcard, company },
      memoryPrompt,
      null,
      refreshContext,
    );
    const editorial = applyEditorialQualityGate("FLASHCARD", {
      ...(rewritten || flashcard),
      body: rewritten?.body ?? flashcard.body,
      title: rewritten?.title ?? flashcard.title,
      processingStatus: rewritten?.processingStatus ?? flashcard.processingStatus,
    }, { bodyLimit: 1200 });
    const baseUpdate = {
      ...(rewritten || {}),
      title: editorial.title,
      body: editorial.body,
      processingStatus: editorial.processingStatus,
      lastRescoredAt: refreshedAt,
      lastTaxonomyAuditedAt: refreshedAt,
      hashtagEvaluationPending: true,
      refreshedAt,
    };
    if (editorial.editorialGate?.shouldDowngrade) {
      await recordPlannerTelemetry(prisma, {
        companyId: flashcard.companyId,
        entityType: "FLASHCARD",
        entityId: flashcard.id,
        eventType: "EDITORIAL_GATE_DOWNGRADE",
        reason: `Maintenance editorial gate downgraded flashcard because ${editorial.editorialGate.weakestDimension} quality was too low.`,
        details: editorial.editorialGate,
      });
    }

    await prisma.flashcard.update({
      where: { id: flashcard.id },
      data: buildFlashcardRefineUpdatePayload(
        rewritten
          ? {
              ...baseUpdate,
              ...normalizeKnowledgeScores({
                confidence: baseUpdate.confidenceScore ?? baseUpdate.confidence,
                impact: baseUpdate.impact,
                weight: baseUpdate.weight,
              }),
            }
          : {
              ...normalizeKnowledgeScores({
                confidence: flashcard.confidenceScore ?? flashcard.confidence,
                impact: flashcard.impact,
                weight: flashcard.weight,
              }),
              lastRescoredAt: refreshedAt,
              lastTaxonomyAuditedAt: refreshedAt,
              hashtagEvaluationPending: true,
              refreshedAt,
            },
      ),
    });

    const refreshed = await prisma.flashcard.findUnique({ where: { id: flashcard.id } });
    if (refreshed?.processingStatus === "CHECKED") {
      const audit = await auditCheckedFlashCard(
        prisma,
        refreshed,
        memoryPrompt,
        null,
        linkedSources.map((source) => source.canonicalContent || source.content).join("\n\n"),
      );
      if (audit) {
        await prisma.flashcard.update({
          where: { id: flashcard.id },
          data: buildFlashcardJudgeUpdatePayload(audit, refreshedAt, {
            lastTaxonomyAuditedAt: refreshedAt,
            hashtagEvaluationPending: true,
            refreshedAt,
          }),
        });
      }
    }
    const sourceStatuses = linkedSources.map((source) => deriveSourceProcessingStatus(source));
    const latestFlashcard = await prisma.flashcard.findUnique({ where: { id: flashcard.id } });
    if (latestFlashcard) {
      await enforceSourceBoundStatus(
        prisma.flashcard,
        flashcard.id,
        latestFlashcard.processingStatus,
        sourceStatuses,
        {
          prisma,
          companyId: flashcard.companyId,
          entityType: "FLASHCARD",
          reason: "Flashcard lifecycle was capped to the weakest linked datacard status during maintenance refresh.",
        },
      );
    }

    const taxonomy = await auditCardTaxonomy(prisma, company, refreshed || flashcard, "KNOWLEDGE");
    if (taxonomy) {
      await prisma.flashcard.update({
        where: { id: flashcard.id },
        data: {
          lastTaxonomyAuditedAt: refreshedAt,
          userAnnotation: taxonomy.isMismatch
            ? `[TAXONOMY_AUDIT]: Suggested layer ${taxonomy.suggestedLayer}. ${taxonomy.reasoning || ""}`.trim()
            : (refreshed?.userAnnotation ?? flashcard.userAnnotation ?? null),
        },
      });
    }
  }

  return flashcards;
}

async function refreshOldestGoals(prisma, _company = null, refreshedAt = new Date(), executionOptions = {}) {
  const contextCache = new Map();
  const goalcards = await loadOldestModifiedBatch(
    prisma.goalcard,
    buildActiveMaintenanceWhere(),
    resolveMaintenanceTake("goalcards", executionOptions),
    executionOptions,
  );

  for (const goalcard of goalcards) {
    const { company, memoryPrompt } = await getCompanyRefreshContext(prisma, goalcard.companyId, contextCache);
    const linkedSources = await loadGoalcardLinkedSources(prisma, goalcard.id);
    const { decision, context: refreshContext } = await buildResearchContextFromSources(linkedSources, {
      operation: "GOAL_REFRESH",
      entity: goalcard,
    });
    await recordPlannerTelemetry(prisma, {
      companyId: goalcard.companyId,
      entityType: "GOAL",
      entityId: goalcard.id,
      eventType: decision.shouldResearch ? "RESEARCH_POLICY_RUN" : "RESEARCH_POLICY_SKIP",
      reason: decision.reason,
      details: decision,
    });
    const rewritten = await refineGoalCard(
      prisma,
      { ...goalcard, company },
      memoryPrompt,
      null,
      refreshContext,
    );
    const editorial = applyEditorialQualityGate("GOAL", {
      ...(rewritten || goalcard),
      body: rewritten?.body ?? goalcard.body,
      title: rewritten?.title ?? goalcard.title,
      processingStatus: rewritten?.processingStatus ?? goalcard.processingStatus,
    }, { bodyLimit: 1200 });
    if (editorial.editorialGate?.shouldDowngrade) {
      await recordPlannerTelemetry(prisma, {
        companyId: goalcard.companyId,
        entityType: "GOAL",
        entityId: goalcard.id,
        eventType: "EDITORIAL_GATE_DOWNGRADE",
        reason: `Maintenance editorial gate downgraded goalcard because ${editorial.editorialGate.weakestDimension} quality was too low.`,
        details: editorial.editorialGate,
      });
    }

    await prisma.goalcard.update({
      where: { id: goalcard.id },
      data: {
        ...(rewritten || normalizeGoalScores({
          confidence: goalcard.confidenceScore ?? goalcard.confidence,
          impact: goalcard.impact,
          weight: goalcard.weight,
        })),
        title: editorial.title,
        body: editorial.body,
        processingStatus: editorial.processingStatus,
        lastRescoredAt: refreshedAt,
        lastTaxonomyAuditedAt: refreshedAt,
        hashtagEvaluationPending: true,
        refreshedAt,
      },
    });

    const refreshed = await prisma.goalcard.findUnique({ where: { id: goalcard.id } });
    const taxonomy = await auditCardTaxonomy(prisma, company, refreshed || goalcard, "GOAL");
    const sourceStatuses = linkedSources.map((source) => deriveSourceProcessingStatus(source));
    const latestGoal = await prisma.goalcard.findUnique({ where: { id: goalcard.id } });
    if (latestGoal) {
      await enforceSourceBoundStatus(
        prisma.goalcard,
        goalcard.id,
        latestGoal.processingStatus,
        sourceStatuses,
        {
          prisma,
          companyId: goalcard.companyId,
          entityType: "GOAL",
          reason: "Goal lifecycle was capped to the weakest linked datacard status during maintenance refresh.",
        },
      );
    }
    if (taxonomy) {
      await prisma.goalcard.update({
        where: { id: goalcard.id },
        data: {
          lastTaxonomyAuditedAt: refreshedAt,
          userAnnotation: taxonomy.isMismatch
            ? `[TAXONOMY_AUDIT]: Suggested layer ${taxonomy.suggestedLayer}. ${taxonomy.reasoning || ""}`.trim()
            : (refreshed?.userAnnotation ?? goalcard.userAnnotation ?? null),
        },
      });
    }
  }

  return goalcards;
}

async function refreshOldestTasks(prisma, _company = null, refreshedAt = new Date(), executionOptions = {}) {
  const contextCache = new Map();
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
    resolveMaintenanceTake("taskcards", executionOptions),
    executionOptions,
  );

  for (const taskcard of taskcards) {
    const { company, memoryPrompt } = await getCompanyRefreshContext(prisma, taskcard.companyId, contextCache);
    const linkedSources = await loadTaskLinkedSources(prisma, taskcard);
    const { decision, context: refreshContext } = await buildResearchContextFromSources(linkedSources, {
      operation: "TASK_REFRESH",
      entity: taskcard,
    });
    await recordPlannerTelemetry(prisma, {
      companyId: taskcard.companyId,
      entityType: "TASK",
      entityId: taskcard.id,
      eventType: decision.shouldResearch ? "RESEARCH_POLICY_RUN" : "RESEARCH_POLICY_SKIP",
      reason: decision.reason,
      details: decision,
    });
    const rewritten = await refineDraftTaskCard(
      prisma,
      { ...taskcard, company },
      memoryPrompt,
      null,
      refreshContext,
    );
    const editorial = applyEditorialQualityGate("TASK", {
      ...(rewritten || taskcard),
      description: rewritten?.description ?? taskcard.description,
      title: rewritten?.title ?? taskcard.title,
      processingStatus: rewritten?.processingStatus ?? taskcard.processingStatus,
    }, { bodyLimit: 1200 });
    if (editorial.editorialGate?.shouldDowngrade) {
      await recordPlannerTelemetry(prisma, {
        companyId: taskcard.companyId,
        entityType: "TASK",
        entityId: taskcard.id,
        eventType: "EDITORIAL_GATE_DOWNGRADE",
        reason: `Maintenance editorial gate downgraded taskcard because ${editorial.editorialGate.weakestDimension} quality was too low.`,
        details: editorial.editorialGate,
      });
    }

    await prisma.checklistTask.update({
      where: { id: taskcard.id },
      data: buildTaskUpdatePayload({
        ...(rewritten || normalizeTaskScores({
          confidence: taskcard.confidenceScore ?? taskcard.confidence,
          impact: taskcard.impact,
          ease: taskcard.ease,
        })),
        title: editorial.title,
        description: editorial.description,
        processingStatus: editorial.processingStatus,
        lastRescoredAt: refreshedAt,
        lastTaxonomyAuditedAt: refreshedAt,
        hashtagEvaluationPending: true,
      }),
    });

    const refreshed = await prisma.checklistTask.findUnique({ where: { id: taskcard.id } });
    if (refreshed?.processingStatus === "CHECKED") {
      await evaluateNBAItemBatch(prisma, company, [refreshed], memoryPrompt);
    }
    const latestTask = await prisma.checklistTask.findUnique({ where: { id: taskcard.id } });
    if (latestTask) {
      await enforceTaskBoundStatus(prisma, latestTask);
    }

    const taxonomy = await auditCardTaxonomy(prisma, company, refreshed || taskcard, "TASK");
    if (taxonomy) {
      await prisma.checklistTask.update({
        where: { id: taskcard.id },
        data: {
          lastTaxonomyAuditedAt: refreshedAt,
          userAnnotation: taxonomy.isMismatch
            ? `[TAXONOMY_AUDIT]: Suggested layer ${taxonomy.suggestedLayer}. ${taxonomy.reasoning || ""}`.trim()
            : (refreshed?.userAnnotation ?? taskcard.userAnnotation ?? null),
        },
      });
    }
  }

  return taskcards;
}

async function refreshOldestDatacards(prisma, _company = null, refreshedAt = new Date(), executionOptions = {}) {
  const sources = await loadOldestModifiedBatch(
    prisma.source,
    {},
    resolveMaintenanceTake("datacards", executionOptions),
    executionOptions,
  );

  for (const source of sources) {
    let latestContent = source.content;
    const refreshUrl = [
      ...extractUrlsFromText(source.provenance),
      ...extractUrlsFromText(source.content),
      ...extractUrlsFromText(source.metadata?.url),
    ][0];

    const decision = decideResearchPolicy({
      operation: "DATACARD_REFRESH",
      sources: [source],
      entity: source,
    });
    if (refreshUrl && decision.shouldResearch) {
      try {
        const fetched = await fetchUrlContent(refreshUrl);
        if (fetched?.content) {
          latestContent = `${refreshUrl}\n\n${fetched.content}`;
        }
      } catch (_error) {
        // Keep the existing datacard content when the live URL is unreachable.
      }
    }
    await recordPlannerTelemetry(prisma, {
      companyId: source.companyId,
      entityType: "SOURCE",
      entityId: source.id,
      eventType: decision.shouldResearch ? "RESEARCH_POLICY_RUN" : "RESEARCH_POLICY_SKIP",
      reason: decision.reason,
      details: decision,
    });

    const profile = deriveDataCardScoreProfile({
      content: latestContent,
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
        content: latestContent,
        confidence: profile.confidence,
        confidenceScore: profile.confidence,
        impact: profile.impact,
        weight: profile.weight,
        iceScore: profile.iceScore,
        scoreProfile: profile.scoreProfile ?? null,
        ...buildSourceLifecycleData({
          ...source,
          content: latestContent,
          confidence: profile.confidence,
          confidenceScore: profile.confidence,
          metadata: {
            ...(source.metadata || {}),
            lastCheckedAt: refreshedAt.toISOString(),
            refreshedBy: "planner-maintenance",
          },
        }),
        hashtagEvaluationPending: true,
        updatedAt: refreshedAt,
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
