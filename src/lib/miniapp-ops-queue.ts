import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { buildQueuedMutationResponse, type PlaylistMutationCategory } from "@/lib/local-execution-lanes";
import { resolveMiniappIntelligenceContract } from "@/lib/miniapp-intelligence-contracts";
import type { MiniappOpsAction } from "@/lib/miniapp-ops-console";

type MiniappOpsQueueInput = {
  companyId: string;
  miniappKey: string;
  destinationKeyHint?: unknown;
  action: MiniappOpsAction;
  taskId?: string;
  candidateId?: string;
  sourceTerm?: string;
  reason?: string;
  targetVisibleCards?: number;
  maxCycles?: number;
  tasksPerCycle?: number;
  discoverLimit?: number;
  processLimit?: number;
  autoApprove?: boolean;
  autoPublish?: boolean;
  payload?: Record<string, unknown>;
};

const ACTION_TO_VISITOR_INTENT: Partial<Record<MiniappOpsAction, string>> = {
  replan: "research.tasks.plan",
  run_burst: "research.burst",
  run_evidence: "research.evidence.run",
  promote_opportunities: "research.opportunities.promote",
  evaluate_gates: "research.gates.evaluate",
  sync_learning: "research.learning.sync",
  retry_task: "research.task.retry",
  run_human_lane: "research.humanLane.run",
  candidate_discover: "candidate.discover",
  candidate_extract: "candidate.extract",
  candidate_classify: "candidate.classify",
  candidate_score: "candidate.score",
  candidate_prepare_review: "candidate.prepareReview",
  suppress_domain: "research.learning.suppress",
  override_suppression: "research.learning.overrideSuppression",
};

function asCleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function compactRecord(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== ""));
}

function entitySuffix(input: MiniappOpsQueueInput) {
  const candidateOrTask = asCleanString(input.candidateId) || asCleanString(input.taskId);
  if (candidateOrTask) return candidateOrTask;
  const sourceTerm = asCleanString(input.sourceTerm);
  if (sourceTerm) return sourceTerm.toLowerCase().replace(/[^a-z0-9._:-]+/g, "-").slice(0, 80);
  return "unit";
}

function mutationCategoryForAction(action: MiniappOpsAction): PlaylistMutationCategory {
  if (action.startsWith("candidate_")) return "MINIAPP_CONTENT";
  if (action === "promote_opportunities") return "OPPORTUNITYCARD";
  if (action === "evaluate_gates" || action === "run_evidence" || action === "replan" || action === "run_burst") {
    return "RESEARCH_EVIDENCE";
  }
  if (action === "sync_learning" || action === "suppress_domain" || action === "override_suppression") return "RESEARCH_EVIDENCE";
  if (action === "run_human_lane" || action === "retry_task") return "MINIAPP_CONTENT";
  return "MINIAPP_CONTENT";
}

export function canQueueMiniappOpsAction(action: MiniappOpsAction) {
  return Boolean(ACTION_TO_VISITOR_INTENT[action]);
}

export async function enqueueMiniappOpsAction(input: MiniappOpsQueueInput) {
  const intentKind = ACTION_TO_VISITOR_INTENT[input.action];
  if (!intentKind) {
    throw new Error(`Miniapp ops action ${input.action} does not have a queue intent mapping.`);
  }

  const resolved = resolveMiniappIntelligenceContract({
    miniappKey: input.miniappKey,
    visitorKey: input.miniappKey,
    destinationKeyHint: input.destinationKeyHint,
  });
  if (!resolved.validation.valid) {
    throw new Error(`Invalid miniapp intelligence contract: ${resolved.validation.errors.join("; ")}`);
  }

  const visitorKey = resolved.contract.miniappKey;
  const destinationKey = resolved.contract.destinationKey;
  const candidateId = asCleanString(input.candidateId) || asCleanString(input.taskId);
  const taskId = asCleanString(input.taskId);
  const now = new Date();
  const payload = compactRecord({
    ...(input.payload ?? {}),
    action: input.action,
    taskId: taskId || undefined,
    candidateId: candidateId || undefined,
    sourceTerm: asCleanString(input.sourceTerm) || undefined,
    reason: asCleanString(input.reason) || undefined,
    targetVisibleCards: input.targetVisibleCards,
    maxCycles: input.maxCycles,
    tasksPerCycle: input.tasksPerCycle,
    discoverLimit: input.discoverLimit,
    processLimit: input.processLimit,
    autoApprove: input.autoApprove,
    autoPublish: input.autoPublish,
  });
  const entityId = `${visitorKey}:${intentKind}:${entitySuffix(input)}`.slice(0, 180);
  const metadata = {
    destinationKey,
    miniappKey: visitorKey,
    visitorIntent: compactRecord({
      intentKind,
      visitorKey,
      destinationKey,
      candidateId: candidateId || undefined,
      taskId: taskId || undefined,
      sourceTerm: asCleanString(input.sourceTerm) || undefined,
      reason: asCleanString(input.reason) || undefined,
      payload,
    }),
    playlist: {
      version: 1,
      blockId: "miniapp",
      moduleId: "miniapp",
      miniappId: visitorKey,
      miniappKey: visitorKey,
      anchorAt: now.toISOString(),
      reasonTag: `miniapp-ops:${input.action}`,
      queueColumn: "NOW",
      priorityScore: 160,
      source: "miniapp-ops-actions-api",
      updatedAt: now.toISOString(),
      lastPlannedAt: now.toISOString(),
      laneKey: `block:miniapp|module:miniapp|miniapp:${visitorKey}|action:${input.action}`,
    },
  } as Prisma.InputJsonObject;

  const job = await prisma.pipelineJob.upsert({
    where: {
      companyId_jobType_entityType_entityId: {
        companyId: input.companyId,
        jobType: "RESEARCH_BACKFILL",
        entityType: "MINIAPP_OPS_ACTION",
        entityId,
      },
    },
    create: {
      companyId: input.companyId,
      jobType: "RESEARCH_BACKFILL",
      entityType: "MINIAPP_OPS_ACTION",
      entityId,
      status: "ACTIVE",
      controlMode: "AI_ONLY",
      queueColumn: "NOW",
      manualSortOrder: 0,
      priorityScore: 160,
      reason: `Queued miniapp ops action ${input.action} for ${visitorKey}.`,
      sourceSignal: `miniapp-ops:${visitorKey}:${intentKind}`,
      metadata,
    },
    update: {
      status: "ACTIVE",
      controlMode: "AI_ONLY",
      queueColumn: "NOW",
      scheduledAt: { unset: true },
      lastError: null,
      priorityScore: 160,
      reason: `Queued miniapp ops action ${input.action} for ${visitorKey}.`,
      sourceSignal: `miniapp-ops:${visitorKey}:${intentKind}`,
      metadata,
      updatedAt: now,
    },
  });

  return {
    ok: true,
    code: "miniapp_ops_action_queued",
    retryable: true,
    correlationId: `miniapp-action-queued-${Date.now()}`,
    diagnostics: {
      action: input.action,
      miniappKey: visitorKey,
      destinationKey,
      entityType: "MINIAPP_OPS_ACTION",
      entityId,
    },
    result: buildQueuedMutationResponse({
      jobId: job.id,
      category: mutationCategoryForAction(input.action),
      message: "Miniapp ops work was queued for CHECK Local.",
    }),
  };
}
