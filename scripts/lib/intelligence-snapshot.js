const fs = require("fs");
const path = require("path");
const { computeCompanyScoreHealth } = require("../../src/lib/score-health");

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_KNOWLEDGE_SAMPLE_FOR_SCORE_HEALTH = 8;
const HEARTBEAT_FILE = path.join(__dirname, "..", "..", "logs", "guardian-heartbeat.json");

function readGuardianHeartbeat() {
  try {
    return JSON.parse(fs.readFileSync(HEARTBEAT_FILE, "utf8"));
  } catch {
    return null;
  }
}

function dollarsFromMicros(micros) {
  const numeric = Number(micros || 0);
  return Math.round((numeric / 1_000_000) * 100) / 100;
}

function roundUnits(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function normalizeAlerts(alerts = []) {
  return (Array.isArray(alerts) ? alerts : []).map((alert) => ({
    ...alert,
    message: alert?.message || alert?.detail || "",
  }));
}

function virtualPolicies(policies) {
  const defaults = [
    { feature: "pipeline-queue", dailyEstimatedCostMicros: 250000, dailyWorkloadUnitsLimit: 120, retryLimit: 6, externalRequestLimit: 20, status: "VIRTUAL_DEFAULT", controlMode: "MONITOR" },
    { feature: "evaluation-bench", dailyEstimatedCostMicros: 150000, dailyWorkloadUnitsLimit: 60, retryLimit: 3, externalRequestLimit: 5, status: "VIRTUAL_DEFAULT", controlMode: "MONITOR" },
    { feature: "observability", dailyEstimatedCostMicros: 75000, dailyWorkloadUnitsLimit: 40, retryLimit: 4, externalRequestLimit: 5, status: "VIRTUAL_DEFAULT", controlMode: "MONITOR" },
  ];
  const map = new Map((policies || []).map((policy) => [policy.feature, policy]));
  for (const policy of defaults) {
    if (!map.has(policy.feature)) {
      map.set(policy.feature, policy);
    }
  }
  return Array.from(map.values());
}

function summarizeUsage(usages) {
  const byFeature = new Map();

  for (const usage of usages || []) {
    const entry = byFeature.get(usage.feature) || {
      feature: usage.feature,
      estimatedCostMicros: 0,
      actualCostMicros: 0,
      workloadUnits: 0,
      runtimeMs: 0,
      externalRequests: 0,
      retryCount: 0,
      records: 0,
    };
    entry.estimatedCostMicros += Number(usage.estimatedCostMicros || 0);
    entry.actualCostMicros += Number(usage.actualCostMicros || 0);
    entry.workloadUnits += Number(usage.workloadUnits || 0);
    entry.runtimeMs += Number(usage.runtimeMs || 0);
    entry.externalRequests += Number(usage.externalRequests || 0);
    entry.retryCount += Number(usage.retryCount || 0);
    entry.records += 1;
    byFeature.set(usage.feature, entry);
  }

  return Array.from(byFeature.values())
    .map((entry) => ({
      ...entry,
      estimatedCost: dollarsFromMicros(entry.estimatedCostMicros),
      actualCost: dollarsFromMicros(entry.actualCostMicros),
      workloadUnits: roundUnits(entry.workloadUnits),
    }))
    .sort((left, right) => right.estimatedCostMicros - left.estimatedCostMicros);
}

function recommendedBudgetEvents({ usageByFeature, policies, activeJobs, evaluationFailureCount }) {
  const events = [];
  const policyMap = new Map((policies || []).map((policy) => [policy.feature, policy]));

  for (const usage of usageByFeature || []) {
    const policy = policyMap.get(usage.feature);
    if (!policy) continue;

    if (usage.estimatedCostMicros > Number(policy.dailyEstimatedCostMicros || 0)) {
      events.push({
        feature: usage.feature,
        eventType: "DAILY_ESTIMATED_COST_LIMIT",
        severity: "WARN",
        valueAssessment: usage.retryCount > Number(policy.retryLimit || 0) ? "POSSIBLE_WASTE" : "HIGH_COST_HIGH_VALUE_REVIEW",
        recommendation: "Review cost drivers, then cache/reuse, batch, or require review for repeated low-value work.",
      });
    }

    if (usage.retryCount > Number(policy.retryLimit || 0)) {
      events.push({
        feature: usage.feature,
        eventType: "RETRY_LIMIT_PRESSURE",
        severity: "WARN",
        valueAssessment: "POSSIBLE_WASTE",
        recommendation: "Inspect retry causes before allowing more autonomous attempts.",
      });
    }
  }

  const failedJobs = (activeJobs || []).filter((job) => job.status === "FAILED");
  const highRetryJobs = (activeJobs || []).filter((job) => Number(job.attemptCount || 0) >= 3);
  if (failedJobs.length || highRetryJobs.length) {
    events.push({
      feature: "pipeline-queue",
      eventType: "QUEUE_RETRY_OR_FAILURE_PRESSURE",
      severity: failedJobs.length > 2 ? "CRITICAL" : "WARN",
      valueAssessment: "POSSIBLE_WASTE",
      recommendation: "Recover failed jobs only after reviewing repeated failure reasons; consider pause or review-required controls.",
    });
  }

  if (evaluationFailureCount > 0) {
    events.push({
      feature: "evaluation-bench",
      eventType: "FAILED_EVAL_REPLAY",
      severity: "INFO",
      valueAssessment: "HIGH_COST_HIGH_VALUE_REVIEW",
      recommendation: "Keep evaluation replay visible as internal quality-governance work before promoting candidate behavior.",
    });
  }

  return events;
}

async function buildAnalyticsHistory(prisma, companyId) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const [initialSources, initialFiles, initialTopics, initialFlashcards, initialGoals, initialNba] = await Promise.all([
    prisma.source.count({ where: { companyId, createdAt: { lt: thirtyDaysAgo } } }),
    prisma.uploadedSourceFile.count({ where: { companyId, createdAt: { lt: thirtyDaysAgo } } }),
    prisma.topic.count({ where: { companyId, createdAt: { lt: thirtyDaysAgo } } }),
    prisma.flashcard.count({ where: { companyId, createdAt: { lt: thirtyDaysAgo } } }),
    prisma.goalcard.count({ where: { companyId, createdAt: { lt: thirtyDaysAgo } } }),
    prisma.nBAItem.count({ where: { companyId, createdAt: { lt: thirtyDaysAgo } } }),
  ]);

  const [sources, files, topics, flashcards, goals, nba] = await Promise.all([
    prisma.source.findMany({ where: { companyId, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true } }),
    prisma.uploadedSourceFile.findMany({ where: { companyId, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true } }),
    prisma.topic.findMany({ where: { companyId, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true } }),
    prisma.flashcard.findMany({ where: { companyId, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true } }),
    prisma.goalcard.findMany({ where: { companyId, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true } }),
    prisma.nBAItem.findMany({ where: { companyId, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true } }),
  ]);

  const history = [];
  let currentSources = initialSources + initialFiles;
  let currentTopics = initialTopics;
  let currentFlashcards = initialFlashcards;
  let currentGoals = initialGoals;
  let currentNba = initialNba;

  for (let i = 0; i <= 30; i += 1) {
    const d = new Date(thirtyDaysAgo);
    d.setDate(d.getDate() + i);
    const dayStr = d.toISOString().split("T")[0];

    currentSources += sources.filter((entry) => entry.createdAt.toISOString().split("T")[0] === dayStr).length;
    currentSources += files.filter((entry) => entry.createdAt.toISOString().split("T")[0] === dayStr).length;
    currentTopics += topics.filter((entry) => entry.createdAt.toISOString().split("T")[0] === dayStr).length;
    currentFlashcards += flashcards.filter((entry) => entry.createdAt.toISOString().split("T")[0] === dayStr).length;
    currentGoals += goals.filter((entry) => entry.createdAt.toISOString().split("T")[0] === dayStr).length;
    currentNba += nba.filter((entry) => entry.createdAt.toISOString().split("T")[0] === dayStr).length;

    history.push({
      date: dayStr,
      sources: currentSources,
      topics: currentTopics,
      flashcards: currentFlashcards,
      goals: currentGoals,
      nba: currentNba,
    });
  }

  return history;
}

