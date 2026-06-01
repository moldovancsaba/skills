import "server-only";

import { prisma } from "@/lib/db";
import { resolveDestinationKeyForVisitorWithHint } from "@/lib/visitor-blueprints";
import { ensureDestinationInstance } from "@/lib/destination-workflows";
import { DestinationWorkflowState } from "@prisma/client";

const VISITOR_FEEDBACK_TYPES = [
  "wrong_category",
  "forbidden_category",
  "wrong_industry",
  "wrong_location",
  "weak_source",
  "not_public_listing",
  "bad_image",
  "missing_schedule",
  "wrong_audience",
  "unsafe_or_sensitive",
  "duplicate",
  "publish_quality_failure",
] as const;

type VisitorFeedbackType = (typeof VISITOR_FEEDBACK_TYPES)[number];

type VisitorFeedbackInput = {
  feedbackType: VisitorFeedbackType;
  contentType?: string;
  sourceTerm?: string;
  reason: string;
  candidateIds?: string[];
  metadata?: Record<string, unknown>;
  actor?: string;
};

type VisitorFeedbackRule = {
  id: string;
  createdAt: string;
  visitorKey: string;
  feedbackType: VisitorFeedbackType;
  action: "forbid_mapping" | "downrank_source" | "require_review";
  contentType?: string;
  sourceTerm?: string;
  reason: string;
  severity: "warning" | "blocking";
  metadata: Record<string, unknown>;
  actor: string;
};

