import "server-only";

import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ensureDestinationInstance } from "@/lib/destination-workflows";
import { resolveDestinationKeyForVisitorWithHint } from "@/lib/visitor-blueprints";
import {
  assertMiniappIntelligenceContract,
  type MiniappEvidenceType,
  type MiniappIntelligenceContract,
} from "@/lib/miniapp-intelligence-contracts";
import { listVisitorFeedbackMemory } from "@/lib/visitor-learning";
import { listVisitorFlashcards, type VisitorFlashcard } from "@/lib/visitor-knowledge-pack";
import { getVisitorPublicVerificationSummary } from "@/lib/visitor-public-verification";
import { listVisitorSourceDatacards, type VisitorSourceDatacard } from "@/lib/visitor-source-graph";
import { listMiniappLearningMemory } from "@/lib/miniapp-learning-memory";

export const MINIAPP_RESEARCH_TASK_SOURCE_TYPE = "miniapp_research_task";

export type MiniappResearchTaskStatus =
  | "QUEUED"
  | "RUNNING"
  | "FOUND_EVIDENCE"
  | "NO_RESULTS"
  | "FAILED"
  | "EXHAUSTED";

export type MiniappResearchTask = {
  id: string;
  miniappKey: string;
  destinationKey: string;
  contractKey: string;
  coverageGoalId: string;
  query: string;
  locale?: string;
  expectedEvidenceType: MiniappEvidenceType;
  priority: number;
  status: MiniappResearchTaskStatus;
  fingerprint: string;
  blockedDomains: string[];
  attemptCount: number;
  timeoutMs: number;
  createdFrom: {
    datacardIds: string[];
    flashcardIds: string[];
    memoryIds: string[];
  };
  createdAt: string;
  updatedAt: string;
};

type PlannerInput = {
  companyId: string;
  visitorKey: string;
  destinationKeyHint?: unknown;
  targetVisibleCards?: number;
  limit?: number;
};

type ExistingResearchTaskRow = {
  id: string;
  sourceUrl: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((entry) => asString(entry)).filter(Boolean);
}

function asNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizeToken(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeDomain(value: string) {
  const raw = value.trim().toLowerCase();
  if (!raw) return "";
  try {
    const url = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return raw.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || raw;
  }
}

function researchTaskSourceUrl(destinationKey: string, fingerprint: string) {
  return `check://miniapp-research-task/${destinationKey}/${fingerprint}`;
}

export function buildMiniappResearchTaskFingerprint(input: {
  miniappKey: string;
  contractKey: string;
  coverageGoalId: string;
  query: string;
  expectedEvidenceType: MiniappEvidenceType;
}) {
  const payload = [
    input.miniappKey.trim().toLowerCase(),
    input.contractKey.trim().toLowerCase(),
    input.coverageGoalId.trim().toLowerCase(),
    input.query.trim().toLowerCase().replace(/\s+/g, " "),
    input.expectedEvidenceType,
  ];
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function readTaskFromSourceDocument(row: ExistingResearchTaskRow): MiniappResearchTask | null {
  const metadata = asRecord(row.metadata);
  const task = asRecord(metadata?.miniappResearchTask);
  if (!task) return null;
  const createdFrom = asRecord(task.createdFrom) ?? {};
  const fingerprint = asString(task.fingerprint);
  const query = asString(task.query);
  if (!fingerprint || !query) return null;
  return {
    id: row.id,
    miniappKey: asString(task.miniappKey),
    destinationKey: asString(task.destinationKey),
    contractKey: asString(task.contractKey),
    coverageGoalId: asString(task.coverageGoalId),
    query,
    locale: asString(task.locale) || undefined,
    expectedEvidenceType: asString(task.expectedEvidenceType) as MiniappEvidenceType,
    priority: asNumber(task.priority),
    status: (asString(task.status) || "QUEUED") as MiniappResearchTaskStatus,
    fingerprint,
    blockedDomains: asStringArray(task.blockedDomains),
    attemptCount: asNumber(task.attemptCount),
    timeoutMs: asNumber(task.timeoutMs, 15000),
    createdFrom: {
      datacardIds: asStringArray(createdFrom.datacardIds),
      flashcardIds: asStringArray(createdFrom.flashcardIds),
      memoryIds: asStringArray(createdFrom.memoryIds),
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function evidenceTypeForGoal(contract: MiniappIntelligenceContract, category: string): MiniappEvidenceType {
  const lower = category.toLowerCase();
  const allowed = contract.researchPolicy.expectedEvidenceTypes;
  if ((lower.includes("event") || lower.includes("competition") || lower.includes("expo")) && allowed.includes("event_page")) return "event_page";
  if ((lower.includes("association") || lower.includes("club")) && allowed.includes("association_page")) return "association_page";
  if (allowed.includes("official_site")) return "official_site";
  return allowed[0];
}

function extractSourceTerms(datacard: VisitorSourceDatacard) {
  const facts = asRecord(datacard.extractedFacts);
  return unique([
    datacard.sourceTitle ?? "",
    ...datacard.extractionHints.slice(0, 3),
    ...datacard.knownContentTypes.slice(0, 3),
    asString(facts?.name),
    asString(facts?.city),
    asString(facts?.region),
    asString(facts?.country),
  ]).map(normalizeToken).filter(Boolean).slice(0, 6);
}

function extractFlashcardTerms(flashcard: VisitorFlashcard) {
  if (flashcard.disabled) return [];
  return unique([flashcard.front, flashcard.back, ...flashcard.appliesTo])
    .map(normalizeToken)
    .filter((value) => value.length >= 3)
    .slice(0, 4);
}

function computePriority(input: {
  goalPriority: number;
  remainingForGoal: number;
  targetForGoal: number;
  datacardTrust: number;
  flashcardConfidence: number;
  blockedDomainCount: number;
}) {
  const coverageGap = input.targetForGoal > 0 ? clamp(input.remainingForGoal / input.targetForGoal, 0, 1) : 0;
  const sourceDiversity = clamp(input.datacardTrust, 0, 1);
  const historicalSuccess = clamp(input.flashcardConfidence || 0.5, 0, 1);
  const freshness = input.blockedDomainCount > 0 ? 0.6 : 1;
  const score = 0.45 * coverageGap + 0.25 * sourceDiversity + 0.2 * historicalSuccess + 0.1 * freshness;
  return Math.round(clamp(score * 100 + input.goalPriority * 0.2, 1, 120));
}

export function synthesizeMiniappResearchTaskDrafts(input: {
  contract: MiniappIntelligenceContract;
  visitorKey: string;
  targetVisibleCards: number;
  publishedCount: number;
  datacards: VisitorSourceDatacard[];
  flashcards: VisitorFlashcard[];
  memory: Array<{ id: string; sourceTerm?: string; action?: string; severity?: string }>;
  nowIso: string;
  limit: number;
}) {
  const activeDatacards = input.datacards.filter((card) => card.trustTier !== "blocked");
  const activeFlashcards = input.flashcards.filter((card) => !card.disabled);
  const blockedDomains = unique([
    ...input.datacards.filter((card) => card.trustTier === "blocked").map((card) => normalizeDomain(card.canonicalUrl || card.url)).filter(Boolean),
    ...input.memory.filter((rule) => rule.action === "downrank_source" || rule.severity === "blocking").map((rule) => normalizeDomain(rule.sourceTerm || "")).filter(Boolean),
  ]);
  const memoryIds = input.memory.map((rule) => rule.id).filter(Boolean);
  const totalContractTarget = input.contract.coverageGoals.reduce((sum, goal) => sum + goal.targetVisibleCards, 0);
  const targetVisibleCards = Math.max(input.targetVisibleCards, totalContractTarget);
  const drafts: MiniappResearchTask[] = [];

  for (const goal of input.contract.coverageGoals) {
    const allocatedPublished = totalContractTarget > 0
      ? Math.floor(input.publishedCount * (goal.targetVisibleCards / totalContractTarget))
      : 0;
    const remainingForGoal = Math.max(0, goal.targetVisibleCards - allocatedPublished);
    if (input.publishedCount >= targetVisibleCards && remainingForGoal === 0) continue;
    const expectedEvidenceType = evidenceTypeForGoal(input.contract, goal.category);
    const geography = normalizeToken(goal.geography || "");
    const baseTerms = unique([goal.category, geography, input.contract.domainProfile.title]).filter(Boolean);
    const sourceTerms = activeDatacards.flatMap(extractSourceTerms);
    const flashcardTerms = activeFlashcards.flatMap(extractFlashcardTerms);
    const termSets = [
      baseTerms,
      [...baseTerms, ...sourceTerms.slice(0, 2)],
      [...baseTerms, ...flashcardTerms.slice(0, 2)],
      [...baseTerms, "official", expectedEvidenceType.replace(/_/g, " ")],
      [...baseTerms, "directory"],
    ];

    for (const terms of termSets) {
      const query = unique(terms).join(" ").trim();
      if (!query || query.length < 6) continue;
      if (blockedDomains.some((domain) => query.toLowerCase().includes(domain))) continue;
      const datacardIds = activeDatacards
        .filter((card) => extractSourceTerms(card).some((term) => query.includes(term)))
        .map((card) => card.sourceId)
        .slice(0, 5);
      const flashcardIds = activeFlashcards
        .filter((card) => extractFlashcardTerms(card).some((term) => query.includes(term)))
        .map((card) => card.flashcardId)
        .slice(0, 5);
      const datacardTrust = datacardIds.length
        ? activeDatacards.filter((card) => datacardIds.includes(card.sourceId)).reduce((sum, card) => sum + Math.max(card.industryRelevance, card.locationRelevance), 0) / datacardIds.length
        : 0.5;
      const flashcardConfidence = flashcardIds.length
        ? activeFlashcards.filter((card) => flashcardIds.includes(card.flashcardId)).reduce((sum, card) => sum + card.confidence, 0) / flashcardIds.length
        : 0.5;
      const fingerprint = buildMiniappResearchTaskFingerprint({
        miniappKey: input.contract.miniappKey,
        contractKey: input.contract.key,
        coverageGoalId: goal.id,
        query,
        expectedEvidenceType,
      });
      drafts.push({
        id: fingerprint,
        miniappKey: input.contract.miniappKey,
        destinationKey: input.contract.destinationKey,
        contractKey: input.contract.key,
        coverageGoalId: goal.id,
        query,
        locale: goal.geography,
        expectedEvidenceType,
        priority: computePriority({
          goalPriority: goal.priority,
          remainingForGoal,
          targetForGoal: goal.targetVisibleCards,
          datacardTrust,
          flashcardConfidence,
          blockedDomainCount: blockedDomains.length,
        }),
        status: "QUEUED",
        fingerprint,
        blockedDomains,
        attemptCount: 0,
        timeoutMs: input.contract.researchPolicy.timeoutMs,
        createdFrom: { datacardIds, flashcardIds, memoryIds },
        createdAt: input.nowIso,
        updatedAt: input.nowIso,
      });
    }
  }

  const byFingerprint = new Map<string, MiniappResearchTask>();
  for (const draft of drafts.sort((left, right) => right.priority - left.priority || left.query.localeCompare(right.query))) {
    if (!byFingerprint.has(draft.fingerprint)) byFingerprint.set(draft.fingerprint, draft);
  }
  return Array.from(byFingerprint.values()).slice(0, Math.max(1, input.limit));
}

async function resolvePlannerContext(input: PlannerInput) {
  const destinationKey = resolveDestinationKeyForVisitorWithHint(input.visitorKey, input.destinationKeyHint);
  if (!destinationKey) throw new Error("Unsupported visitorKey");
  const contract = assertMiniappIntelligenceContract({ destinationKeyHint: destinationKey });
  const instance = await ensureDestinationInstance(input.companyId, destinationKey);
  return { destinationKey, contract, instance };
}

export async function listMiniappResearchTasks(companyId: string, visitorKey: string, destinationKeyHint?: unknown) {
  const { instance } = await resolvePlannerContext({ companyId, visitorKey, destinationKeyHint });
  const rows = await prisma.destinationSourceDocument.findMany({
    where: {
      companyId,
      destinationInstanceId: instance.id,
      sourceType: MINIAPP_RESEARCH_TASK_SOURCE_TYPE,
    },
    select: {
      id: true,
      sourceUrl: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ fetchedAt: "desc" }, { updatedAt: "desc" }],
    take: 500,
  });
  return rows.map(readTaskFromSourceDocument).filter(Boolean) as MiniappResearchTask[];
}

export async function planMiniappResearchTasks(input: PlannerInput) {
  const { destinationKey, contract, instance } = await resolvePlannerContext(input);
  const [datacards, flashcards, feedbackMemory, miniappMemory, verification] = await Promise.all([
    listVisitorSourceDatacards(input.companyId, input.visitorKey, destinationKey),
    listVisitorFlashcards(input.companyId, input.visitorKey, destinationKey),
    listVisitorFeedbackMemory(input.companyId, input.visitorKey, destinationKey),
    listMiniappLearningMemory(input.companyId, input.visitorKey),
    getVisitorPublicVerificationSummary(input.companyId, input.visitorKey, destinationKey),
  ]);
  const nowIso = new Date().toISOString();
  const targetVisibleCards = Math.max(1, Math.floor(Number(input.targetVisibleCards) || 100));
  const limit = Math.max(1, Math.min(250, Math.floor(Number(input.limit) || 100)));
  const drafts = synthesizeMiniappResearchTaskDrafts({
    contract,
    visitorKey: input.visitorKey,
    targetVisibleCards,
    publishedCount: verification.publishedCount,
    datacards,
    flashcards,
    memory: [...feedbackMemory, ...miniappMemory],
    nowIso,
    limit,
  });

  let createdCount = 0;
  let updatedCount = 0;
  const tasks: MiniappResearchTask[] = [];
  for (const draft of drafts) {
    const sourceUrl = researchTaskSourceUrl(destinationKey, draft.fingerprint);
    const existing = await prisma.destinationSourceDocument.findFirst({
      where: {
        companyId: input.companyId,
        destinationInstanceId: instance.id,
        sourceType: MINIAPP_RESEARCH_TASK_SOURCE_TYPE,
        sourceUrl,
      },
      select: {
        id: true,
        sourceUrl: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const existingTask = existing ? readTaskFromSourceDocument(existing) : null;
    const nextTask: MiniappResearchTask = {
      ...draft,
      id: existing?.id ?? draft.id,
      status: existingTask?.status && existingTask.status !== "EXHAUSTED" ? existingTask.status : draft.status,
      attemptCount: existingTask?.attemptCount ?? draft.attemptCount,
      createdAt: existingTask?.createdAt ?? draft.createdAt,
      updatedAt: nowIso,
    };
    const metadata = {
      miniappResearchTask: nextTask,
      sovereignMiniappContractKey: contract.key,
      sourceCardInventoryIsSuccess: false,
      successMetric: contract.promotionPolicy.successMetric,
      plannedBy: "miniapp-research-planner",
    };
    const saved = existing
      ? await prisma.destinationSourceDocument.update({
          where: { id: existing.id },
          data: { rawText: "", metadata: metadata as never, fetchedAt: new Date() },
          select: { id: true, sourceUrl: true, metadata: true, createdAt: true, updatedAt: true },
        })
      : await prisma.destinationSourceDocument.create({
          data: {
            companyId: input.companyId,
            destinationInstanceId: instance.id,
            sourceType: MINIAPP_RESEARCH_TASK_SOURCE_TYPE,
            sourceUrl,
            rawText: "",
            metadata: metadata as never,
            fetchedAt: new Date(),
          },
          select: { id: true, sourceUrl: true, metadata: true, createdAt: true, updatedAt: true },
        });
    if (existing) updatedCount += 1;
    else createdCount += 1;
    const task = readTaskFromSourceDocument(saved);
    if (task) tasks.push(task);
  }

  return {
    ok: true,
    visitorKey: input.visitorKey.toLowerCase(),
    destinationKey,
    contractKey: contract.key,
    targetVisibleCards,
    publishedCount: verification.publishedCount,
    sourceCardInventoryIsSuccess: false,
    plannedCount: tasks.length,
    createdCount,
    updatedCount,
    queuedCount: tasks.filter((task) => task.status === "QUEUED").length,
    exhaustedCount: tasks.filter((task) => task.status === "EXHAUSTED").length,
    tasks,
  };
}