function isCorrectionUnresolved(correction) {
  const flashcard = correction.flashcard;
  if (!flashcard) return false;

  if (correction.correctionType === "REQUEST_REFRESH" || correction.correctionType === "MARK_WRONG") {
    return (
      flashcard.processingStatus === "REVIEW" ||
      !flashcard.lastCorrectionReconciledAt ||
      flashcard.lastCorrectionReconciledAt <= correction.createdAt
    );
  }

  if (correction.correctionType === "SUPPRESS_SOURCE" || correction.correctionType === "HIDE") {
    return flashcard.activityState !== "ARCHIVED" && flashcard.updatedAt <= correction.createdAt;
  }

  return false;
}

function resolveKnowmoreHealthState({ failedJobs, reviewCount, staleCount, scoreBand }) {
  if (failedJobs > 0) return "FAILED";
  if (reviewCount > 0 || staleCount > 0 || scoreBand === "CRITICAL" || scoreBand === "SUSPICIOUS") return "DELAYED";
  if (scoreBand === "WARNING") return "STALE";
  return "HEALTHY";
}

function describeKnowmoreHealthState({ healthState, reviewCount, staleCount, correctionBacklog, failedJobs, scoreBand }) {
  if (healthState === "FAILED") {
    return {
      healthTone: "destructive",
      healthTitle: "Knowmore Health: Worker Failure",
      healthSummary: `The queue has ${failedJobs} failed knowledge job(s). Recovery is needed before normal knowledge maintenance can continue.`,
    };
  }

  if (healthState === "DELAYED") {
    return {
      healthTone: "warning",
      healthTitle: "Knowmore Health: Needs Attention",
      healthSummary:
        reviewCount > 0 || staleCount > 0
          ? `Review ${reviewCount} card(s), stale ${staleCount}, correction backlog ${correctionBacklog}. The worker is running, but some knowledge needs another pass.`
          : `The worker is running and there are no failed jobs, but the knowledge set looks clustered or low-diversity (${scoreBand}).`,
    };
  }

  if (healthState === "STALE") {
    return {
      healthTone: "warning",
      healthTitle: "Knowmore Health: Monitoring",
      healthSummary: `No worker failure is active, but the current knowledge quality signals are worth watching (${scoreBand}).`,
    };
  }

  return {
    healthTone: "default",
    healthTitle: "Knowmore Health: Healthy",
    healthSummary: `Review ${reviewCount} card(s), stale ${staleCount}, correction backlog ${correctionBacklog}, failed jobs ${failedJobs}.`,
  };
}

