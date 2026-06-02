import "server-only";

import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ensureDestinationInstance } from "@/lib/destination-workflows";
import { resolveDestinationKeyForVisitorWithHint } from "@/lib/visitor-blueprints";

const MINIAPP_RESEARCH_TASK_SOURCE_TYPE = "miniapp_research_task";

export type MiniappLearningRule = {
  id: string;
  visitorKey: string;
  code: string;
  action: "expand_query" | "suppress_domain" | "lower_priority" | "retry_later";
  sourceTerm?: string;
  reason: string;
  severity: "warning" | "blocking";
  createdAt: string;
  lastSeenAt: string;
  count: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function asRules(value: unknown): MiniappLearningRule[] {
  if (!Array.isArray(value)) return [] as MiniappLearningRule[];
  return value.map((entry) => {
    const record = asRecord(entry);
    const severity: MiniappLearningRule["severity"] = asString(record.severity) === "blocking" ? "blocking" : "warning";
    return {
      id: asString(record.id),
      visitorKey: asString(record.visitorKey),
      code: asString(record.code),
      action: asString(record.action) as MiniappLearningRule["action"],
      sourceTerm: asString(record.sourceTerm) || undefined,
      reason: asString(record.reason),
      severity,
      createdAt: asString(record.createdAt),
      lastSeenAt: asString(record.lastSeenAt),
      count: asNumber(record.count),
    };
  }).filter((rule) => rule.id && rule.visitorKey && rule.code && rule.action);
}

function hashValue(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeVisitorKey(value: string) {
  return value.trim().toLowerCase();
}

function memoryKey(companyId: string, visitorKey: string) {
  return `miniapp_learning_memory:${companyId}:${normalizeVisitorKey(visitorKey)}`;
}

function ruleId(input: Pick<MiniappLearningRule, "visitorKey" | "code" | "action" | "sourceTerm">) {
  return `milr_${hashValue(`${normalizeVisitorKey(input.visitorKey)}:${input.code}:${input.action}:${input.sourceTerm || ""}`).slice(0, 20)}`;
}

async function readStore(companyId: string, visitorKey: string) {
  const row = await prisma.globalSetting.findUnique({ where: { key: memoryKey(companyId, visitorKey) } });
  return {
    key: memoryKey(companyId, visitorKey),
    rules: asRules(asRecord(row?.value).rules),
  };
}

async function writeStore(companyId: string, visitorKey: string, rules: MiniappLearningRule[]) {
  const value = {
    visitorKey: normalizeVisitorKey(visitorKey),
    rules,
    updatedAt: new Date().toISOString(),
  };
  await prisma.globalSetting.upsert({
    where: { key: memoryKey(companyId, visitorKey) },
    create: { key: memoryKey(companyId, visitorKey), value: value as Prisma.InputJsonValue },
    update: { value: value as Prisma.InputJsonValue },
  });
}

export async function listMiniappLearningMemory(companyId: string, visitorKey: string) {
  const store = await readStore(companyId, visitorKey);
  return store.rules.sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt));
}

export async function upsertMiniappLearningRules(companyId: string, visitorKey: string, nextRules: Array<Omit<MiniappLearningRule, "id" | "createdAt" | "lastSeenAt" | "count" | "visitorKey">>) {
  const nowIso = new Date().toISOString();
  const store = await readStore(companyId, visitorKey);
  const byId = new Map<string, MiniappLearningRule>(store.rules.map((rule) => [rule.id, rule]));
  for (const draft of nextRules) {
    const normalized = {
      ...draft,
      visitorKey: normalizeVisitorKey(visitorKey),
    };
    const id = ruleId(normalized);
    const existing = byId.get(id);
    const nextRule: MiniappLearningRule = {
      id,
      visitorKey: normalizeVisitorKey(visitorKey),
      code: draft.code,
      action: draft.action,
      sourceTerm: draft.sourceTerm,
      reason: draft.reason,
      severity: draft.severity,
      createdAt: existing?.createdAt ?? nowIso,
      lastSeenAt: nowIso,
      count: (existing?.count ?? 0) + 1,
    };
    byId.set(id, nextRule);
  }
  const rules = [...byId.values()].sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt)).slice(0, 500);
  await writeStore(companyId, visitorKey, rules);
  return rules;
}

export async function syncMiniappLearningMemory(input: {
  companyId: string;
  visitorKey: string;
  destinationKeyHint?: unknown;
  limit?: number;
}) {
  const destinationKey = resolveDestinationKeyForVisitorWithHint(input.visitorKey, input.destinationKeyHint);
  if (!destinationKey) throw new Error("Unsupported visitorKey");
  const instance = await ensureDestinationInstance(input.companyId, destinationKey);
  const taskRows = await prisma.destinationSourceDocument.findMany({
    where: {
      companyId: input.companyId,
      destinationInstanceId: instance.id,
      sourceType: MINIAPP_RESEARCH_TASK_SOURCE_TYPE,
    },
    select: { metadata: true },
    orderBy: { updatedAt: "desc" },
    take: Math.max(1, Math.min(500, Number(input.limit) || 100)),
  });
  const tasks = taskRows.map((row) => asRecord(asRecord(row.metadata).miniappResearchTask));
  const candidates = await prisma.destinationCandidate.findMany({
    where: {
      companyId: input.companyId,
      destinationInstanceId: instance.id,
    },
    select: { canonicalSourceUrl: true, metadata: true },
    orderBy: { updatedAt: "desc" },
    take: Math.max(1, Math.min(250, Number(input.limit) || 100)),
  });

  const rules: Array<Omit<MiniappLearningRule, "id" | "createdAt" | "lastSeenAt" | "count" | "visitorKey">> = [];
  for (const task of tasks) {
    const status = asString(task.status);
    const query = asString(task.query);
    const coverageGoalId = asString(task.coverageGoalId);
    if (status === "NO_RESULTS" || status === "FAILED") {
      rules.push({
        code: status.toLowerCase(),
        action: "expand_query",
        sourceTerm: query,
        reason: `Research task ${status.toLowerCase()} for ${coverageGoalId}; broaden or rephrase query.`,
        severity: "warning",
      });
    }
    if (status === "EXHAUSTED") {
      rules.push({
        code: "domain_retry_budget_exhausted",
        action: "retry_later",
        sourceTerm: query,
        reason: `Research task exhausted retry budget for ${coverageGoalId}.`,
        severity: "blocking",
      });
    }
  }

  for (const candidate of candidates) {
    const metadata = asRecord(candidate.metadata);
    const gate = asRecord(metadata.miniappPromotionGate);
    const blockingReasons = Array.isArray(gate.blockingReasons) ? gate.blockingReasons.map(asString).filter(Boolean) : [];
    for (const reason of blockingReasons) {
      rules.push({
        code: reason.split(":")[0] || "promotion_blocked",
        action: reason.includes("source") || reason.includes("projection") ? "suppress_domain" : "lower_priority",
        sourceTerm: candidate.canonicalSourceUrl,
        reason,
        severity: "blocking",
      });
    }
  }

  const saved = await upsertMiniappLearningRules(input.companyId, input.visitorKey, rules);
  return {
    ok: true,
    visitorKey: normalizeVisitorKey(input.visitorKey),
    destinationKey,
    createdOrUpdatedCount: rules.length,
    totalRules: saved.length,
    rules: saved,
  };
}
