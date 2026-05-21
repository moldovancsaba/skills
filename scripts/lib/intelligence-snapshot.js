const fs = require("fs");
const path = require("path");
const { computeCompanyScoreHealth } = require("../../src/lib/score-health");
const { gatherCompanyPipelineSignals } = require("../../src/lib/pipeline-queue");
const { scoreProfileQuality } = require("../../src/lib/scoring-contract");
const {
  getWorkerBuildIdentity,
  listPlannerTelemetry,
  buildPlannerStateSnapshot,
  buildPlannerEventSummary,
} = require("./planner/telemetry");

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_KNOWLEDGE_SAMPLE_FOR_SCORE_HEALTH = 8;
const HEARTBEAT_FILE = path.join(__dirname, "..", "..", "logs", "guardian-heartbeat.json");
const SNAPSHOT_REFRESH_META_KEY = "local_ai_snapshot_refresh_meta";
const PROJECTION_REFRESH_STATE_KEY = "local_ai_webapp_projection_refresh_state";
const PROJECTION_RECENT_REFRESH_LIMIT = 24;
const WEBAPP_PROJECTION_VERSION = 1;
const KNOWMORE_PIPELINE_JOB_TYPES = Object.freeze([
  "ENSURE_FLASHCARD_MINIMUM",
  "RESEARCH_BACKFILL",
  "REFRESH_FLASHCARDS",
  "REFRESH_DATACARDS",
  "FEEDBACK_RECONCILIATION",
  "CARD_RESCORING",
  "COMPANY_SYNTHESIS",
]);

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

function buildProjectionHomeCharts(analyticsHistory = []) {
  const history = Array.isArray(analyticsHistory) ? analyticsHistory.slice(-14) : [];
  return {
    data: history.map((point) => ({ date: point.date, value: Number(point.sources ?? point.dataIngress ?? 0) })),
    topics: history.map((point) => ({ date: point.date, value: Number(point.topics ?? point.topicSynthesis ?? 0) })),
    goals: history.map((point) => ({ date: point.date, value: Number(point.goals ?? point.strategicGoals ?? point.checklist ?? point.nba ?? 0) })),
    review: history.map((point) => ({ date: point.date, value: Number(point.reviewGateway ?? point.checklist ?? point.nba ?? 0) })),
    knowmore: history.map((point) => ({ date: point.date, value: Number(point.flashcards ?? point.knowmore ?? 0) })),
    tactical: history.map((point) => ({ date: point.date, value: Number(point.tacticalBoard ?? point.tacticalCount ?? point.checklistTasks ?? point.nba ?? 0) })),
    checklist: history.map((point) => ({ date: point.date, value: Number(point.checklist ?? point.nba ?? 0) })),
  };
}

