import { prisma } from "@/lib/db";

export type SearchEntityType =
  | "SOURCE"
  | "TOPIC"
  | "FLASHCARD"
  | "GOALCARD"
  | "TASK"
  | "PIPELINE_JOB"
  | "WORKFLOW_BLUEPRINT";

export type SearchResultRecord = {
  id: string;
  publicId: number | null;
  entityType: SearchEntityType;
  title: string;
  snippet: string;
  href: string;
  tone: "ingress" | "synthesis" | "knowmore" | "strategy" | "checklist" | "review";
  iceScore: number | null;
  updatedAt: string;
  status: string | null;
  score: number;
  supportingLabel?: string | null;
};

export type SearchFilters = {
  entityTypes?: SearchEntityType[];
};

export type SearchResponsePayload = {
  items: SearchResultRecord[];
  counts: Record<SearchEntityType, number>;
  total: number;
};

function tokenize(value: string) {
  return String(value || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 2);
}

function collapseWhitespace(value: string, maxLength = 220) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}…`;
}

function overlapScore(queryTokens: string[], ...fields: Array<string | null | undefined>) {
  if (queryTokens.length === 0) return 0;
  const bag = fields
    .filter(Boolean)
    .flatMap((field) => tokenize(String(field)));
  if (bag.length === 0) return 0;

  let score = 0;
  for (const token of queryTokens) {
    const occurrences = bag.filter((candidate) => candidate === token).length;
    if (occurrences > 0) score += 3 + occurrences;
  }

  return score;
}

function freshnessBoost(updatedAt: Date) {
  const ageHours = Math.max(1, (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60));
  if (ageHours <= 24) return 6;
  if (ageHours <= 24 * 7) return 3;
  return 0;
}

function iceBoost(iceScore: number | null | undefined) {
  if (typeof iceScore !== "number" || Number.isNaN(iceScore)) return 0;
  return Math.min(12, Math.round(iceScore / 50));
}

function entityWeight(entityType: SearchEntityType) {
  switch (entityType) {
    case "FLASHCARD":
      return 8;
    case "TASK":
      return 7;
    case "GOALCARD":
      return 6;
    case "TOPIC":
      return 5;
    case "SOURCE":
      return 4;
    case "WORKFLOW_BLUEPRINT":
      return 3;
    case "PIPELINE_JOB":
      return 2;
    default:
      return 0;
  }
}

function byScore<T extends { score: number; updatedAt: string }>(left: T, right: T) {
  if (right.score !== left.score) return right.score - left.score;
  return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
}

function sharedCardHref(cardId: string) {
  return `/card/${cardId}`;
}

export async function searchCompanyContext(
  companyId: string,
  query: string,
  limit = 24,
  filters: SearchFilters = {},
) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return {
      items: [] as SearchResultRecord[],
      counts: {
        SOURCE: 0,
        TOPIC: 0,
        FLASHCARD: 0,
        GOALCARD: 0,
        TASK: 0,
        PIPELINE_JOB: 0,
        WORKFLOW_BLUEPRINT: 0,
      } satisfies Record<SearchEntityType, number>,
      total: 0,
    } satisfies SearchResponsePayload;
  }
  const allowedTypes = new Set(filters.entityTypes?.length ? filters.entityTypes : [
    "SOURCE",
    "TOPIC",
    "FLASHCARD",
    "GOALCARD",
    "TASK",
    "PIPELINE_JOB",
    "WORKFLOW_BLUEPRINT",
  ]);

  const [sources, topics, flashcards, goalcards, tasks, pipelineJobs, workflowBlueprints] = await Promise.all([
    prisma.source.findMany({
      where: { companyId },
      orderBy: [{ updatedAt: "desc" }],
      take: 60,
    }),
    prisma.topic.findMany({
      where: { companyId, active: true },
      orderBy: [{ updatedAt: "desc" }],
      take: 40,
    }),
    prisma.flashcard.findMany({
      where: {
        companyId,
        activityState: { in: ["ACTIVE", "STALE"] },
        processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED", "REVIEW"] },
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 80,
    }),
    prisma.goalcard.findMany({
      where: {
        companyId,
        activityState: { in: ["ACTIVE", "STALE"] },
        processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED"] },
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 40,
    }),
    prisma.nBAItem.findMany({
      where: {
        companyId,
        activityState: { in: ["ACTIVE", "STALE"] },
        processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED", "REVIEW"] },
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 80,
    }),
    prisma.pipelineJob.findMany({
      where: { companyId, status: { in: ["ACTIVE", "RUNNING", "FAILED"] } },
      orderBy: [{ updatedAt: "desc" }],
      take: 30,
    }),
    prisma.workflowBlueprint.findMany({
      where: { companyId, status: { in: ["ACTIVE", "PAUSED"] } },
      orderBy: [{ updatedAt: "desc" }],
      take: 30,
    }),
  ]);

  const results: SearchResultRecord[] = [];

  for (const source of sources) {
    const score =
      overlapScore(queryTokens, source.entityTag, source.content, source.hashtags.join(" ")) +
      freshnessBoost(source.updatedAt) +
      iceBoost(source.iceScore) +
      entityWeight("SOURCE");
    if (score <= 0) continue;
    results.push({
      id: source.id,
      publicId: source.publicId ?? null,
      entityType: "SOURCE",
      title: source.entityTag?.trim() || `Data ${source.publicId ?? ""}`.trim(),
      snippet: collapseWhitespace(source.content),
      href: sharedCardHref(source.id),
      tone: "ingress",
      iceScore: source.iceScore ?? null,
      updatedAt: source.updatedAt.toISOString(),
      status: source.sourceType ?? null,
      score,
      supportingLabel: source.provenance ?? null,
    });
  }

  for (const topic of topics) {
    const score =
      overlapScore(queryTokens, topic.label, topic.notes, topic.hashtags.join(" ")) +
      freshnessBoost(topic.updatedAt) +
      iceBoost(topic.iceScore) +
      entityWeight("TOPIC");
    if (score <= 0) continue;
    results.push({
      id: topic.id,
      publicId: null,
      entityType: "TOPIC",
      title: topic.label,
      snippet: collapseWhitespace(topic.notes || "Strategic topic for synthesis and recurring AI research."),
      href: sharedCardHref(topic.id),
      tone: "synthesis",
      iceScore: topic.iceScore ?? null,
      updatedAt: topic.updatedAt.toISOString(),
      status: topic.active ? "ACTIVE" : "INACTIVE",
      score,
    });
  }

  for (const flashcard of flashcards) {
    const score =
      overlapScore(queryTokens, flashcard.title, flashcard.body, flashcard.hashtags.join(" ")) +
      freshnessBoost(flashcard.updatedAt) +
      iceBoost(flashcard.iceScore) +
      entityWeight("FLASHCARD");
    if (score <= 0) continue;
    results.push({
      id: flashcard.id,
      publicId: flashcard.publicId ?? null,
      entityType: "FLASHCARD",
      title: flashcard.title,
      snippet: collapseWhitespace(flashcard.body),
      href: sharedCardHref(flashcard.id),
      tone: "knowmore",
      iceScore: flashcard.iceScore ?? null,
      updatedAt: flashcard.updatedAt.toISOString(),
      status: flashcard.processingStatus,
      score,
      supportingLabel: flashcard.kind,
    });
  }

  for (const goalcard of goalcards) {
    const score =
      overlapScore(queryTokens, goalcard.title, goalcard.body, goalcard.hashtags.join(" ")) +
      freshnessBoost(goalcard.updatedAt) +
      iceBoost(goalcard.iceScore) +
      entityWeight("GOALCARD");
    if (score <= 0) continue;
    results.push({
      id: goalcard.id,
      publicId: goalcard.publicId ?? null,
      entityType: "GOALCARD",
      title: goalcard.title,
      snippet: collapseWhitespace(goalcard.body),
      href: sharedCardHref(goalcard.id),
      tone: "strategy",
      iceScore: goalcard.iceScore ?? null,
      updatedAt: goalcard.updatedAt.toISOString(),
      status: goalcard.processingStatus,
      score,
    });
  }

  for (const task of tasks) {
    const score =
      overlapScore(queryTokens, task.title, task.description, task.hashtags.join(" ")) +
      freshnessBoost(task.updatedAt) +
      iceBoost(task.iceScore) +
      entityWeight("TASK");
    if (score <= 0) continue;
    results.push({
      id: task.id,
      publicId: task.publicId ?? null,
      entityType: "TASK",
      title: task.title,
      snippet: collapseWhitespace(task.description || ""),
      href: sharedCardHref(task.id),
      tone: task.kanbanColumn === "CHECKLIST" ? "checklist" : "strategy",
      iceScore: task.iceScore ?? null,
      updatedAt: task.updatedAt.toISOString(),
      status: task.kanbanColumn,
      score,
    });
  }

  for (const job of pipelineJobs) {
    const haystack = [job.jobType, job.reason, job.sourceSignal, job.entityType, job.queueColumn, job.controlMode].join(" ");
    const score = overlapScore(queryTokens, haystack) + freshnessBoost(job.updatedAt) + entityWeight("PIPELINE_JOB");
    if (score <= 0) continue;
    results.push({
      id: job.id,
      publicId: null,
      entityType: "PIPELINE_JOB",
      title: job.jobType.replaceAll("_", " "),
      snippet: collapseWhitespace(job.reason || "Persisted worker queue item."),
      href: `/${companyId}/pipeline`,
      tone: "review",
      iceScore: null,
      updatedAt: job.updatedAt.toISOString(),
      status: job.queueColumn,
      score,
      supportingLabel: job.controlMode,
    });
  }

  for (const workflow of workflowBlueprints) {
    const score =
      overlapScore(queryTokens, workflow.name, workflow.description, workflow.triggerType, workflow.templateKey) +
      freshnessBoost(workflow.updatedAt) +
      entityWeight("WORKFLOW_BLUEPRINT");
    if (score <= 0) continue;
    results.push({
      id: workflow.id,
      publicId: null,
      entityType: "WORKFLOW_BLUEPRINT",
      title: workflow.name,
      snippet: collapseWhitespace(workflow.description || "Reusable workflow blueprint."),
      href: `/${companyId}/workflows`,
      tone: "review",
      iceScore: null,
      updatedAt: workflow.updatedAt.toISOString(),
      status: workflow.status,
      score,
      supportingLabel: workflow.triggerType,
    });
  }

  const filtered = results.filter((item) => allowedTypes.has(item.entityType));
  const counts = filtered.reduce((acc, item) => {
    acc[item.entityType] += 1;
    return acc;
  }, {
    SOURCE: 0,
    TOPIC: 0,
    FLASHCARD: 0,
    GOALCARD: 0,
    TASK: 0,
    PIPELINE_JOB: 0,
    WORKFLOW_BLUEPRINT: 0,
  } satisfies Record<SearchEntityType, number>);

  return {
    items: filtered.sort(byScore).slice(0, limit),
    counts,
    total: filtered.length,
  } satisfies SearchResponsePayload;
}
