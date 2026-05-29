import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { countLocalOutcomeEvents } from "@/lib/local-audit-db";

const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_POLICIES = [
  { feature: "pipeline-queue", dailyEstimatedCostMicros: 250000, dailyWorkloadUnitsLimit: 120, retryLimit: 6, externalRequestLimit: 20 },
  { feature: "evaluation-bench", dailyEstimatedCostMicros: 150000, dailyWorkloadUnitsLimit: 60, retryLimit: 3, externalRequestLimit: 5 },
  { feature: "observability", dailyEstimatedCostMicros: 75000, dailyWorkloadUnitsLimit: 40, retryLimit: 4, externalRequestLimit: 5 },
];

type UsageInput = {
  companyId: string;
  feature: string;
  jobType?: string | null;
  provider?: string | null;
  modelName?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  usageKind?: "ESTIMATED" | "ACTUAL";
  workloadUnits?: number;
  runtimeMs?: number;
  localComputeMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  externalRequests?: number;
  retryCount?: number;
  estimatedCostMicros?: number;
  actualCostMicros?: number;
  valueSignal?: string;
  metadata?: Record<string, unknown>;
};

function boundNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : fallback;
}

export function estimateWorkloadCostMicros(input: {
  workloadUnits?: number;
  runtimeMs?: number;
  externalRequests?: number;
  retryCount?: number;
  inputTokens?: number;
  outputTokens?: number;
}) {
  return boundNumber(
    (input.workloadUnits ?? 1) * 2500
      + (input.runtimeMs ?? 0) * 2
      + (input.externalRequests ?? 0) * 1500
      + (input.retryCount ?? 0) * 1000
      + Math.ceil(((input.inputTokens ?? 0) + (input.outputTokens ?? 0)) / 1000) * 500,
  );
}

export async function recordAiWorkloadUsage(input: UsageInput) {
  const workloadUnits = Math.max(0.1, Number(input.workloadUnits ?? 1));
  const runtimeMs = boundNumber(input.runtimeMs);
  const externalRequests = boundNumber(input.externalRequests);
  const retryCount = boundNumber(input.retryCount);
  const inputTokens = boundNumber(input.inputTokens);
  const outputTokens = boundNumber(input.outputTokens);
  const estimatedCostMicros = boundNumber(
    input.estimatedCostMicros,
    estimateWorkloadCostMicros({ workloadUnits, runtimeMs, externalRequests, retryCount, inputTokens, outputTokens }),
  );

  return prisma.aiWorkloadUsage.create({
    data: {
      companyId: input.companyId,
      feature: input.feature,
      jobType: input.jobType || undefined,
      provider: input.provider || "local",
      modelName: input.modelName || undefined,
      entityType: input.entityType || "SYSTEM",
      entityId: input.entityId || input.companyId,
      usageKind: input.usageKind || "ESTIMATED",
      workloadUnits,
      runtimeMs,
      localComputeMs: boundNumber(input.localComputeMs),
      inputTokens,
      outputTokens,
      externalRequests,
      retryCount,
      estimatedCostMicros,
      actualCostMicros: input.actualCostMicros === undefined ? undefined : boundNumber(input.actualCostMicros),
      valueSignal: input.valueSignal || "UNKNOWN",
      metadata: (input.metadata || {}) as Prisma.InputJsonValue,
    },
  });
}

function dollarsFromMicros(micros: number) {
  return Math.round((micros / 1_000_000) * 100) / 100;
}

function summarizeUsage(usages: Array<{
  feature: string;
  estimatedCostMicros: number;
  actualCostMicros: number | null;
  workloadUnits: number;
  runtimeMs: number;
  externalRequests: number;
  retryCount: number;
}>) {
  const byFeature = new Map<string, {
    feature: string;
    estimatedCostMicros: number;
    actualCostMicros: number;
    workloadUnits: number;
    runtimeMs: number;
    externalRequests: number;
    retryCount: number;
    records: number;
  }>();

  for (const usage of usages) {
    const existing = byFeature.get(usage.feature) || {
      feature: usage.feature,
      estimatedCostMicros: 0,
      actualCostMicros: 0,
      workloadUnits: 0,
      runtimeMs: 0,
      externalRequests: 0,
      retryCount: 0,
      records: 0,
    };
    existing.estimatedCostMicros += usage.estimatedCostMicros;
    existing.actualCostMicros += usage.actualCostMicros ?? 0;
    existing.workloadUnits += usage.workloadUnits;
    existing.runtimeMs += usage.runtimeMs;
    existing.externalRequests += usage.externalRequests;
    existing.retryCount += usage.retryCount;
    existing.records += 1;
    byFeature.set(usage.feature, existing);
  }

  return Array.from(byFeature.values())
    .map((item) => ({
      ...item,
      estimatedCost: dollarsFromMicros(item.estimatedCostMicros),
      actualCost: dollarsFromMicros(item.actualCostMicros),
    }))
    .sort((a, b) => b.estimatedCostMicros - a.estimatedCostMicros);
}

function virtualPolicies(policies: Array<{
  feature: string;
  status: string;
  dailyEstimatedCostMicros: number;
  dailyWorkloadUnitsLimit: number;
  retryLimit: number;
  externalRequestLimit: number;
  controlMode: string;
}>) {
  const policyMap = new Map(policies.map((policy) => [policy.feature, policy]));
  for (const policy of DEFAULT_POLICIES) {
    if (!policyMap.has(policy.feature)) {
      policyMap.set(policy.feature, {
        ...policy,
        status: "VIRTUAL_DEFAULT",
        controlMode: "MONITOR",
      });
    }
  }
  return Array.from(policyMap.values());
}