function normalizeTagSelectionKey(tags = []) {
  return [...new Set((Array.isArray(tags) ? tags : []).map((tag) => String(tag || "").trim().toLowerCase()).filter(Boolean))]
    .sort()
    .join("|");
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeProjectionRefreshState(value) {
  const dirtyCompanies = Array.isArray(value?.dirtyCompanies)
    ? value.dirtyCompanies.filter((entry) => isPlainObject(entry) && typeof entry.companyId === "string" && entry.companyId)
    : [];
  const recentRefreshes = Array.isArray(value?.recentRefreshes)
    ? value.recentRefreshes.filter((entry) => isPlainObject(entry) && typeof entry.companyId === "string" && entry.companyId)
    : [];
  return {
    dirtyCompanies,
    recentRefreshes: recentRefreshes.slice(-PROJECTION_RECENT_REFRESH_LIMIT),
  };
}

function getProjectionBackfillStatus(webappProjection) {
  if (!isPlainObject(webappProjection)) return "MISSING";
  const version = Number(webappProjection.version || 0);
  if (version < WEBAPP_PROJECTION_VERSION) return "OUTDATED_VERSION";
  if (typeof webappProjection.generatedAt !== "string" || !webappProjection.generatedAt) return "MISSING";
  const generatedMs = new Date(webappProjection.generatedAt).getTime();
  if (!Number.isFinite(generatedMs)) return "MISSING";
  return "READY";
}

function enqueueDirtyProjectionCompany(state, companyId, reason = "projection-repair", now = new Date()) {
  const normalized = normalizeProjectionRefreshState(state);
  const requestedAt = now.toISOString();
  const nextDirty = normalized.dirtyCompanies.filter((entry) => entry.companyId !== companyId);
  nextDirty.push({
    companyId,
    reason,
    requestedAt,
  });
  return {
    dirtyCompanies: nextDirty.sort((left, right) => new Date(left.requestedAt).getTime() - new Date(right.requestedAt).getTime()),
    recentRefreshes: normalized.recentRefreshes,
  };
}

function drainDirtyProjectionCompanies(state, limit = 3) {
  const normalized = normalizeProjectionRefreshState(state);
  const boundedLimit = Math.max(1, Math.min(20, Number(limit || 3)));
  return {
    drained: normalized.dirtyCompanies.slice(0, boundedLimit),
    remaining: normalized.dirtyCompanies.slice(boundedLimit),
    recentRefreshes: normalized.recentRefreshes,
  };
}

function recordProjectionRefreshResult(state, result, now = new Date()) {
  const normalized = normalizeProjectionRefreshState(state);
  const event = {
    companyId: result.companyId,
    companyName: result.companyName || null,
    reason: result.reason || "projection-refresh",
    status: result.status || "REFRESHED",
    trigger: result.trigger || "background-dirty-drain",
    refreshedAt: now.toISOString(),
    error: result.error || null,
  };
  return {
    dirtyCompanies: normalized.dirtyCompanies,
    recentRefreshes: [...normalized.recentRefreshes, event].slice(-PROJECTION_RECENT_REFRESH_LIMIT),
  };
}

async function readProjectionRefreshState(prisma) {
  const setting = await prisma.globalSetting.findUnique({
    where: { key: PROJECTION_REFRESH_STATE_KEY },
    select: { value: true },
  });
  return normalizeProjectionRefreshState(setting?.value);
}

async function writeProjectionRefreshState(prisma, state) {
  const normalized = normalizeProjectionRefreshState(state);
  await prisma.globalSetting.upsert({
    where: { key: PROJECTION_REFRESH_STATE_KEY },
    create: { key: PROJECTION_REFRESH_STATE_KEY, value: normalized },
    update: { value: normalized, updatedAt: new Date() },
  });
  return normalized;
}

async function markCompanyProjectionDirty(prisma, companyId, reason = "projection-repair") {
  if (!companyId) return null;
  const nextState = enqueueDirtyProjectionCompany(
    await readProjectionRefreshState(prisma),
    companyId,
    reason,
    new Date(),
  );
  return writeProjectionRefreshState(prisma, nextState);
}

function summarizeCardQuality(records = []) {
  const entries = (Array.isArray(records) ? records : [])
    .map((record) => scoreProfileQuality(record?.scoreProfile, record || {}))
    .filter(Boolean);
  if (entries.length === 0) {
    return {
      sampleSize: 0,
      averages: {
        evidenceQuality: 0,
        linguisticQuality: 0,
        actionabilityQuality: 0,
        strategicValue: 0,
        aggregate: 0,
      },
      weakestDimension: null,
      degradationCounts: {
        evidenceQuality: 0,
        linguisticQuality: 0,
        actionabilityQuality: 0,
        strategicValue: 0,
      },
    };
  }

  const averages = {
    evidenceQuality: 0,
    linguisticQuality: 0,
    actionabilityQuality: 0,
    strategicValue: 0,
    aggregate: 0,
  };
  const degradationCounts = {
    evidenceQuality: 0,
    linguisticQuality: 0,
    actionabilityQuality: 0,
    strategicValue: 0,
  };

  for (const entry of entries) {
    averages.evidenceQuality += Number(entry.evidenceQuality || 0);
    averages.linguisticQuality += Number(entry.linguisticQuality || 0);
    averages.actionabilityQuality += Number(entry.actionabilityQuality || 0);
    averages.strategicValue += Number(entry.strategicValue || 0);
    averages.aggregate += Number(entry.aggregate || 0);
    if (entry.weakestDimension && degradationCounts[entry.weakestDimension] !== undefined) {
      degradationCounts[entry.weakestDimension] += 1;
    }
  }

  for (const key of Object.keys(averages)) {
    averages[key] = Math.round((averages[key] / entries.length) * 100) / 100;
  }

  const weakestDimension = Object.entries(degradationCounts)
    .sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;

  return {
    sampleSize: entries.length,
    averages,
    weakestDimension,
    degradationCounts,
  };
}

function combinations(items, maxSize = 3) {
  const values = [...new Set(items)].sort();
  const results = [[]];

  function walk(start, current) {
    if (current.length > 0) {
      results.push([...current]);
    }
    if (current.length >= maxSize) return;
    for (let index = start; index < values.length; index += 1) {
      current.push(values[index]);
      walk(index + 1, current);
      current.pop();
    }
  }

  walk(0, []);
  return results;
}

async function buildFeedbackAnalytics(prisma, companyId) {
  const checklistTasks = await prisma.checklistTask.findMany({
    where: { companyId },
    include: { feedback: true },
    orderBy: { createdAt: "desc" },
  });

  const totalItems = checklistTasks.length;
  const itemsWithFeedback = checklistTasks.filter((item) => item.feedback.length > 0);
  const acceptedItems = checklistTasks.filter((item) => item.status === "ACCEPTED");
  const declinedItems = checklistTasks.filter((item) => item.status === "DECLINED");
  const pendingItems = checklistTasks.filter((item) => item.status === "PENDING");
  const overallAcceptanceRate = totalItems > 0
    ? (acceptedItems.length / Math.max(1, acceptedItems.length + declinedItems.length)) * 100
    : 0;

  const typeStats = {};
  for (const item of checklistTasks) {
    const key = String(item.title || "").trim() || "Untitled";
    if (!typeStats[key]) typeStats[key] = { accepted: 0, declined: 0, total: 0 };
    typeStats[key].total += 1;
    if (item.status === "ACCEPTED") typeStats[key].accepted += 1;
    if (item.status === "DECLINED") typeStats[key].declined += 1;
  }

  const recommendationTypeStats = Object.entries(typeStats)
    .map(([type, stats]) => ({
      type,
      ...stats,
      acceptanceRate: stats.total > 0 ? (stats.accepted / Math.max(1, stats.accepted + stats.declined)) * 100 : 0,
    }))
    .sort((left, right) => right.acceptanceRate - left.acceptanceRate);

  const declineAnnotations = checklistTasks
    .filter((item) => item.status === "DECLINED" && item.userAnnotation)
    .map((item) => ({ title: item.title, annotation: item.userAnnotation }));

  const declinePatterns = [];
  const patternKeywords = [
    { keyword: "already", pattern: "Already implemented" },
    { keyword: "not relevant", pattern: "Not relevant to business" },
    { keyword: "no budget", pattern: "Budget constraints" },
    { keyword: "too complex", pattern: "Too complex" },
    { keyword: "timing", pattern: "Wrong timing" },
    { keyword: "priority", pattern: "Not a priority" },
    { keyword: "resource", pattern: "Resource constraints" },
    { keyword: "team", pattern: "Team capacity" },
  ];

  for (const { keyword, pattern } of patternKeywords) {
    const matches = declineAnnotations.filter((item) => String(item.annotation || "").toLowerCase().includes(keyword));
    if (matches.length > 0) {
      declinePatterns.push({
        pattern,
        count: matches.length,
        examples: matches.slice(0, 3).map((item) => item.annotation),
      });
    }
  }

  const unmatchedAnnotations = declineAnnotations.filter((item) =>
    !patternKeywords.some((entry) => String(item.annotation || "").toLowerCase().includes(entry.keyword)),
  );
  if (unmatchedAnnotations.length > 0) {
    declinePatterns.push({
      pattern: "Other reasons",
      count: unmatchedAnnotations.length,
      examples: unmatchedAnnotations.slice(0, 3).map((item) => item.annotation),
    });
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);
  const recentItems = checklistTasks.filter((item) => item.createdAt >= sevenDaysAgo);
  const monthItems = checklistTasks.filter((item) => item.createdAt >= thirtyDaysAgo);

  const recentAcceptanceRate = recentItems.length > 0
    ? (recentItems.filter((item) => item.status === "ACCEPTED").length /
      Math.max(1, recentItems.filter((item) => item.status === "ACCEPTED" || item.status === "DECLINED").length)) * 100
    : 0;
  const monthAcceptanceRate = monthItems.length > 0
    ? (monthItems.filter((item) => item.status === "ACCEPTED").length /
      Math.max(1, monthItems.filter((item) => item.status === "ACCEPTED" || item.status === "DECLINED").length)) * 100
    : 0;

  const insights = [];
  const highAcceptanceTypes = recommendationTypeStats.filter((item) => item.acceptanceRate >= 75 && item.total >= 2);
  if (highAcceptanceTypes.length > 0) {
    insights.push({
      type: "recommendation",
      title: "High-performing recommendation types",
      description: `These recommendation types have ${highAcceptanceTypes[0].acceptanceRate.toFixed(0)}%+ acceptance: ${highAcceptanceTypes.map((item) => item.type).join(", ")}.`,
      confidence: 85,
    });
  }
  const lowAcceptanceTypes = recommendationTypeStats.filter((item) => item.acceptanceRate < 30 && item.total >= 2);
  if (lowAcceptanceTypes.length > 0) {
    insights.push({
      type: "warning",
      title: "Low-performing recommendation types",
      description: `These types are frequently declined: ${lowAcceptanceTypes.map((item) => item.type).join(", ")}.`,
      confidence: 80,
    });
  }
  if (declinePatterns.length > 0) {
    insights.push({
      type: "pattern",
      title: `Top decline reason: ${declinePatterns[0].pattern}`,
      description: `${declinePatterns[0].count} items declined for this reason.`,
      confidence: 70,
    });
  }
  if (monthItems.length >= 5) {
    const trend = recentAcceptanceRate > monthAcceptanceRate ? "improving" : "declining";
    insights.push({
      type: "pattern",
      title: `Acceptance rate is ${trend}`,
      description: `7-day rate: ${recentAcceptanceRate.toFixed(1)}%, 30-day rate: ${monthAcceptanceRate.toFixed(1)}%.`,
      confidence: 65,
    });
  }

  const avgAcceptedIceScore = acceptedItems.length > 0
    ? acceptedItems.reduce((sum, item) => sum + Number(item.iceScore || 0), 0) / acceptedItems.length
    : 0;
  const avgDeclinedIceScore = declinedItems.length > 0
    ? declinedItems.reduce((sum, item) => sum + Number(item.iceScore || 0), 0) / declinedItems.length
    : 0;

  return {
    overview: {
      totalItems,
      itemsWithFeedback: itemsWithFeedback.length,
      accepted: acceptedItems.length,
      declined: declinedItems.length,
      pending: pendingItems.length,
      overallAcceptanceRate: overallAcceptanceRate.toFixed(1),
    },
    recommendationTypeStats,
    declinePatterns,
    trends: {
      sevenDayAcceptanceRate: recentAcceptanceRate.toFixed(1),
      thirtyDayAcceptanceRate: monthAcceptanceRate.toFixed(1),
      avgAcceptedIceScore: avgAcceptedIceScore.toFixed(1),
      avgDeclinedIceScore: avgDeclinedIceScore.toFixed(1),
    },
    insights,
  };
}

async function buildHashtagAnalytics(prisma, companyId) {
  const [sources, files, flashcards, checklist] = await Promise.all([
    prisma.source.findMany({ where: { companyId }, select: { hashtags: true } }),
    prisma.uploadedSourceFile.findMany({ where: { companyId }, select: { hashtags: true } }),
    prisma.flashcard.findMany({ where: { companyId }, select: { hashtags: true } }),
    prisma.checklistTask.findMany({ where: { companyId }, select: { hashtags: true } }),
  ]);

  const records = [...sources, ...files, ...flashcards, ...checklist].map((record) =>
    [...new Set((Array.isArray(record.hashtags) ? record.hashtags : []).map((tag) => String(tag || "").trim().toLowerCase()).filter(Boolean))].sort(),
  );

  const globalCounts = new Map();
  const countsBySelection = new Map();

  for (const tags of records) {
    for (const tag of tags) {
      globalCounts.set(tag, (globalCounts.get(tag) ?? 0) + 1);
    }

    for (const selection of combinations(tags, 3)) {
      const key = normalizeTagSelectionKey(selection);
      const bucket = countsBySelection.get(key) ?? new Map();
      for (const tag of tags) {
        if (selection.includes(tag)) continue;
        bucket.set(tag, (bucket.get(tag) ?? 0) + 1);
      }
      countsBySelection.set(key, bucket);
    }
  }

  const rank = (entries) =>
    [...entries.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([tag]) => tag);

  const popular = rank(globalCounts).slice(0, 12);
  const recommendationsBySelection = {};
  for (const [key, counts] of countsBySelection.entries()) {
    recommendationsBySelection[key] = rank(counts).slice(0, 12);
  }

  return {
    popular,
    recommendationsBySelection,
  };
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
    prisma.checklistTask.count({ where: { companyId, createdAt: { lt: thirtyDaysAgo } } }),
  ]);

  const [sources, files, topics, flashcards, goals, nba] = await Promise.all([
    prisma.source.findMany({ where: { companyId, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true } }),
    prisma.uploadedSourceFile.findMany({ where: { companyId, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true } }),
    prisma.topic.findMany({ where: { companyId, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true } }),
    prisma.flashcard.findMany({ where: { companyId, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true } }),
    prisma.goalcard.findMany({ where: { companyId, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true } }),
    prisma.checklistTask.findMany({ where: { companyId, createdAt: { gte: thirtyDaysAgo } }, select: { createdAt: true } }),
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
        jobType: { in: KNOWMORE_PIPELINE_JOB_TYPES },
      },
    }),
    prisma.pipelineJob.findMany({
      where: {
        companyId,
        jobType: { in: KNOWMORE_PIPELINE_JOB_TYPES },
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
  const [activeJobs, workerReports, recentEvents, budget, plannerSignals, plannerEvents, flashcards, goals, tasks, opportunitycards, opportunitycardRepairSetting] = await Promise.all([
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
    gatherCompanyPipelineSignals(prisma, companyId),
    listPlannerTelemetry(prisma, { companyId, limit: 20 }),
    prisma.flashcard.findMany({
      where: { companyId, activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] } },
      select: {
        scoreProfile: true,
        confidenceScore: true,
        impact: true,
        weight: true,
        title: true,
        body: true,
        kind: true,
        evidence: true,
        hashtags: true,
      },
      take: 100,
    }),
    prisma.goalcard.findMany({
      where: { companyId, activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] } },
      select: {
        scoreProfile: true,
        confidenceScore: true,
        impact: true,
        weight: true,
        title: true,
        body: true,
        kind: true,
        evidence: true,
        hashtags: true,
      },
      take: 100,
    }),
    prisma.checklistTask.findMany({
      where: { companyId, activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] } },
      select: {
        scoreProfile: true,
        confidenceScore: true,
        impact: true,
        ease: true,
        qualityScore: true,
        title: true,
        description: true,
        kind: true,
        hashtags: true,
      },
      take: 100,
    }),
    prisma.opportunitycard.count({
      where: {
        companyId,
        departmentKey: "SALES",
        activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] },
      },
    }),
    prisma.globalSetting.findUnique({
      where: { key: "opportunitycard_score_contract_repair_v1" },
      select: { value: true, updatedAt: true },
    }),
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
  const salesSearchJobs = activeJobs.filter((job) => job.jobType === "SEARCH_OPPORTUNITYCARDS");
  const salesMineJobs = activeJobs.filter((job) => job.jobType === "MINE_OPPORTUNITYCARDS");
  const plannerState = buildPlannerStateSnapshot(plannerSignals);
  const plannerEventSummary = buildPlannerEventSummary(plannerEvents);
  const repairValue =
    opportunitycardRepairSetting?.value && typeof opportunitycardRepairSetting.value === "object" && !Array.isArray(opportunitycardRepairSetting.value)
      ? opportunitycardRepairSetting.value
      : {};
  const opportunitycardRepair = {
    version: Number(repairValue.version || 1),
    status: typeof repairValue.status === "string" ? repairValue.status : "PENDING",
    processed: Number(repairValue.processed || 0),
    updated: Number(repairValue.updated || 0),
    lastBatchProcessed: Number(repairValue.lastBatchProcessed || 0),
    lastBatchUpdated: Number(repairValue.lastBatchUpdated || 0),
    batchesProcessed: Number(repairValue.batchesProcessed || 0),
    startedAt: typeof repairValue.startedAt === "string" ? repairValue.startedAt : null,
    lastRunAt: typeof repairValue.lastRunAt === "string" ? repairValue.lastRunAt : null,
    completedAt: typeof repairValue.completedAt === "string" ? repairValue.completedAt : null,
    lastError: typeof repairValue.lastError === "string" ? repairValue.lastError : null,
    cursor: repairValue.cursor && typeof repairValue.cursor === "object" && !Array.isArray(repairValue.cursor)
      ? repairValue.cursor
      : null,
    stateUpdatedAt: opportunitycardRepairSetting?.updatedAt ? new Date(opportunitycardRepairSetting.updatedAt).toISOString() : null,
  };
  const qualityByCardType = {
    flashcards: summarizeCardQuality(flashcards),
    goals: summarizeCardQuality(goals),
    tasks: summarizeCardQuality(tasks),
  };

  return {
    guardianHeartbeat,
    workerBuild: getWorkerBuildIdentity(),
    scoreHealth: normalizedScoreHealth,
    queue: {
      totalActiveJobs: activeJobs.length,
      runningJobs,
      failedJobs,
      jobs: activeJobs,
    },
    sales: {
      opportunitycards,
      searchQueued: salesSearchJobs.filter((job) => job.status === "ACTIVE").length,
      searchRunning: salesSearchJobs.filter((job) => job.status === "RUNNING").length,
      searchFailed: salesSearchJobs.filter((job) => job.status === "FAILED").length,
      mineQueued: salesMineJobs.filter((job) => job.status === "ACTIVE").length,
      mineRunning: salesMineJobs.filter((job) => job.status === "RUNNING").length,
      mineFailed: salesMineJobs.filter((job) => job.status === "FAILED").length,
    },
    opportunitycardRepair,
    planner: {
      ...plannerState,
      ...plannerEventSummary,
      recentEvents: plannerEvents,
    },
    quality: {
      flashcards: qualityByCardType.flashcards,
      goals: qualityByCardType.goals,
      tasks: qualityByCardType.tasks,
    },
    recommendedActions: {
      escalateScoreRepair: Boolean(criticalAlert || normalizedScoreHealth?.overallBand === "SUSPICIOUS"),
      reviewOpportunitycardRepair: opportunitycardRepair.status !== "COMPLETED",
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

  const [dataSources, uploadedFiles, topics, flashcards, goals, opportunitycards, checklistTasks, checklistCount, reviewCount, laneCountRows, flashcardAverages, reviewedFlashcards, scoreHealth, analyticsHistory, feedbackAnalytics, hashtagAnalytics] = await Promise.all([
    prisma.source.count({ where: { companyId } }),
    prisma.uploadedSourceFile.count({ where: { companyId } }),
    prisma.topic.count({ where: { companyId } }),
    prisma.flashcard.count({ where: { companyId, activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] } } }),
    prisma.goalcard.count({ where: { companyId, activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] } } }),
    prisma.opportunitycard.count({
      where: {
        companyId,
        departmentKey: "SALES",
        activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] },
      },
    }),
    prisma.checklistTask.count({ where: { companyId, activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] } } }),
    prisma.checklistTask.count({
      where: {
        companyId,
        kanbanColumn: "CHECKLIST",
        activityState: { in: ["ACTIVE", "STALE"] },
        processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED"] },
        OR: [{ scheduledDate: null }, { scheduledDate: { lte: new Date() } }],
      },
    }),
    prisma.checklistTask.count({
      where: {
        companyId,
        processingStatus: "REVIEW",
        activityState: { in: ["ACTIVE", "STALE"] },
      },
    }),
    prisma.checklistTask.groupBy({
      by: ["kanbanColumn"],
      where: {
        companyId,
        activityState: { in: ["ACTIVE", "STALE"] },
        processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED"] },
      },
      _count: { _all: true },
    }),
    prisma.flashcard.aggregate({
      where: {
        companyId,
        activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] },
      },
      _avg: {
        confidenceScore: true,
        iceScore: true,
        weight: true,
      },
    }),
    prisma.flashcard.count({
      where: {
        companyId,
        activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] },
        processingStatus: { in: ["ACCEPTED", "DECLINED"] },
      },
    }),
    computeCompanyScoreHealth(companyId, prisma),
    buildAnalyticsHistory(prisma, companyId),
    buildFeedbackAnalytics(prisma, companyId),
    buildHashtagAnalytics(prisma, companyId),
  ]);
  const laneCounts = {
    IDEABANK: 0,
    ROADMAP: 0,
    BACKLOG: 0,
    TODO: 0,
    CHECKLIST: 0,
  };
  for (const row of laneCountRows) {
    if (Object.prototype.hasOwnProperty.call(laneCounts, row.kanbanColumn)) {
      laneCounts[row.kanbanColumn] = Number(row._count?._all || 0);
    }
  }

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
  const topTasks = await prisma.checklistTask.findMany({
    where: {
      companyId,
      kanbanColumn: "CHECKLIST",
      activityState: { in: ["ACTIVE", "STALE"] },
      processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED"] },
      OR: [{ scheduledDate: null }, { scheduledDate: { lte: new Date() } }],
    },
    orderBy: { iceScore: "desc" },
    take: 3,
    select: {
      id: true,
      publicId: true,
      title: true,
      description: true,
      impact: true,
      confidenceScore: true,
      ease: true,
      iceScore: true,
      processingStatus: true,
      activityState: true,
      kanbanColumn: true,
      scheduledDate: true,
      userAnnotation: true,
      hashtags: true,
      createdAt: true,
      updatedAt: true,
      generatedAt: true,
    },
  });
  const queueSummary =
    observabilitySummary && typeof observabilitySummary.queue === "object" && observabilitySummary.queue
      ? observabilitySummary.queue
      : {};
  const webappProjection = {
    version: WEBAPP_PROJECTION_VERSION,
    generatedAt: new Date().toISOString(),
    counts: {
      sources: dataSources + uploadedFiles,
      files: uploadedFiles,
      topics,
      flashcards,
      goals,
      sales: opportunitycards,
      tacticalCount: Math.max(checklistTasks, checklistCount),
      checklistCount,
      reviewCount,
      pipelineJobs: Number(queueSummary.totalActiveJobs || 0),
    },
    homeCharts: buildProjectionHomeCharts(analyticsHistory),
    planningSummary: {
      laneCounts,
      tacticalCount: Math.max(checklistTasks, checklistCount),
      checklistCount,
    },
    navCounts: {
      data: dataSources + uploadedFiles,
      topics,
      knowmore: flashcards,
      goals,
      sales: opportunitycards,
      review: reviewCount,
      checklist: checklistCount,
      tactical: Math.max(checklistTasks, checklistCount),
      pipeline: Number(queueSummary.totalActiveJobs || 0),
    },
    topTasks: topTasks.map((task) => ({
      ...task,
      scheduledDate: task.scheduledDate ? task.scheduledDate.toISOString() : null,
      createdAt: task.createdAt ? task.createdAt.toISOString() : null,
      updatedAt: task.updatedAt ? task.updatedAt.toISOString() : null,
      generatedAt: task.generatedAt ? task.generatedAt.toISOString() : null,
    })),
  };

  const metrics = {
    synthesisYield: flashcards > 0 ? Math.round((Number(reviewedFlashcards || 0) / flashcards) * 100) : 0,
    confidenceAvg: Math.round(Number(flashcardAverages?._avg?.confidenceScore || 0)),
    iceScoreAvg: Math.round(Number(flashcardAverages?._avg?.iceScore || 0)),
    easeScoreAvg: Math.round(Number(flashcardAverages?._avg?.weight || 0)),
  };

  return prisma.intelligenceSnapshot.upsert({
    where: { companyId },
    update: {
      dataIngressCount: dataSources + uploadedFiles,
      topicSynthesisCount: topics,
      knowmoreCount: flashcards,
      strategicGoalsCount: goals,
      checklistCount,
      tacticalBoardCount: checklistTasks,
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
      webappProjection,
      feedbackAnalytics,
      hashtagAnalytics,
    },
    create: {
      companyId,
      dataIngressCount: dataSources + uploadedFiles,
      topicSynthesisCount: topics,
      knowmoreCount: flashcards,
      strategicGoalsCount: goals,
      checklistCount,
      tacticalBoardCount: checklistTasks,
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
      webappProjection,
      feedbackAnalytics,
      hashtagAnalytics,
    },
  });
}