async function buildKnowmoreHealth(prisma, companyId, scoreHealth) {
  const [reviewCount, staleCount, corrections, failedJobs, jobs, knowledgeCount] = await Promise.all([
    prisma.flashcard.count({
      where: {
        companyId,
        processingStatus: "REVIEW",
        activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] },
      },
    }),
    prisma.flashcard.count({
      where: {
        companyId,
        activityState: { in: ["STALE", "EXPIRED"] },
      },
    }),
    prisma.flashcardCorrection.findMany({
      where: {
        companyId,
        correctionType: { in: ["REQUEST_REFRESH", "SUPPRESS_SOURCE", "MARK_WRONG", "HIDE"] },
      },
      include: {
        flashcard: {
          select: {
            updatedAt: true,
            lastCorrectionReconciledAt: true,
            processingStatus: true,
            activityState: true,
          },
        },
      },
    }),
    prisma.pipelineJob.count({
      where: {
        companyId,
        status: "FAILED",
        jobType: { in: ["COMPANY_SYNTHESIS", "FEEDBACK_RECONCILIATION", "CARD_RESCORING"] },
      },
    }),
    prisma.pipelineJob.findMany({
      where: {
        companyId,
        jobType: { in: ["COMPANY_SYNTHESIS", "FEEDBACK_RECONCILIATION", "CARD_RESCORING"] },
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 6,
    }),
    prisma.flashcard.count({
      where: {
        companyId,
        activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] },
      },
    }),
  ]);

  const correctionBacklog = corrections.filter(isCorrectionUnresolved).length;
  const scoreHealthEnabled = knowledgeCount >= MIN_KNOWLEDGE_SAMPLE_FOR_SCORE_HEALTH;
  const effectiveScoreBand = scoreHealthEnabled ? (scoreHealth?.knowledge?.overallSeverity ?? "UNKNOWN") : "HEALTHY";
  const effectiveAlerts = scoreHealthEnabled ? normalizeAlerts(scoreHealth?.knowledge?.alerts?.slice(0, 3) ?? []) : [];
  const healthState = resolveKnowmoreHealthState({
    failedJobs,
    reviewCount,
    staleCount,
    scoreBand: effectiveScoreBand,
  });
  const presentation = describeKnowmoreHealthState({
    healthState,
    reviewCount,
    staleCount,
    correctionBacklog,
    failedJobs,
    scoreBand: effectiveScoreBand,
  });

  return {
    healthState,
    reviewCount,
    staleCount,
    correctionBacklog,
    failedJobs,
    scoreBand: effectiveScoreBand,
    alerts: effectiveAlerts,
    jobs,
    recommendedActions: {
      sync: true,
      repair: healthState !== "HEALTHY" || correctionBacklog > 0,
      recover: failedJobs > 0,
    },
    ...presentation,
  };
}

