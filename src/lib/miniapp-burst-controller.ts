import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolveDestinationKeyForVisitorWithHint } from "@/lib/visitor-blueprints";
import { assertMiniappIntelligenceContract } from "@/lib/miniapp-intelligence-contracts";
import { getVisitorPublicVerificationSummary } from "@/lib/visitor-public-verification";
import { planMiniappResearchTasks } from "@/lib/miniapp-research-planner";
import { runMiniappEvidenceRuntimeOnce } from "@/lib/miniapp-evidence-runtime";
import { promoteMiniappEvidenceToOpportunities } from "@/lib/miniapp-opportunity-lifecycle";
import { evaluateMiniappPromotionGates } from "@/lib/miniapp-promotion-gates";

export type MiniappBurstControllerInput = {
  companyId: string;
  visitorKey: string;
  destinationKeyHint?: unknown;
  targetVisibleCards?: number;
  maxCycles?: number;
  tasksPerCycle?: number;
};

export type MiniappBurstCycleResult = {
  cycle: number;
  startedAt: string;
  finishedAt: string;
  publishedBefore: number;
  publishedAfter: number;
  targetVisibleCards: number;
  shouldContinue: boolean;
  continueReason: string;
  plannedCount: number;
  evidenceTaskCount: number;
  evidenceArtifactCount: number;
  promotedCount: number;
  gatePassedCount: number;
  blockedCount: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function burstStateKey(companyId: string, visitorKey: string) {
  return `miniapp_burst_controller:${companyId}:${visitorKey.trim().toLowerCase()}`;
}

async function writeBurstState(input: {
  companyId: string;
  visitorKey: string;
  value: Record<string, unknown>;
}) {
  const key = burstStateKey(input.companyId, input.visitorKey);
  await prisma.globalSetting.upsert({
    where: { key },
    create: { key, value: input.value as Prisma.InputJsonValue },
    update: { value: input.value as Prisma.InputJsonValue },
  });
}

export async function getMiniappBurstControllerState(companyId: string, visitorKey: string) {
  const row = await prisma.globalSetting.findUnique({ where: { key: burstStateKey(companyId, visitorKey) } });
  return asRecord(row?.value);
}

export async function runMiniappBurstCycle(input: MiniappBurstControllerInput & { cycle?: number }) {
  const destinationKey = resolveDestinationKeyForVisitorWithHint(input.visitorKey, input.destinationKeyHint);
  if (!destinationKey) throw new Error("Unsupported visitorKey");
  const contract = assertMiniappIntelligenceContract({ destinationKeyHint: destinationKey });
  const targetVisibleCards = Math.max(
    1,
    Number(input.targetVisibleCards)
      || contract.coverageGoals.reduce((sum, goal) => sum + goal.targetVisibleCards, 0)
      || 100,
  );
  const tasksPerCycle = Math.max(1, Math.min(10, Number(input.tasksPerCycle) || 3));
  const startedAt = new Date().toISOString();
  const before = await getVisitorPublicVerificationSummary(input.companyId, input.visitorKey, destinationKey);
  const planned = await planMiniappResearchTasks({
    companyId: input.companyId,
    visitorKey: input.visitorKey,
    destinationKeyHint: destinationKey,
    targetVisibleCards,
    limit: 100,
  });
  const evidence = await runMiniappEvidenceRuntimeOnce({
    companyId: input.companyId,
    visitorKey: input.visitorKey,
    destinationKeyHint: destinationKey,
    maxTasks: tasksPerCycle,
  });
  const promoted = await promoteMiniappEvidenceToOpportunities({
    companyId: input.companyId,
    visitorKey: input.visitorKey,
    destinationKeyHint: destinationKey,
    limit: 50,
  });
  const gates = await evaluateMiniappPromotionGates({
    companyId: input.companyId,
    visitorKey: input.visitorKey,
    destinationKeyHint: destinationKey,
    limit: 50,
  });
  const after = await getVisitorPublicVerificationSummary(input.companyId, input.visitorKey, destinationKey);
  const shouldContinue = after.publishedCount < targetVisibleCards;
  const continueReason = shouldContinue
    ? `verified_public_visible_cards ${after.publishedCount}/${targetVisibleCards}`
    : "target_visible_cards_reached";
  const finishedAt = new Date().toISOString();
  const result: MiniappBurstCycleResult = {
    cycle: Number(input.cycle) || 1,
    startedAt,
    finishedAt,
    publishedBefore: before.publishedCount,
    publishedAfter: after.publishedCount,
    targetVisibleCards,
    shouldContinue,
    continueReason,
    plannedCount: planned.plannedCount,
    evidenceTaskCount: evidence.runnableCount,
    evidenceArtifactCount: evidence.taskResults.reduce((sum, task) => sum + task.artifactCount, 0),
    promotedCount: promoted.promotedCount,
    gatePassedCount: gates.passedCount,
    blockedCount: gates.blockedCount,
  };
  await writeBurstState({
    companyId: input.companyId,
    visitorKey: input.visitorKey,
    value: {
      visitorKey: input.visitorKey.toLowerCase(),
      destinationKey,
      contractKey: contract.key,
      sourceCardInventoryIsSuccess: false,
      successMetric: contract.promotionPolicy.successMetric,
      lastCycle: result,
      updatedAt: finishedAt,
    },
  });
  return result;
}

export async function runMiniappBurstUntilTarget(input: MiniappBurstControllerInput) {
  const maxCycles = Math.max(1, Math.min(25, Number(input.maxCycles) || 1));
  const cycles: MiniappBurstCycleResult[] = [];
  for (let index = 0; index < maxCycles; index += 1) {
    const cycle = await runMiniappBurstCycle({ ...input, cycle: index + 1 });
    cycles.push(cycle);
    if (!cycle.shouldContinue) break;
  }
  const last = cycles[cycles.length - 1] ?? null;
  const state = {
    ok: true,
    visitorKey: input.visitorKey.toLowerCase(),
    targetVisibleCards: last?.targetVisibleCards ?? (Number(input.targetVisibleCards) || 100),
    sourceCardInventoryIsSuccess: false,
    stoppedBecause: last?.shouldContinue ? "max_cycles_reached_before_target" : "target_visible_cards_reached",
    recommendedNextDelayMs: last?.shouldContinue ? 2_000 : null,
    cycles,
  };
  await writeBurstState({
    companyId: input.companyId,
    visitorKey: input.visitorKey,
    value: {
      ...state,
      updatedAt: new Date().toISOString(),
    },
  });
  return state;
}