async function refreshAllIntelligenceSnapshots(prisma) {
  const companies = await prisma.company.findMany({ select: { id: true } });
  for (const company of companies) {
    await refreshCompanyIntelligenceSnapshot(prisma, company.id);
  }
}

async function readSnapshotRefreshMeta(prisma) {
  const record = await prisma.globalSetting.findUnique({
    where: { key: SNAPSHOT_REFRESH_META_KEY },
  });
  const value = record?.value && typeof record.value === "object" ? record.value : {};
  return {
    cursorCompanyId: typeof value.cursorCompanyId === "string" ? value.cursorCompanyId : null,
    lastRunAt: value.lastRunAt ? new Date(String(value.lastRunAt)) : null,
    lastCompletedPassAt: value.lastCompletedPassAt ? new Date(String(value.lastCompletedPassAt)) : null,
  };
}

async function writeSnapshotRefreshMeta(prisma, next) {
  return prisma.globalSetting.upsert({
    where: { key: SNAPSHOT_REFRESH_META_KEY },
    update: { value: next },
    create: { key: SNAPSHOT_REFRESH_META_KEY, value: next },
  });
}

async function refreshIntelligenceSnapshotSlice(prisma, options = {}) {
  const batchSize = Math.max(1, Math.min(10, Number(options.batchSize || 2)));
  const meta = await readSnapshotRefreshMeta(prisma);

  let companies = await prisma.company.findMany({
    orderBy: { id: "asc" },
    take: batchSize,
    ...(meta.cursorCompanyId
      ? {
          cursor: { id: meta.cursorCompanyId },
          skip: 1,
        }
      : {}),
    select: { id: true },
  });

  let wrapped = false;
  if (companies.length === 0) {
    companies = await prisma.company.findMany({
      orderBy: { id: "asc" },
      take: batchSize,
      select: { id: true },
    });
    wrapped = true;
  }

  for (const company of companies) {
    await refreshCompanyIntelligenceSnapshot(prisma, company.id);
  }

  const nextCursorCompanyId = companies.length > 0 ? companies[companies.length - 1].id : meta.cursorCompanyId;
  const payload = {
    cursorCompanyId: nextCursorCompanyId,
    lastRunAt: new Date().toISOString(),
    lastCompletedPassAt: wrapped ? new Date().toISOString() : (meta.lastCompletedPassAt ? meta.lastCompletedPassAt.toISOString() : null),
  };
  await writeSnapshotRefreshMeta(prisma, payload);

  return {
    refreshedCompanies: companies.length,
    wrapped,
    cursorCompanyId: nextCursorCompanyId,
    lastCompletedPassAt: payload.lastCompletedPassAt,
  };
}