type VisitorRefinementRun = {
  id: string;
  createdAt: string;
  visitorKey: string;
  feedbackRuleId: string;
  affectedCandidateIds: string[];
  retiredCandidateIds: string[];
  reworkCandidateIds: string[];
  reviewCandidateIds: string[];
  keptCandidateIds: string[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeVisitorKey(value: string) {
  return value.trim().toLowerCase();
}

function nowIso() {
  return new Date().toISOString();
}

async function getInstance(companyId: string, visitorKey: string, destinationKeyHint?: unknown) {
  const destinationKey = resolveDestinationKeyForVisitorWithHint(visitorKey, destinationKeyHint);
  if (!destinationKey) throw new Error("Unsupported visitorKey");
  return ensureDestinationInstance(companyId, destinationKey);
}

function readStore(config: unknown) {
  const root = asRecord(config) ?? {};
  const visitor = asRecord(root.visitor) ?? {};
  return {
    feedbackRules: (Array.isArray(visitor.feedbackRules) ? visitor.feedbackRules : []) as VisitorFeedbackRule[],
    refinementRuns: (Array.isArray(visitor.refinementRuns) ? visitor.refinementRuns : []) as VisitorRefinementRun[],
    root,
    visitor,
  };
}

function writeStore(
  baseRoot: Record<string, unknown>,
  baseVisitor: Record<string, unknown>,
  next: { feedbackRules: VisitorFeedbackRule[]; refinementRuns: VisitorRefinementRun[] },
) {
  const visitor = { ...baseVisitor, feedbackRules: next.feedbackRules, refinementRuns: next.refinementRuns };
  return { ...baseRoot, visitor };
}

function compileFeedbackRule(visitorKey: string, input: VisitorFeedbackInput): VisitorFeedbackRule {
  const feedbackType = input.feedbackType;
  if (!(VISITOR_FEEDBACK_TYPES as readonly string[]).includes(feedbackType)) {
    throw new Error(`Unsupported feedbackType: ${feedbackType}`);
  }
  const id = `vfr_${Math.random().toString(36).slice(2, 10)}`;
  const createdAt = nowIso();
  const contentType = asString(input.contentType) || undefined;
  const sourceTerm = asString(input.sourceTerm) || undefined;
  const reason = asString(input.reason);
  if (!reason) throw new Error("reason is required");

  let action: VisitorFeedbackRule["action"] = "require_review";
  let severity: VisitorFeedbackRule["severity"] = "warning";

  if (feedbackType === "forbidden_category" || feedbackType === "unsafe_or_sensitive") {
    action = "forbid_mapping";
    severity = "blocking";
  } else if (feedbackType === "weak_source" || feedbackType === "not_public_listing") {
    action = "downrank_source";
    severity = "blocking";
  }

  return {
    id,
    createdAt,
    visitorKey: normalizeVisitorKey(visitorKey),
    feedbackType,
    action,
    contentType,
    sourceTerm,
    reason,
    severity,
    metadata: asRecord(input.metadata) ?? {},
    actor: asString(input.actor) || "unknown",
  };
}

export async function listVisitorFeedbackMemory(companyId: string, visitorKey: string, destinationKeyHint?: unknown) {
  const instance = await getInstance(companyId, visitorKey, destinationKeyHint);
  const store = readStore(instance.config);
  return store.feedbackRules.filter((rule) => rule.visitorKey === normalizeVisitorKey(visitorKey));
}

export async function listVisitorRefinementRuns(companyId: string, visitorKey: string, destinationKeyHint?: unknown) {
  const instance = await getInstance(companyId, visitorKey, destinationKeyHint);
  const store = readStore(instance.config);
  return store.refinementRuns.filter((run) => run.visitorKey === normalizeVisitorKey(visitorKey));
}

export async function applyVisitorFeedback(companyId: string, visitorKey: string, input: VisitorFeedbackInput, destinationKeyHint?: unknown) {
  const instance = await getInstance(companyId, visitorKey, destinationKeyHint);
  const rule = compileFeedbackRule(visitorKey, input);
  const candidateIds = Array.isArray(input.candidateIds) ? input.candidateIds.filter(Boolean) : [];
  const whereBase = {
    companyId,
    destinationInstanceId: instance.id,
  };
  const candidates = candidateIds.length
    ? await prisma.destinationCandidate.findMany({
        where: { ...whereBase, id: { in: candidateIds } },
      })
    : await prisma.destinationCandidate.findMany({
        where: whereBase,
        orderBy: { updatedAt: "desc" },
        take: 500,
      });

  const affectedCandidateIds: string[] = [];
  const retiredCandidateIds: string[] = [];
  const reworkCandidateIds: string[] = [];
  const reviewCandidateIds: string[] = [];
  const keptCandidateIds: string[] = [];

  for (const candidate of candidates) {
    const metadata = asRecord(candidate.metadata) ?? {};
    const classification = asRecord(metadata.classification) ?? {};
    const candidateContentType = asString(classification.contentType || candidate.proposedType).toLowerCase();
    const sourceUrl = candidate.canonicalSourceUrl.toLowerCase();
    const matchesContentType = rule.contentType ? candidateContentType === rule.contentType.toLowerCase() : true;
    const matchesSourceTerm = rule.sourceTerm ? sourceUrl.includes(rule.sourceTerm.toLowerCase()) : true;
    if (!matchesContentType || !matchesSourceTerm) {
      continue;
    }
    affectedCandidateIds.push(candidate.id);

    let nextState = asString(metadata.visitorCandidateState).toUpperCase();
    let nextWorkflowState: DestinationWorkflowState = candidate.status;
    if (rule.action === "forbid_mapping") {
      nextState = "RETIRED";
      nextWorkflowState = DestinationWorkflowState.REJECTED;
      retiredCandidateIds.push(candidate.id);
    } else if (rule.action === "downrank_source") {
      nextState = "REWORK_REQUIRED";
      nextWorkflowState = DestinationWorkflowState.FAILED;
      reworkCandidateIds.push(candidate.id);
    } else {
      nextState = "NEEDS_REVIEW";
      nextWorkflowState = DestinationWorkflowState.REVIEW_REQUIRED;
      reviewCandidateIds.push(candidate.id);
    }

    await prisma.destinationCandidate.update({
      where: { id: candidate.id },
      data: {
        status: nextWorkflowState,
        metadata: {
          ...metadata,
          visitorCandidateState: nextState,
          refinementRuleIds: [...new Set([...(Array.isArray(metadata.refinementRuleIds) ? metadata.refinementRuleIds : []), rule.id])],
          lastRefinedAt: nowIso(),
        } as never,
      },
    });
  }

  if (!affectedCandidateIds.length) {
    keptCandidateIds.push("none");
  }

  const run: VisitorRefinementRun = {
    id: `vrr_${Math.random().toString(36).slice(2, 10)}`,
    createdAt: nowIso(),
    visitorKey: normalizeVisitorKey(visitorKey),
    feedbackRuleId: rule.id,
    affectedCandidateIds,
    retiredCandidateIds,
    reworkCandidateIds,
    reviewCandidateIds,
    keptCandidateIds,
  };

  const store = readStore(instance.config);
  const nextFeedbackRules = [...store.feedbackRules, rule].slice(-500);
  const nextRefinementRuns = [run, ...store.refinementRuns].slice(0, 500);
  await prisma.destinationInstance.update({
    where: { id: instance.id },
    data: {
      config: writeStore(store.root, store.visitor, {
        feedbackRules: nextFeedbackRules,
        refinementRuns: nextRefinementRuns,
      }) as never,
    },
  });

  return { rule, run };
}
