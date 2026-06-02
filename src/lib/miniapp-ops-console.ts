import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ensureDestinationInstance } from "@/lib/destination-workflows";
import { resolveMiniappIntelligenceContract } from "@/lib/miniapp-intelligence-contracts";
import { getVisitorPublicVerificationSummary } from "@/lib/visitor-public-verification";
import { listMiniappResearchTasks, MINIAPP_RESEARCH_TASK_SOURCE_TYPE } from "@/lib/miniapp-research-planner";
import { MINIAPP_EVIDENCE_ARTIFACT_SOURCE_TYPE, runMiniappEvidenceRuntimeOnce } from "@/lib/miniapp-evidence-runtime";
import { listMiniappOpportunityCards, promoteMiniappEvidenceToOpportunities } from "@/lib/miniapp-opportunity-lifecycle";
import { evaluateMiniappPromotionGates } from "@/lib/miniapp-promotion-gates";
import { getMiniappBurstControllerState, runMiniappBurstUntilTarget } from "@/lib/miniapp-burst-controller";
import { listMiniappLearningMemory, syncMiniappLearningMemory, upsertMiniappLearningRules } from "@/lib/miniapp-learning-memory";

export type MiniappOpsAction =
  | "replan"
  | "run_burst"
  | "run_evidence"
  | "promote_opportunities"
  | "evaluate_gates"
  | "sync_learning"
  | "retry_task"
  | "pause_burst"
  | "resume_burst"
  | "suppress_domain"
  | "override_suppression";

type OpsInput = {
  companyId: string;
  miniappKey: string;
  destinationKeyHint?: unknown;
};

type ActionInput = OpsInput & {
  action: MiniappOpsAction;
  taskId?: string;
  sourceTerm?: string;
  reason?: string;
  targetVisibleCards?: number;
  maxCycles?: number;
  tasksPerCycle?: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((entry) => asString(entry)).filter(Boolean);
}

function asNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function opsStateKey(companyId: string, miniappKey: string) {
  return `miniapp_ops_console:${companyId}:${miniappKey.trim().toLowerCase()}`;
}

async function readOpsState(companyId: string, miniappKey: string) {
  const row = await prisma.globalSetting.findUnique({ where: { key: opsStateKey(companyId, miniappKey) } });
  return asRecord(row?.value);
}

async function writeOpsState(companyId: string, miniappKey: string, patch: Record<string, unknown>) {
  const existing = await readOpsState(companyId, miniappKey);
  const value = {
    ...existing,
    ...patch,
    miniappKey: miniappKey.toLowerCase(),
    updatedAt: new Date().toISOString(),
  };
  await prisma.globalSetting.upsert({
    where: { key: opsStateKey(companyId, miniappKey) },
    create: { key: opsStateKey(companyId, miniappKey), value: value as Prisma.InputJsonValue },
    update: { value: value as Prisma.InputJsonValue },
  });
  return value;
}

async function resolveOpsContext(input: OpsInput) {
  const resolved = resolveMiniappIntelligenceContract({
    miniappKey: input.miniappKey,
    visitorKey: input.miniappKey,
    destinationKeyHint: input.destinationKeyHint,
  });
  if (!resolved.validation.valid) {
    throw new Error(`Invalid miniapp intelligence contract: ${resolved.validation.errors.join("; ")}`);
  }
  const instance = await ensureDestinationInstance(input.companyId, resolved.contract.destinationKey);
  return {
    contract: resolved.contract,
    validation: resolved.validation,
    destinationKey: resolved.contract.destinationKey,
    visitorKey: resolved.contract.miniappKey,
    instance,
  };
}