async function refreshDirtyCompanyIntelligenceSnapshots(prisma, options = {}) {
  const trigger = typeof options.trigger === "string" ? options.trigger : "background-dirty-drain";
  const limit = Math.max(1, Math.min(20, Number(options.limit || 3)));
  const state = await readProjectionRefreshState(prisma);
  const plan = drainDirtyProjectionCompanies(state, limit);
  if (plan.drained.length === 0) {
    return {
      refreshedCompanies: 0,
      dirtyCompaniesRemaining: plan.remaining.length,
      recentRefreshes: plan.recentRefreshes,
    };
  }

  let nextState = {
    dirtyCompanies: plan.remaining,
    recentRefreshes: plan.recentRefreshes,
  };
  let refreshedCompanies = 0;

  for (const entry of plan.drained) {
    try {
      await refreshCompanyIntelligenceSnapshot(prisma, entry.companyId);
      refreshedCompanies += 1;
      const company = await prisma.company.findUnique({
        where: { id: entry.companyId },
        select: { name: true },
      });
      nextState = recordProjectionRefreshResult(nextState, {
        companyId: entry.companyId,
        companyName: company?.name || null,
        reason: entry.reason,
        status: "REFRESHED",
        trigger,
      });
    } catch (error) {
      console.error(
        `[INTELLIGENCE SNAPSHOT] Failed targeted projection refresh for ${entry.companyId}: ${error?.code || error?.name || "UNKNOWN"} ${error?.message || ""}`.trim(),
      );
      nextState = recordProjectionRefreshResult(nextState, {
        companyId: entry.companyId,
        reason: entry.reason,
        status: "FAILED",
        trigger,
        error: error?.message || String(error),
      });
      nextState = enqueueDirtyProjectionCompany(nextState, entry.companyId, entry.reason, new Date());
    }
  }

  const persisted = await writeProjectionRefreshState(prisma, nextState);
  return {
    refreshedCompanies,
    dirtyCompaniesRemaining: persisted.dirtyCompanies.length,
    recentRefreshes: persisted.recentRefreshes,
  };
}