function recommendedBudgetEvents(params: {
  usageByFeature: ReturnType<typeof summarizeUsage>;
  policies: ReturnType<typeof virtualPolicies>;
  activeJobs: Array<{ status: string; attemptCount: number; jobType: string; updatedAt: Date }>;
  evaluationFailureCount: number;
}) {
  const events = [];
  const policyMap = new Map(params.policies.map((policy) => [policy.feature, policy]));

  for (const usage of params.usageByFeature) {
    const policy = policyMap.get(usage.feature);
    if (!policy) continue;
    if (usage.estimatedCostMicros > policy.dailyEstimatedCostMicros) {
      events.push({
        feature: usage.feature,
        eventType: "DAILY_ESTIMATED_COST_LIMIT",
        severity: "WARN",
        valueAssessment: usage.retryCount > policy.retryLimit ? "POSSIBLE_WASTE" : "HIGH_COST_HIGH_VALUE_REVIEW",
        recommendation: "Review cost drivers, then cache/reuse, batch, or require review for repeated low-value work.",
        evidence: { usage, policy },
      });
    }
    if (usage.retryCount > policy.retryLimit) {
      events.push({
        feature: usage.feature,
        eventType: "RETRY_LIMIT_PRESSURE",
        severity: "WARN",
        valueAssessment: "POSSIBLE_WASTE",
        recommendation: "Inspect retry causes before allowing more autonomous attempts.",
        evidence: { retryCount: usage.retryCount, retryLimit: policy.retryLimit },
      });
    }
  }

  const failedJobs = params.activeJobs.filter((job) => job.status === "FAILED");
  const highRetryJobs = params.activeJobs.filter((job) => job.attemptCount >= 3);
  if (failedJobs.length || highRetryJobs.length) {
    events.push({
      feature: "pipeline-queue",
      eventType: "QUEUE_RETRY_OR_FAILURE_PRESSURE",
      severity: failedJobs.length > 2 ? "CRITICAL" : "WARN",
      valueAssessment: "POSSIBLE_WASTE",
      recommendation: "Recover failed jobs only after reviewing repeated failure reasons; consider pause or review-required controls.",
      evidence: {
        failedJobs: failedJobs.length,
        highRetryJobs: highRetryJobs.length,
        jobTypes: Array.from(new Set([...failedJobs, ...highRetryJobs].map((job) => job.jobType))).slice(0, 6),
      },
    });
  }

  if (params.evaluationFailureCount > 0) {
    events.push({
      feature: "evaluation-bench",
      eventType: "FAILED_EVAL_REPLAY",
      severity: "INFO",
      valueAssessment: "HIGH_COST_HIGH_VALUE_REVIEW",
      recommendation: "Keep evaluation replay visible as internal quality-governance work before promoting candidate behavior.",
      evidence: { evaluationFailureCount: params.evaluationFailureCount },
    });
  }

  return events;
}

export async function getCompanyBudgetSnapshot(companyId: string) {
  const since = new Date(Date.now() - DAY_MS);
  const [usages, policies, openEvents, activeJobs, evaluationFailures] = await Promise.all([
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
    countLocalOutcomeEvents({
      where: { companyId, outcomeType: "EVAL_GATE_FAILED", createdAt: { gte: since } },
    }),
  ]);

  const usageByFeature = summarizeUsage(usages);
  const totalEstimatedCostMicros = usageByFeature.reduce((sum, item) => sum + item.estimatedCostMicros, 0);
  const totalWorkloadUnits = Math.round(usageByFeature.reduce((sum, item) => sum + item.workloadUnits, 0) * 10) / 10;
  const policyList = virtualPolicies(policies);
  const recommendations = recommendedBudgetEvents({
    usageByFeature,
    policies: policyList,
    activeJobs,
    evaluationFailureCount: evaluationFailures,
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

export async function applyBudgetControl(input: {
  companyId: string;
  feature: string;
  control: "THROTTLE" | "BATCH" | "CACHE_REUSE" | "REVIEW_REQUIRED" | "PAUSE";
  actorEmail?: string | null;
}) {
  const controls = {
    appliedControl: input.control,
    appliedAt: new Date().toISOString(),
    actorEmail: input.actorEmail || null,
  };

  const policy = await prisma.budgetPolicy.upsert({
    where: { companyId_feature: { companyId: input.companyId, feature: input.feature } },
    create: {
      companyId: input.companyId,
      feature: input.feature,
      controlMode: input.control,
      controls,
    },
    update: {
      controlMode: input.control,
      controls,
    },
  });

  const event = await prisma.budgetEvent.create({
    data: {
      companyId: input.companyId,
      feature: input.feature,
      eventType: "BUDGET_CONTROL_APPLIED",
      severity: "INFO",
      status: "RESOLVED",
      recommendation: `Applied ${input.control} control to ${input.feature}.`,
      valueAssessment: input.control === "PAUSE" ? "POSSIBLE_WASTE" : "HIGH_COST_HIGH_VALUE_REVIEW",
      evidence: { policyId: policy.id, controls },
      appliedControl: input.control,
      actorEmail: input.actorEmail || undefined,
      resolvedAt: new Date(),
    },
  });

  return { policy, event };
}