async function buildBudgetSummary(prisma, companyId) {
  const since = new Date(Date.now() - DAY_MS);
  const [usages, policies, openEvents, activeJobs, evaluationFailureCount] = await Promise.all([
    prisma.aiWorkloadUsage.findMany({
      where: { companyId, createdAt: { gte: since } },
      orderBy: [{ createdAt: "desc" }],
      take: 200,
    }),
    prisma.budgetPolicy.findMany({
      where: { companyId },
      orderBy: [{ updatedAt: "desc" }],
    }),
    prisma.budgetEvent.findMany({
      where: { companyId, status: "OPEN" },
      orderBy: [{ createdAt: "desc" }],
      take: 20,
    }),
    prisma.pipelineJob.findMany({
      where: { companyId, status: { in: ["ACTIVE", "RUNNING", "FAILED"] } },
      orderBy: [{ updatedAt: "desc" }],
      take: 100,
    }),
    prisma.outcomeEvent.count({
      where: { companyId, outcomeType: "EVAL_GATE_FAILED", createdAt: { gte: since } },
    }),
  ]);

  const usageByFeature = summarizeUsage(usages);
  const totalEstimatedCostMicros = usageByFeature.reduce((sum, usage) => sum + usage.estimatedCostMicros, 0);
  const totalWorkloadUnits = roundUnits(usageByFeature.reduce((sum, usage) => sum + usage.workloadUnits, 0));
  const policyList = virtualPolicies(policies);
  const recommendations = recommendedBudgetEvents({
    usageByFeature,
    policies: policyList,
    activeJobs,
    evaluationFailureCount,
  });
  const pressure = recommendations.some((event) => event.severity === "CRITICAL")
    ? "CRITICAL"
    : recommendations.some((event) => event.severity === "WARN")
      ? "WATCH"
      : "NORMAL";

  return {
    windowHours: 24,
    pressure,
    totalEstimatedCostMicros,
    totalEstimatedCost: dollarsFromMicros(totalEstimatedCostMicros),
    totalWorkloadUnits,
    usageCount: usages.length,
    usageByFeature,
    policies: policyList,
    openEvents,
    recommendations,
  };
}