async function refreshMissingProjectionSnapshots(prisma, options = {}) {
  const trigger = typeof options.trigger === "string" ? options.trigger : "projection-backfill";
  const limit = Math.max(1, Math.min(20, Number(options.limit || 3)));
  const companies = await prisma.company.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      name: true,
      intelligenceSnapshot: {
        select: {
          webappProjection: true,
        },
      },
    },
  });

  const candidates = companies.filter((company) => {
    const status = getProjectionBackfillStatus(company.intelligenceSnapshot?.webappProjection);
    return status !== "READY";
  });

  if (candidates.length === 0) {
    return {
      refreshedCompanies: 0,
      remainingCandidates: 0,
      candidateIds: [],
    };
  }

  const selected = candidates.slice(0, limit);
  let refreshedCompanies = 0;
  let nextState = await readProjectionRefreshState(prisma);

  for (const company of selected) {
    try {
      await refreshCompanyIntelligenceSnapshot(prisma, company.id);
      refreshedCompanies += 1;
      nextState = recordProjectionRefreshResult(nextState, {
        companyId: company.id,
        companyName: company.name || null,
        reason: "cold-start-backfill",
        status: "REFRESHED",
        trigger,
      });
    } catch (error) {
      console.error(
        `[INTELLIGENCE SNAPSHOT] Failed projection backfill for ${company.id}: ${error?.code || error?.name || "UNKNOWN"} ${error?.message || ""}`.trim(),
      );
      nextState = recordProjectionRefreshResult(nextState, {
        companyId: company.id,
        companyName: company.name || null,
        reason: "cold-start-backfill",
        status: "FAILED",
        trigger,
        error: error?.message || String(error),
      });
      nextState = enqueueDirtyProjectionCompany(nextState, company.id, "cold-start-backfill", new Date());
    }
  }

  await writeProjectionRefreshState(prisma, nextState);

  return {
    refreshedCompanies,
    remainingCandidates: Math.max(0, candidates.length - refreshedCompanies),
    candidateIds: selected.map((company) => company.id),
  };
}

module.exports = {
  drainDirtyProjectionCompanies,
  enqueueDirtyProjectionCompany,
  getProjectionBackfillStatus,
  markCompanyProjectionDirty,
  normalizeProjectionRefreshState,
  recordProjectionRefreshResult,
  refreshCompanyIntelligenceSnapshot,
  refreshAllIntelligenceSnapshots,
  refreshDirtyCompanyIntelligenceSnapshots,
  refreshIntelligenceSnapshotSlice,
  refreshMissingProjectionSnapshots,
};