function summarizeBlockers(input: {
  tasks: Array<{ status: string; blockedDomains?: string[] }>;
  opportunities: Array<{ status: string; blockingReasons?: string[] }>;
  candidates: Array<{ metadata: unknown }>;
  learning: Array<{ code: string; action: string; reason: string }>;
}) {
  const counts = new Map<string, { code: string; count: number; recommendedAction: string }>();
  const add = (code: string, recommendedAction: string) => {
    if (!code) return;
    const current = counts.get(code) ?? { code, count: 0, recommendedAction };
    current.count += 1;
    counts.set(code, current);
  };
  for (const task of input.tasks) {
    if (task.status === "NO_RESULTS") add("no_results", "Sync learning memory, then re-plan with broader query terms.");
    if (task.status === "FAILED") add("task_failed", "Retry task or re-plan if failure repeats.");
    if (task.status === "EXHAUSTED") add("task_exhausted", "Review retry budget and suppress weak domains before re-planning.");
  }
  for (const opportunity of input.opportunities) {
    for (const reason of opportunity.blockingReasons ?? []) add(reason, "Review evidence score or suppress the weak source.");
  }
  for (const candidate of input.candidates) {
    const gate = asRecord(asRecord(candidate.metadata).miniappPromotionGate);
    for (const reason of asStringArray(gate.blockingReasons)) add(reason, "Fix the candidate gate failure before review.");
  }
  for (const rule of input.learning) {
    add(rule.code, rule.action === "suppress_domain" ? "Keep suppressed or override with a reason." : rule.reason);
  }
  return [...counts.values()].sort((left, right) => right.count - left.count || left.code.localeCompare(right.code));
}