async function buildObservabilitySummary(prisma, companyId, scoreHealth) {
  const [activeJobs, workerReports, recentEvents, budget] = await Promise.all([
    prisma.pipelineJob.findMany({
      where: { companyId, status: { in: ["ACTIVE", "RUNNING", "FAILED"] } },
      orderBy: [{ updatedAt: "desc" }],
      take: 10,
    }),
    prisma.workerReport.findMany({
      orderBy: [{ createdAt: "desc" }],
      take: 10,
    }),
    prisma.outcomeEvent.findMany({
      where: { companyId },
      orderBy: [{ createdAt: "desc" }],
      take: 10,
    }),
    buildBudgetSummary(prisma, companyId),
  ]);

  const guardianHeartbeat = readGuardianHeartbeat();
  const failedJobs = activeJobs.filter((job) => job.status === "FAILED").length;
  const runningJobs = activeJobs.filter((job) => job.status === "RUNNING").length;
  const normalizedScoreHealth = scoreHealth
    ? {
        ...scoreHealth,
        alerts: normalizeAlerts(scoreHealth.alerts),
        taskcards: scoreHealth.taskcards ? { ...scoreHealth.taskcards, alerts: normalizeAlerts(scoreHealth.taskcards.alerts) } : scoreHealth.taskcards,
        knowledge: scoreHealth.knowledge ? { ...scoreHealth.knowledge, alerts: normalizeAlerts(scoreHealth.knowledge.alerts) } : scoreHealth.knowledge,
      }
    : null;
  const criticalAlert = normalizedScoreHealth?.alerts?.find((alert) => alert.severity === "CRITICAL") ?? null;
  const evaluationFailures = recentEvents.filter((event) => event.outcomeType === "EVAL_GATE_FAILED");
  const localLearningEvents = recentEvents.filter((event) => String(event.outcomeType || "").startsWith("LOCAL_LEARNING_"));

  return {
    guardianHeartbeat,
    scoreHealth: normalizedScoreHealth,
    queue: {
      totalActiveJobs: activeJobs.length,
      runningJobs,
      failedJobs,
      jobs: activeJobs,
    },
    recommendedActions: {
      escalateScoreRepair: Boolean(criticalAlert || normalizedScoreHealth?.overallBand === "SUSPICIOUS"),
      recoverFailedJobs: failedJobs > 0,
      reviewEvaluationFailures: evaluationFailures.length > 0,
      reviewBudgetPressure: budget.pressure !== "NORMAL" || budget.openEvents.length > 0,
      syncQueue: true,
    },
    evaluation: {
      recentFailures: evaluationFailures,
      failedGateCount: evaluationFailures.length,
    },
    localLearning: {
      recentEvents: localLearningEvents,
      publishedRunCount: localLearningEvents.length,
    },
    budget,
    workerReports,
    recentEvents,
  };
}