export async function getMiniappOpsSnapshot(input: OpsInput) {
  const { contract, validation, destinationKey, visitorKey, instance } = await resolveOpsContext(input);
  const opsState = await readOpsState(input.companyId, contract.miniappKey);
  const [publicVerification, burst, tasks, opportunities, learning, candidates, evidenceRows] = await Promise.all([
    getVisitorPublicVerificationSummary(input.companyId, visitorKey, destinationKey),
    getMiniappBurstControllerState(input.companyId, visitorKey),
    listMiniappResearchTasks(input.companyId, visitorKey, destinationKey),
    listMiniappOpportunityCards(input.companyId, visitorKey, destinationKey),
    listMiniappLearningMemory(input.companyId, visitorKey),
    prisma.destinationCandidate.findMany({
      where: { companyId: input.companyId, destinationInstanceId: instance.id },
      select: { id: true, canonicalSourceUrl: true, proposedType: true, status: true, metadata: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.destinationSourceDocument.findMany({
      where: {
        companyId: input.companyId,
        destinationInstanceId: instance.id,
        sourceType: MINIAPP_EVIDENCE_ARTIFACT_SOURCE_TYPE,
      },
      select: { id: true, sourceUrl: true, httpStatus: true, officialnessScore: true, metadata: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
  ]);
  const targetVisibleCards = Math.max(100, contract.coverageGoals.reduce((sum, goal) => sum + goal.targetVisibleCards, 0));
  const taskRows = tasks.map((task) => ({
    id: task.id,
    fingerprint: task.fingerprint,
    status: task.status,
    query: task.query,
    priority: task.priority,
    attemptCount: task.attemptCount,
    coverageGoalId: task.coverageGoalId,
    expectedEvidenceType: task.expectedEvidenceType,
    updatedAt: task.updatedAt,
  }));
  const opportunityRows = opportunities.map((opportunity) => ({
    id: opportunity.id,
    candidateId: opportunity.candidateId,
    status: opportunity.status,
    title: opportunity.title,
    sourceUrl: opportunity.sourceUrl,
    candidateScore: opportunity.candidateScore,
    blockingReasons: opportunity.blockingReasons,
    nextAction: opportunity.status === "CANDIDATE" ? "Evaluate promotion gate" : "Loop through learning memory and re-plan",
  }));
  const evidence = evidenceRows.map((row) => {
    const artifact = asRecord(asRecord(row.metadata).miniappEvidenceArtifact);
    return {
      id: row.id,
      sourceUrl: asString(artifact.finalUrl) || asString(artifact.sourceUrl) || asString(row.sourceUrl),
      title: asString(artifact.title) || asString(row.sourceUrl),
      status: asString(artifact.status) || "UNKNOWN",
      provider: asString(artifact.provider),
      evidenceType: asString(artifact.evidenceType),
      relevanceScore: asNumber(artifact.relevanceScore),
      authorityScore: asNumber(artifact.authorityScore || row.officialnessScore),
      httpStatus: asNumber(artifact.httpStatus || row.httpStatus),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
  const candidateRows = candidates.map((candidate) => {
    const metadata = asRecord(candidate.metadata);
    const gate = asRecord(metadata.miniappPromotionGate);
    return {
      id: candidate.id,
      status: asString(metadata.visitorCandidateState) || candidate.status,
      proposedType: candidate.proposedType,
      sourceUrl: candidate.canonicalSourceUrl,
      gatePassed: gate.passed === true,
      blockingReasons: asStringArray(gate.blockingReasons),
      reviewReasons: asStringArray(gate.reviewReasons),
      updatedAt: candidate.updatedAt.toISOString(),
    };
  });
  const blockers = summarizeBlockers({ tasks: taskRows, opportunities: opportunityRows, candidates, learning });
  const paused = opsState.paused === true;
  const lifecycleState =
    paused ? "paused"
      : publicVerification.publishedCount >= targetVisibleCards ? "complete"
        : blockers.length > 0 ? "blocked"
          : tasks.some((task) => task.status === "RUNNING") ? "active"
            : tasks.some((task) => task.status === "EXHAUSTED") ? "exhausted"
              : tasks.length === 0 ? "empty"
                : "active";

  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    correlationId: `miniapp-ops-${Date.now()}`,
    miniappKey: contract.miniappKey,
    visitorKey,
    destinationKey,
    lifecycleState,
    paused,
    contract: {
      key: contract.key,
      valid: validation.valid,
      errors: validation.errors,
      successMetric: contract.promotionPolicy.successMetric,
      sourceCardInventoryIsSuccess: contract.promotionPolicy.sourceCardInventoryIsSuccess,
      coverageGoals: contract.coverageGoals,
    },
    target: {
      targetVisibleCards,
      publicVisibleCards: publicVerification.publishedCount,
      remainingVisibleCards: Math.max(0, targetVisibleCards - publicVerification.publishedCount),
      progressPercent: targetVisibleCards > 0 ? Math.round((publicVerification.publishedCount / targetVisibleCards) * 100) : 0,
    },
    publicVerification,
    burst,
    researchTasks: taskRows,
    evidence,
    opportunities: opportunityRows,
    candidates: candidateRows,
    learningMemory: learning,
    blockers,
    actions: {
      canPause: !paused,
      canResume: paused,
      canRunBurst: !paused,
      canReplan: !paused,
      canRetry: !paused,
    },
    diagnostics: {
      stale: false,
      partial: false,
      opsState,
    },
  };
}

export async function executeMiniappOpsAction(input: ActionInput) {
  const { contract, destinationKey, visitorKey } = await resolveOpsContext(input);
  const opsState = await readOpsState(input.companyId, contract.miniappKey);
  const paused = opsState.paused === true;
  const startedAt = new Date().toISOString();

  if (paused && !["resume_burst", "override_suppression"].includes(input.action)) {
    return {
      ok: false,
      code: "miniapp_ops_paused",
      retryable: true,
      diagnostics: { paused, action: input.action, startedAt },
      correlationId: `miniapp-action-${Date.now()}`,
    };
  }

  let result: unknown = null;
  if (input.action === "pause_burst") {
    result = await writeOpsState(input.companyId, contract.miniappKey, {
      paused: true,
      pauseReason: input.reason || "operator_pause",
      pausedAt: startedAt,
    });
  } else if (input.action === "resume_burst") {
    result = await writeOpsState(input.companyId, contract.miniappKey, {
      paused: false,
      resumedAt: startedAt,
      resumeReason: input.reason || "operator_resume",
    });
  } else if (input.action === "replan") {
    const { planMiniappResearchTasks } = await import("@/lib/miniapp-research-planner");
    result = await planMiniappResearchTasks({
      companyId: input.companyId,
      visitorKey,
      destinationKeyHint: destinationKey,
      targetVisibleCards: input.targetVisibleCards || 100,
      limit: 100,
    });
  } else if (input.action === "run_burst") {
    result = await runMiniappBurstUntilTarget({
      companyId: input.companyId,
      visitorKey,
      destinationKeyHint: destinationKey,
      targetVisibleCards: input.targetVisibleCards || 100,
      maxCycles: input.maxCycles || 1,
      tasksPerCycle: input.tasksPerCycle || 3,
    });
  } else if (input.action === "run_evidence") {
    result = await runMiniappEvidenceRuntimeOnce({
      companyId: input.companyId,
      visitorKey,
      destinationKeyHint: destinationKey,
      taskId: input.taskId,
      maxTasks: input.tasksPerCycle || 1,
    });
  } else if (input.action === "promote_opportunities") {
    result = await promoteMiniappEvidenceToOpportunities({ companyId: input.companyId, visitorKey, destinationKeyHint: destinationKey, limit: 50 });
  } else if (input.action === "evaluate_gates") {
    result = await evaluateMiniappPromotionGates({ companyId: input.companyId, visitorKey, destinationKeyHint: destinationKey, limit: 50 });
  } else if (input.action === "sync_learning") {
    result = await syncMiniappLearningMemory({ companyId: input.companyId, visitorKey, destinationKeyHint: destinationKey, limit: 100 });
  } else if (input.action === "retry_task") {
    if (!input.taskId) throw new Error("taskId is required");
    const taskRow = await prisma.destinationSourceDocument.findFirst({
      where: {
        companyId: input.companyId,
        sourceType: MINIAPP_RESEARCH_TASK_SOURCE_TYPE,
        OR: [{ id: input.taskId }, { sourceUrl: { contains: input.taskId } }],
      },
      select: { id: true, metadata: true },
    });
    if (!taskRow) throw new Error("Research task not found");
    const metadata = asRecord(taskRow.metadata);
    const task = asRecord(metadata.miniappResearchTask);
    result = await prisma.destinationSourceDocument.update({
      where: { id: taskRow.id },
      data: {
        metadata: {
          ...metadata,
          miniappResearchTask: {
            ...task,
            status: "QUEUED",
            updatedAt: startedAt,
          },
          miniappResearchTaskRetryRequested: {
            taskId: input.taskId,
            requestedAt: startedAt,
            reason: input.reason || "operator_retry",
          },
        } as never,
      },
      select: { id: true },
    });
  } else if (input.action === "suppress_domain" || input.action === "override_suppression") {
    if (!input.sourceTerm) throw new Error("sourceTerm is required");
    result = await upsertMiniappLearningRules(input.companyId, visitorKey, [{
      code: input.action === "suppress_domain" ? "operator_suppression" : "operator_override",
      action: input.action === "suppress_domain" ? "suppress_domain" : "lower_priority",
      sourceTerm: input.sourceTerm,
      reason: input.reason || input.action,
      severity: input.action === "suppress_domain" ? "blocking" : "warning",
    }]);
  } else {
    throw new Error(`Unsupported miniapp ops action: ${input.action}`);
  }

  await writeOpsState(input.companyId, contract.miniappKey, {
    lastAction: input.action,
    lastActionAt: new Date().toISOString(),
  });

  return {
    ok: true,
    code: "miniapp_ops_action_completed",
    retryable: false,
    correlationId: `miniapp-action-${Date.now()}`,
    diagnostics: {
      action: input.action,
      startedAt,
      finishedAt: new Date().toISOString(),
    },
    result,
  };
}