async function refreshCompanyIntelligenceSnapshot(prisma, companyId) {
  const progressSetting = await prisma.globalSetting.findUnique({ where: { key: "core_synthesis_progress" } });
  const progress = progressSetting && progressSetting.value && typeof progressSetting.value === "object"
    ? progressSetting.value
    : {};

  const [dataSources, uploadedFiles, topics, flashcards, goals, nbaItems, checklistCount, reviewCount, scoreHealth, analyticsHistory] = await Promise.all([
    prisma.source.count({ where: { companyId } }),
    prisma.uploadedSourceFile.count({ where: { companyId } }),
    prisma.topic.count({ where: { companyId } }),
    prisma.flashcard.count({ where: { companyId, activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] } } }),
    prisma.goalcard.count({ where: { companyId, activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] } } }),
    prisma.nBAItem.count({ where: { companyId, activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] } } }),
    prisma.nBAItem.count({
      where: {
        companyId,
        kanbanColumn: "CHECKLIST",
        activityState: { in: ["ACTIVE", "STALE"] },
        processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED"] },
        OR: [{ scheduledDate: null }, { scheduledDate: { lte: new Date() } }],
      },
    }),
    prisma.nBAItem.count({
      where: {
        companyId,
        processingStatus: "REVIEW",
        activityState: { in: ["ACTIVE", "STALE"] },
      },
    }),
    computeCompanyScoreHealth(companyId, prisma),
    buildAnalyticsHistory(prisma, companyId),
  ]);

  const normalizedScoreHealth = scoreHealth
    ? {
        ...scoreHealth,
        alerts: normalizeAlerts(scoreHealth.alerts),
        taskcards: scoreHealth.taskcards ? { ...scoreHealth.taskcards, alerts: normalizeAlerts(scoreHealth.taskcards.alerts) } : scoreHealth.taskcards,
        knowledge: scoreHealth.knowledge ? { ...scoreHealth.knowledge, alerts: normalizeAlerts(scoreHealth.knowledge.alerts) } : scoreHealth.knowledge,
      }
    : null;
  const knowmoreHealth = await buildKnowmoreHealth(prisma, companyId, normalizedScoreHealth);
  const observabilitySummary = await buildObservabilitySummary(prisma, companyId, normalizedScoreHealth);

  const metrics = {
    synthesisYield: Number(progress?.metrics?.companiesCoveredThisCycle || 0),
    confidenceAvg: 0,
    iceScoreAvg: 0,
    easeScoreAvg: 0,
  };

  return prisma.intelligenceSnapshot.upsert({
    where: { companyId },
    update: {
      dataIngressCount: dataSources + uploadedFiles,
      topicSynthesisCount: topics,
      knowmoreCount: flashcards,
      strategicGoalsCount: goals,
      checklistCount,
      tacticalBoardCount: nbaItems,
      reviewGatewayCount: reviewCount,
      synthesisYield: metrics.synthesisYield,
      confidenceAvg: metrics.confidenceAvg,
      iceScoreAvg: metrics.iceScoreAvg,
      easeScoreAvg: metrics.easeScoreAvg,
      engineStatus: typeof progress?.state === "string" ? progress.state.toUpperCase() : "OFFLINE",
      activeContext: typeof progress?.currentCompany === "string" ? progress.currentCompany : "IDLE",
      activeTask: typeof progress?.activeTask === "string" ? progress.activeTask : "Scanning...",
      stage: typeof progress?.stage === "string" ? progress.stage : "IDLE",
      analyticsHistory,
      scoreHealth: normalizedScoreHealth || {},
      knowmoreHealth,
      observabilitySummary,
    },
    create: {
      companyId,
      dataIngressCount: dataSources + uploadedFiles,
      topicSynthesisCount: topics,
      knowmoreCount: flashcards,
      strategicGoalsCount: goals,
      checklistCount,
      tacticalBoardCount: nbaItems,
      reviewGatewayCount: reviewCount,
      synthesisYield: metrics.synthesisYield,
      confidenceAvg: metrics.confidenceAvg,
      iceScoreAvg: metrics.iceScoreAvg,
      easeScoreAvg: metrics.easeScoreAvg,
      engineStatus: typeof progress?.state === "string" ? progress.state.toUpperCase() : "OFFLINE",
      activeContext: typeof progress?.currentCompany === "string" ? progress.currentCompany : "IDLE",
      activeTask: typeof progress?.activeTask === "string" ? progress.activeTask : "Scanning...",
      stage: typeof progress?.stage === "string" ? progress.stage : "IDLE",
      analyticsHistory,
      scoreHealth: normalizedScoreHealth || {},
      knowmoreHealth,
      observabilitySummary,
    },
  });
}

async function refreshAllIntelligenceSnapshots(prisma) {
  const companies = await prisma.company.findMany({ select: { id: true } });
  for (const company of companies) {
    await refreshCompanyIntelligenceSnapshot(prisma, company.id);
  }
}

module.exports = {
  refreshCompanyIntelligenceSnapshot,
  refreshAllIntelligenceSnapshots,
};
