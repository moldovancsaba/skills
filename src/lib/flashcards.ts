/**
 * Shared flashcard and downstream card engine.
 *
 * Owns the core business logic for generating, refining, scoring, and
 * managing knowledge cards and their downstream task/goal derivatives.
 */

// @ts-nocheck
import {
  FlashcardActionType,
  FlashcardActivityState,
  FlashcardCorrectionType,
  FlashcardKind,
  FlashcardProcessingStatus,
  FlashcardReviewStatus,
  FlashcardSourceRole,
  FlashcardStatus,
  Prisma,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { normalizeMarkdownBody } from "@/lib/markdown-format";
import { ensureUnifiedSources } from "@/lib/sources";
import {
  ensureSourcePublicIds,
  PUBLIC_ID_SCOPES,
  reservePublicIds,
  TRANSACTION_SETTINGS,
  withSerializableRetry,
} from "@/lib/source-public-ids";
import {
  APP_VERSION,
  BRAIN_VERSION,
  FLASHCARD_PROMPT_VERSION,
} from "@/lib/release";
import { enrichUploadedFile } from "@/lib/file-enrichment";
import {
  normalizeSourceHashtags,
  stripSourceTypeHashtags,
} from "@/lib/hashtags";
import { deriveFlashcardSourceSupport } from "@/lib/upstream-card-scoring";
import {
  enrichCompetitorSeed,
  enrichProductSeed,
  shouldEnrichCompetitor,
  shouldEnrichProduct,
} from "@/lib/url-enrichment";
import { calculateKnowledgeIceScore, clampMetric, groundKnowledgeScores } from "@/lib/scoring-contract";
import { escalateCompanyPipelineJob } from "@/lib/pipeline-queue";
import { sanitizeOptionalUserFacingText } from "@/lib/ui-utils";

// --- TYPES ---

type FlashcardSourceKind = "PRODUCT" | "CUSTOMER" | "COMPETITOR" | "SOURCE" | "FILE" | "AGENT_FOUND";

type BaseSourceRecord = {
  id: string;
  publicId: number | null;
  sourceName: string;
  knowledgeName: string;
  hashtags: string[];
  confidence?: number;
  confidenceScore?: number;
  impact?: number;
  weight?: number;
  iceScore?: number;
  createdAt: Date;
  updatedAt: Date;
};

type UnifiedSource = BaseSourceRecord & {
  type: "SOURCE";
  content: string;
  entityTag: string | null;
  aiClusters: string[];
  metadata: Prisma.JsonValue | null;
};
type FileSource = BaseSourceRecord & {
  type: "FILE";
  mimeType: string;
  sizeBytes: number;
  extractedText?: string | null;
  watchedContent: Prisma.JsonValue | null;
  entityTag?: string | null;
};

type ProductSource = UnifiedSource & {
  features: string[];
  description: string;
  pricing: string;
  urls: string[];
  watchedContent: Prisma.JsonValue | null;
};

type CompetitorSource = UnifiedSource & {
  strengths: string[];
  weaknesses: string[];
  positioning: string;
  pricing: string;
  urls: string[];
  watchedContent: Prisma.JsonValue | null;
};

type CustomerSource = UnifiedSource & {
  notes: string;
  segments: string[];
  painPoints: string[];
  channels: string[];
  urls: string[];
  lifetimeValue?: string;
  email?: string;
  watchedContent: Prisma.JsonValue | null;
};

type SourceRecord = UnifiedSource | FileSource | ProductSource | CompetitorSource | CustomerSource;

type FlashcardLinkedSource = {
  type: FlashcardSourceKind;
  id: string;
  publicId: number | null;
  sourceName: string;
};

type FlashcardDraft = {
  kind: FlashcardKind;
  fingerprint: string;
  title: string;
  body: string;
  confidence: number;
  impact: number;
  weight: number;
  evidence: Prisma.InputJsonValue | null;
  hashtags: string[];
  source: {
    type: FlashcardSourceKind;
    id: string;
    publicId: number | null;
    sourceName: string;
  };
  supportingSources?: FlashcardLinkedSource[];
  refreshedAt: Date;
  citationSnapshotIds?: string[];
  conflictDetected?: boolean;
  conflictSummary?: string | null;
};

type TopicRecord = {
  id: string;
  label: string;
  hashtags: string[];
  active: boolean;
  sortOrder: number;
  notes?: string | null;
  confidence?: number;
  confidenceScore?: number;
  impact?: number;
  weight?: number;
  iceScore?: number;
};

type FlashcardActionInput = {
  flashcardId: string;
  action: FlashcardActionType;
  annotation?: string;
  modifiedTitle?: string;
  modifiedBody?: string;
};

type FlashcardCorrectionInput = {
  companyId?: string;
  flashcardId?: string;
  sourceType?: FlashcardSourceKind;
  sourceId?: string;
  sourcePublicId?: number | null;
  sourceName?: string | null;
  correctionType: FlashcardCorrectionType;
  note?: string;
};

const BOOTSTRAP_CREATED_BY = "bootstrap-source";
const FLASHCARD_INCLUDES = {
  sources: {
    orderBy: [{ sourcePublicId: "asc" as const }, { createdAt: "asc" as const }],
  },
  actions: {
    orderBy: { createdAt: "desc" as const },
    take: 5,
  },
  corrections: {
    orderBy: { createdAt: "desc" as const },
    take: 5,
  },
} satisfies Prisma.FlashcardInclude;

const REVIEW_STATUS_BY_ACTION: Record<FlashcardActionType, FlashcardReviewStatus> = {
  ACCEPT: FlashcardReviewStatus.ACCEPTED,
  DECLINE: FlashcardReviewStatus.DECLINED,
  REJECT: FlashcardReviewStatus.DECLINED,
  ANNOTATE: FlashcardReviewStatus.PENDING,
  MODIFY_ACCEPT: FlashcardReviewStatus.MODIFIED_ACCEPTED,
};

const KIND_LABELS: Record<FlashcardKind, string> = {
  SUMMARY: "Summary",
  EXPLANATION: "Explanation",
  COMPARISON: "Comparison",
  NEWS: "News",
  CONCLUSION: "Conclusion",
  EVALUATION: "Evaluation",
  OPINION: "Opinion",
  JUDGMENT: "Judgment",
  RECOMMENDATION: "Recommendation",
  RESEARCH: "Research plan",
  FORECAST: "Forecast",
  STOCK: "Stock signal",
  GOSSIP: "Market chatter",
  PRICE: "Pricing",
};

const SECTION_KIND_MAP: Record<string, FlashcardKind> = {
  conclusions: FlashcardKind.CONCLUSION,
  evaluation: FlashcardKind.EVALUATION,
  judgment: FlashcardKind.JUDGMENT,
  recommendation: FlashcardKind.RECOMMENDATION,
  "industry news": FlashcardKind.NEWS,
  "r&d / roadmap": FlashcardKind.RESEARCH,
  forecast: FlashcardKind.FORECAST,
  "stock signal": FlashcardKind.STOCK,
  "market chatter (low confidence)": FlashcardKind.GOSSIP,
};
const PRICE_PATTERN =
  /(?:\$|EUR|USD|GBP)\s?\d[\d,.]*(?:\s*\/\s*(?:mo|month|yr|year|user))?|free\b|trial\b|pricing\b/i;

// --- UTILITIES ---

/**
 * Generates a stable composite key for source tracking.
 * 
 * @param {FlashcardSourceKind} sourceType - Kind of source
 * @param {string} sourceId - Unique ID of the source
 * @returns {string} Composite key
 */
function sourceKey(sourceType: FlashcardSourceKind, sourceId: string) {
  return `${sourceType}:${sourceId}`;
}

function sourceKeyFromCorrection(sourceType: FlashcardSourceKind | null | undefined, sourceId: string | null | undefined) {
  if (!sourceType || !sourceId) {
    return null;
  }

  return sourceKey(sourceType, sourceId);
}

function normalizeText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeAnnotationText(value: string | null | undefined) {
  return sanitizeOptionalUserFacingText(value);
}

function displaySourceName(value: string) {
  return value.replace(/[{}[\]]/g, "").trim();
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sameDate(left: Date | null, right: Date | null) {
  if (!left || !right) {
    return left === right;
  }
  return left.getTime() === right.getTime();
}

function assertNever(value: never): never {
  throw new Error(`Unsupported source type: ${JSON.stringify(value)}`);
}

function sentenceize(value: string) {
  const trimmed = normalizeText(value) ?? "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function normalizeClause(value: string | null | undefined) {
  return normalizeText(value)?.replace(/\s+/g, " ") ?? null;
}

function dedupeStrings(values: Array<string | null | undefined>, maxItems = 5) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized) {
      continue;
    }

    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);

    if (result.length >= maxItems) {
      break;
    }
  }

  return result;
}

function isLowValueCardText(value: string | null | undefined) {
  const normalized = normalizeClause(value)?.toLowerCase();
  if (!normalized) {
    return true;
  }

  if (normalized.length < 30) {
    return true;
  }

  return [
    "compare this competitor's headline claims against our product's proof points",
    "expect messaging and packaging to keep shifting",
    "the competitor is competing in an automation-heavy category",
    "pressure-test whether the headline capabilities are differentiated enough",
    "home of elite player development",
    "goalkeeper training -",
    "junior academy -",
  ].some((phrase) => normalized.includes(phrase));
}

function isWeakEvidenceLine(value: string | null | undefined) {
  const normalized = normalizeClause(value)?.toLowerCase();
  if (!normalized) {
    return true;
  }

  return (
    normalized.length < 12 ||
    /^(home|contact|about|services|faq|shop|pricing)$/i.test(normalized) ||
    normalized.startsWith("home |") ||
    normalized.includes("training schedule") ||
    normalized.includes("private lessons") ||
    normalized.includes("goalkeeper training") ||
    normalized.includes("junior academy") ||
    normalized.includes("soccer birthday parties") ||
    normalized.includes("contact ") ||
    normalized.includes(" - ") ||
    normalized.includes(" | ")
  );
}

function isLowValueNewsLine(sourceName: string, value: string | null | undefined) {
  const normalized = normalizeClause(value)?.toLowerCase();
  const normalizedSource = normalizeClause(sourceName)?.toLowerCase();
  if (!normalized || !normalizedSource) {
    return true;
  }

  const compactSource = normalizedSource.replace(/[^a-z0-9]+/g, "");
  const compactValue = normalized.replace(/[^a-z0-9]+/g, "");

  return (
    isWeakEvidenceLine(normalized) ||
    normalized.startsWith("home ") ||
    normalized.includes("privacy policy") ||
    normalized.includes(" - ") ||
    normalized.includes(" | ") ||
    normalized.includes(" - " + normalizedSource) ||
    normalized.includes(" | " + normalizedSource) ||
    normalized === normalizedSource ||
    compactValue === compactSource ||
    compactValue === `${compactSource}${compactSource}`
  );
}

function isWeakPriceSignal(value: string | null | undefined) {
  const normalized = normalizeClause(value)?.toLowerCase();
  if (!normalized) {
    return true;
  }

  return normalized === "pricing" || normalized === "$" || normalized === "price";
}

/**
 * Constructs a unique deterministic fingerprint for a flashcard.
 * Prevents duplicates during re-induction.
 * 
 * @param {SourceRecord} source - The source object
 * @param {FlashcardKind} kind - Type of flashcard
 * @param {string} seed - Seed value for slugification
 * @returns {string} Unique fingerprint
 */
function buildFingerprint(source: SourceRecord, kind: FlashcardKind, seed: string) {
  return `${source.type}:${source.id}:${kind}:${slugify(seed)}`;
}

function parseLabeledSections(body: string | null | undefined) {
  const sections = new Map<string, string[]>();
  const normalized = normalizeText(body);
  if (!normalized) {
    return sections;
  }

  const labels = Object.keys(SECTION_KIND_MAP)
    .sort((left, right) => right.length - left.length)
    .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const matcher = new RegExp(`(${labels.join("|")}):`, "gi");
  const matches = Array.from(normalized.matchAll(matcher));

  for (const [index, match] of matches.entries()) {
    const label = match[1]?.toLowerCase();
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? normalized.length) : normalized.length;
    const rest = normalized.slice(start, end).trim();

    if (!label || !rest) {
      continue;
    }

    const parts = rest
      .split(/(?<=[.!?])\s+/)
      .map((item) => normalizeText(item))
      .filter((item): item is string => Boolean(item));

    sections.set(label, parts.length > 0 ? parts : [rest]);
  }

  return sections;
}

function getWatchedContentRecord(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, Prisma.JsonValue>;
}

function getWatchedStringArray(record: Record<string, Prisma.JsonValue> | null, key: string) {
  const value = record?.[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function getWatchedObject(record: Record<string, Prisma.JsonValue> | null, key: string) {
  const value = record?.[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, Prisma.JsonValue>;
}

function getWatchedString(record: Record<string, Prisma.JsonValue> | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value : null;
}

function getAnalysisItems(
  watchedContent: Prisma.JsonValue | null | undefined,
  key: string,
) {
  const record = getWatchedContentRecord(watchedContent);
  const analysis = getWatchedObject(record, "analysis");
  const value = analysis?.[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return dedupeStrings(
    value.filter((item): item is string => typeof item === "string"),
    4,
  ).filter((item) => !isLowValueCardText(item) && !isWeakEvidenceLine(item));
}

function getNewsTitles(watchedContent: Prisma.JsonValue | null | undefined) {
  const record = getWatchedContentRecord(watchedContent);
  const newsSignals = record?.newsSignals;
  if (!Array.isArray(newsSignals)) {
    return [];
  }

  return dedupeStrings(
    newsSignals
      .map((item) =>
        item && typeof item === "object" && !Array.isArray(item) && typeof item.title === "string"
          ? item.title
          : null,
      ),
    4,
  ).filter((item) => !isWeakEvidenceLine(item));
}

function getSearchSnippets(watchedContent: Prisma.JsonValue | null | undefined) {
  const record = getWatchedContentRecord(watchedContent);
  const searchSignals = record?.searchSignals;
  if (!Array.isArray(searchSignals)) {
    return [];
  }

  return dedupeStrings(
    searchSignals.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return [];
      }

      return [
        typeof item.title === "string" ? item.title : null,
        typeof item.snippet === "string" ? item.snippet : null,
      ];
    }),
    5,
  ).filter((item) => !isWeakEvidenceLine(item));
}

function getFileSummary(watchedContent: Prisma.JsonValue | null | undefined) {
  const record = getWatchedContentRecord(watchedContent);
  const analysis = getWatchedObject(record, "analysis");
  return normalizeText(getWatchedString(analysis, "summary"));
}

function comparisonText(leftName: string, leftSignals: string[], rightName: string, rightSignals: string[]) {
  const left = dedupeStrings(leftSignals, 2);
  const right = dedupeStrings(rightSignals, 2);
  if (left.length === 0 || right.length === 0) {
    return null;
  }

  return `${leftName} emphasizes ${left.join(" and ")}, while ${rightName} emphasizes ${right.join(" and ")}.`;
}

function sourceDisplayName(source: UnifiedSource) {
  return (
    normalizeText(source.entityTag) ??
    normalizeText(source.content.split(/\n+/).find((line) => normalizeText(line))) ??
    `Source #${source.publicId ?? source.id.slice(0, 8)}`
  );
}

function sourceMetadataRecord(source: UnifiedSource) {
  return getWatchedContentRecord(source.metadata);
}

function sourceMetadataStrings(source: UnifiedSource, key: string, maxItems = 4) {
  return dedupeStrings(getWatchedStringArray(sourceMetadataRecord(source), key), maxItems);
}

function extractSourceInsights(source: UnifiedSource, maxItems = 6) {
  const metadata = sourceMetadataRecord(source);
  const paragraphs = source.content
    .split(/\n{2,}/)
    .flatMap((chunk) => chunk.split(/\n(?=[-*•]\s)|(?<=\.)\s*\n/))
    .map((item) => normalizeText(item.replace(/^[-*•]\s*/, "")))
    .filter((item): item is string => Boolean(item));
  const metadataSignals = [
    ...sourceMetadataStrings(source, "features", 4),
    ...sourceMetadataStrings(source, "segments", 4),
    ...sourceMetadataStrings(source, "painPoints", 4),
    ...sourceMetadataStrings(source, "channels", 4),
    ...sourceMetadataStrings(source, "strengths", 4),
    ...sourceMetadataStrings(source, "weaknesses", 4),
    normalizeText(getWatchedString(metadata, "description")),
    normalizeText(getWatchedString(metadata, "pricing")),
    normalizeText(getWatchedString(metadata, "positioning")),
    normalizeText(getWatchedString(metadata, "notes")),
  ];

  return dedupeStrings(
    [...paragraphs, ...metadataSignals],
    maxItems,
  ).filter((item) => !isLowValueCardText(item) && !isWeakEvidenceLine(item));
}

function extractSourceUrls(source: UnifiedSource) {
  const metadataUrls = sourceMetadataStrings(source, "urls", 6);
  const inlineUrls = Array.from(source.content.matchAll(/https?:\/\/[^\s)]+/gi)).map((match) => match[0]);
  return dedupeStrings([...metadataUrls, ...inlineUrls], 6);
}

function estimateSourceConfidence(source: UnifiedSource, fact: string, index: number, relatedCount = 0) {
  const metadata = sourceMetadataRecord(source);
  const signalDensity =
    Math.min(10, Math.floor(fact.length / 24)) +
    Math.min(8, source.hashtags.length * 2) +
    Math.min(6, source.aiClusters.length * 2) +
    Math.min(4, extractSourceUrls(source).length * 2) +
    Math.min(4, relatedCount * 2) +
    (metadata ? 3 : 0);

  return clamp(56 + signalDensity - Math.min(index, 4), 56, 92);
}

function sharedSourceContext(left: UnifiedSource, right: UnifiedSource) {
  const sharedTags = left.hashtags.filter((tag) => right.hashtags.includes(tag));
  const sharedClusters = left.aiClusters.filter((tag) => right.aiClusters.includes(tag));
  return dedupeStrings([...sharedTags, ...sharedClusters], 5);
}

// --- DRAFTING ENGINE ---

/**
 * Generates an array of FlashcardDraft objects from a UnifiedSource (DataCard).
 * Implements rule-based extraction for summaries, price signals, and comparisons.
 * 
 * @param {UnifiedSource} source - The source record to process
 * @param {SourceRecord[]} context - Related sources for comparative synthesis
 * @returns {FlashcardDraft[]} Array of potential intelligence drafts
 */
function buildSourceDrafts(source: UnifiedSource, context: SourceRecord[], topicContext: TopicRecord[]) {
  const drafts: FlashcardDraft[] = [];
  const sourceName = displaySourceName(sourceDisplayName(source));
  const evidenceBase = {
    content: source.content,
    entityTag: source.entityTag,
    aiClusters: source.aiClusters,
    metadata: source.metadata,
    urls: extractSourceUrls(source),
  } satisfies Prisma.InputJsonObject;
  const insights = extractSourceInsights(source, 7);
  const priceSignals = insights.filter((item) => PRICE_PATTERN.test(item));

  insights.slice(0, 4).forEach((value, index) => {
    const kind =
      index === 0
        ? FlashcardKind.SUMMARY
        : PRICE_PATTERN.test(value)
          ? FlashcardKind.PRICE
          : index % 2 === 0
            ? FlashcardKind.CONCLUSION
            : FlashcardKind.EXPLANATION;
    const confidence = estimateSourceConfidence(source, value, index);

    drafts.push(
      makeDraft(
        source,
        kind,
        `${KIND_LABELS[kind]}: ${sourceName}`,
        value,
        confidence,
        clamp(confidence + (kind === FlashcardKind.PRICE ? 10 : 6), 60, 92),
        clamp(confidence + 4, 58, 90),
        { ...evidenceBase, insightIndex: index },
        `source-insight-${index}-${value}`,
        topicContext,
      ),
    );
  });

  priceSignals.slice(0, 1).forEach((value) => {
    drafts.push(
      makeDraft(
        source,
        FlashcardKind.PRICE,
        `Pricing signal: ${sourceName}`,
        value,
        estimateSourceConfidence(source, value, 0),
        84,
        82,
        evidenceBase,
        `source-price-${value}`,
        topicContext,
      ),
    );
  });

  const related = context.find(
    (item): item is UnifiedSource =>
      item.type === "SOURCE" &&
      item.id !== source.id &&
      sharedSourceContext(source, item).length > 0,
  );

  if (related) {
    const leftInsight = insights[0];
    const rightInsights = extractSourceInsights(related, 3);
    const rightInsight = rightInsights[0];
    const sharedContext = sharedSourceContext(source, related);

    if (leftInsight && rightInsight) {
      const body = `${sourceName} and ${displaySourceName(sourceDisplayName(related))} reinforce ${sharedContext.join(", ")}. ${leftInsight} ${rightInsight}`;
      const draft = makeDraft(
        source,
        FlashcardKind.COMPARISON,
        `Synthesis: ${sourceName}`,
        body,
        estimateSourceConfidence(source, body, 0, 1),
        88,
        86,
        {
          ...evidenceBase,
          supportingSourceIds: [related.id],
          sharedContext,
        },
        `source-synthesis-${related.id}-${sharedContext.join("-")}`,
        topicContext,
      );
      draft.supportingSources = [{
        type: related.type,
        id: related.id,
        publicId: related.publicId,
        sourceName: related.sourceName,
      }];
      drafts.push(draft);
    }
  }

  return drafts;
}

function productEvidenceSignals(source: ProductSource) {
  return dedupeStrings(
    [
      ...source.features,
      ...getAnalysisItems(source.watchedContent, "conclusions"),
      ...getAnalysisItems(source.watchedContent, "evaluations"),
      ...getSearchSnippets(source.watchedContent),
    ],
    6,
  ).filter((item) => !isWeakEvidenceLine(item));
}

function competitorEvidenceSignals(source: CompetitorSource) {
  return dedupeStrings(
    [
      ...source.strengths,
      ...getAnalysisItems(source.watchedContent, "conclusions"),
      ...getAnalysisItems(source.watchedContent, "evaluations"),
      ...getSearchSnippets(source.watchedContent),
    ],
    6,
  ).filter((item) => !isWeakEvidenceLine(item));
}

/**
 * Factory function for creating a FlashcardDraft object.
 * Enforces schema constraints and normalizes scores/hashtags.
 * 
 * @param {SourceRecord} source - The source record
 * @param {FlashcardKind} kind - Flashcard category
 * @param {string} title - Human-readable title
 * @param {string} body - Synthesized description
 * @param {number} confidence - AI-estimated confidence (1-10)
 * @param {number} impact - Strategic impact (1-10)
 * @param {number} weight - Relative weight (1-10)
 * @param {Prisma.InputJsonValue | null} evidence - Supporting data
 * @param {string} seed - Seed for fingerprinting
 * @returns {FlashcardDraft} Standardized draft object
 */
function makeDraft(source: SourceRecord, kind: FlashcardKind, title: string, body: string, confidence: number, impact: number, weight: number, evidence: Prisma.InputJsonValue | null, seed: string, topicContext: TopicRecord[] = []): FlashcardDraft {
  const support = deriveFlashcardSourceSupport(source, topicContext);
  const mergedEvidence =
    evidence && typeof evidence === "object"
      ? {
          ...(evidence as Record<string, unknown>),
          sourceScore: support.sourceProfile,
          topicScore: support.topicProfile,
          matchedTopics: support.matchedTopics ?? [],
        }
      : evidence;
  const grounded = groundKnowledgeScores({
    confidence,
    impact,
    weight,
    kind,
    title,
    body,
    evidence: mergedEvidence,
    hashtags: stripSourceTypeHashtags(source.hashtags),
    ...support.supportSignals,
  });

  return {
    kind,
    fingerprint: buildFingerprint(source, kind, seed),
    title,
    body: normalizeMarkdownBody(sentenceize(body)),
    confidence: grounded.confidence,
    impact: grounded.impact,
    weight: grounded.effort,
    evidence: (mergedEvidence as Prisma.InputJsonValue | null) ?? null,
    hashtags: stripSourceTypeHashtags(source.hashtags),
    source: {
      type: source.type,
      id: source.id,
      publicId: source.publicId,
      sourceName: source.sourceName,
    },
    supportingSources: [],
    refreshedAt: source.updatedAt,
  };
}

function buildProductDrafts(source: ProductSource, context: SourceRecord[], topicContext: TopicRecord[]) {
  const drafts: FlashcardDraft[] = [];
  const sections = parseLabeledSections(source.description);
  const sourceName = displaySourceName(source.knowledgeName);
  const evidenceBase = {
    urls: source.urls,
    pricing: source.pricing,
    features: source.features,
    watchedContent: source.watchedContent,
  } satisfies Prisma.InputJsonObject;
  const analysisByKind: Array<[string, FlashcardKind, string[]]> = [
    ["conclusions", FlashcardKind.CONCLUSION, getAnalysisItems(source.watchedContent, "conclusions")],
    ["evaluations", FlashcardKind.EVALUATION, getAnalysisItems(source.watchedContent, "evaluations")],
    ["judgments", FlashcardKind.JUDGMENT, getAnalysisItems(source.watchedContent, "judgments")],
    ["recommendations", FlashcardKind.RECOMMENDATION, getAnalysisItems(source.watchedContent, "recommendations")],
    ["researchPlans", FlashcardKind.RESEARCH, getAnalysisItems(source.watchedContent, "researchPlans")],
    ["forecasts", FlashcardKind.FORECAST, getAnalysisItems(source.watchedContent, "forecasts")],
    ["stockSignal", FlashcardKind.STOCK, getAnalysisItems(source.watchedContent, "stockSignal")],
    ["marketChatter", FlashcardKind.GOSSIP, getAnalysisItems(source.watchedContent, "marketChatter")],
  ];

  for (const [label, kind, values] of analysisByKind) {
    values.forEach((value, index) => {
      drafts.push(
        makeDraft(
          source,
          kind,
          `${KIND_LABELS[kind]}: ${sourceName}`,
          value,
          kind === FlashcardKind.GOSSIP ? 54 : 66 + Math.min(index, 2) * 3,
          kind === FlashcardKind.RECOMMENDATION ? 82 : 74,
          kind === FlashcardKind.RECOMMENDATION ? 80 : 76,
          { ...evidenceBase, section: label },
          `analysis-${label}-${index}-${value}`,
          topicContext,
        ),
      );
    });
  }

  getNewsTitles(source.watchedContent).forEach((value, index) => {
    if (isLowValueNewsLine(sourceName, value)) {
      return;
    }
    drafts.push(
      makeDraft(
        source,
        FlashcardKind.NEWS,
        `Industry news: ${sourceName}`,
        value,
        61 + Math.min(index, 2) * 2,
        72,
        70,
        { ...evidenceBase, section: "newsSignals" },
        `news-${index}-${value}`,
        topicContext,
      ),
    );
  });

  for (const [label, kind] of Object.entries(SECTION_KIND_MAP)) {
    const values = sections.get(label) ?? [];
    values.forEach((value, index) => {
      if (isLowValueCardText(value)) {
        return;
      }
      drafts.push(
        makeDraft(
          source,
          kind,
          `${KIND_LABELS[kind]}: ${sourceName}`,
          value,
          62 + Math.min(index, 2) * 2,
          kind === FlashcardKind.RECOMMENDATION ? 84 : 72,
          kind === FlashcardKind.RECOMMENDATION ? 82 : 74,
          { ...evidenceBase, section: label },
          `${label}-${index}-${value}`,
          topicContext,
        ),
      );
    });
  }

  if (source.pricing && !isWeakPriceSignal(source.pricing)) {
    drafts.push(
      makeDraft(
        source,
        FlashcardKind.PRICE,
        `Pricing: ${sourceName}`,
        `${sourceName} shows a visible price signal of ${source.pricing}`,
        76,
        78,
        77,
        evidenceBase,
        `price-${source.pricing}`,
        topicContext,
      ),
    );
  }

  dedupeStrings(source.features, 3).forEach((feature, index) => {
    if (isWeakEvidenceLine(feature)) {
      return;
    }
    drafts.push(
      makeDraft(
        source,
        FlashcardKind.EXPLANATION,
        `Capability: ${sourceName}`,
        `${sourceName} appears to emphasize ${feature}`,
        64,
        70,
        68,
        evidenceBase,
        `feature-${index}-${feature}`,
        topicContext,
      ),
    );
  });

  const competitor = context.find((item): item is CompetitorSource => (item as any).entityTag === "competitor" && item.id !== (source as any).id && (item as any).strengths?.length > 0);
  if (competitor) {
    const comparison = comparisonText(
      sourceName,
      productEvidenceSignals(source),
      displaySourceName(competitor.knowledgeName),
      competitorEvidenceSignals(competitor),
    );

    if (comparison) {
      drafts.push(
        makeDraft(
          source,
          FlashcardKind.COMPARISON,
          `Comparison: ${sourceName}`,
          comparison,
          61,
          82,
          80,
          {
            ...evidenceBase,
            comparedTo: {
              id: competitor.id,
              publicId: competitor.publicId,
              name: competitor.knowledgeName,
            },
          },
          `comparison-${competitor.id}`,
          topicContext,
        ),
      );
    }
  }

  return drafts;
}

function buildCustomerDrafts(source: CustomerSource, topicContext: TopicRecord[]) {
  const drafts: FlashcardDraft[] = [];
  const sourceName = displaySourceName(source.knowledgeName);
  const evidenceBase = {
    email: source.email,
    segments: source.segments,
    painPoints: source.painPoints,
    channels: source.channels,
    lifetimeValue: source.lifetimeValue,
  } satisfies Prisma.InputJsonObject;

  dedupeStrings(source.painPoints, 3).forEach((painPoint, index) => {
    drafts.push(
      makeDraft(
        source,
        FlashcardKind.CONCLUSION,
        `Pain point: ${sourceName}`,
        `${sourceName} repeatedly signals the pain point: ${painPoint}`,
        72,
        80,
        79,
        evidenceBase,
        `pain-${index}-${painPoint}`,
        topicContext,
      ),
    );
  });

  dedupeStrings(source.channels, 3).forEach((channel, index) => {
    drafts.push(
      makeDraft(
        source,
        FlashcardKind.RECOMMENDATION,
        `Reach strategy: ${sourceName}`,
        `${sourceName} is reachable through ${channel}, which should influence channel selection and follow-up timing`,
        68,
        76,
        75,
        evidenceBase,
        `channel-${index}-${channel}`,
        topicContext,
      ),
    );
  });

  if (source.notes) {
    drafts.push(
      makeDraft(
        source,
        FlashcardKind.EXPLANATION,
        `Customer understanding: ${sourceName}`,
        source.notes,
        66,
        74,
        73,
        evidenceBase,
        `notes-${source.notes}`,
        topicContext,
      ),
    );
  }

  return drafts;
}

function buildCompetitorDrafts(source: CompetitorSource, context: SourceRecord[], topicContext: TopicRecord[]) {
  const drafts: FlashcardDraft[] = [];
  const sections = parseLabeledSections(source.positioning);
  const sourceName = displaySourceName(source.knowledgeName);
  const evidenceBase = {
    urls: source.urls,
    pricing: source.pricing,
    strengths: source.strengths,
    weaknesses: source.weaknesses,
    watchedContent: source.watchedContent,
  } satisfies Prisma.InputJsonObject;
  const analysisByKind: Array<[string, FlashcardKind, string[]]> = [
    ["conclusions", FlashcardKind.CONCLUSION, getAnalysisItems(source.watchedContent, "conclusions")],
    ["evaluations", FlashcardKind.EVALUATION, getAnalysisItems(source.watchedContent, "evaluations")],
    ["judgments", FlashcardKind.JUDGMENT, getAnalysisItems(source.watchedContent, "judgments")],
    ["recommendations", FlashcardKind.RECOMMENDATION, getAnalysisItems(source.watchedContent, "recommendations")],
    ["researchPlans", FlashcardKind.RESEARCH, getAnalysisItems(source.watchedContent, "researchPlans")],
    ["forecasts", FlashcardKind.FORECAST, getAnalysisItems(source.watchedContent, "forecasts")],
    ["stockSignal", FlashcardKind.STOCK, getAnalysisItems(source.watchedContent, "stockSignal")],
    ["marketChatter", FlashcardKind.GOSSIP, getAnalysisItems(source.watchedContent, "marketChatter")],
  ];

  for (const [label, kind, values] of analysisByKind) {
    values.forEach((value, index) => {
      drafts.push(
        makeDraft(
          source,
          kind,
          `${KIND_LABELS[kind]}: ${sourceName}`,
          value,
          kind === FlashcardKind.GOSSIP ? 54 : 68 + Math.min(index, 2) * 2,
          kind === FlashcardKind.RECOMMENDATION ? 84 : 78,
          kind === FlashcardKind.RECOMMENDATION ? 82 : 78,
          { ...evidenceBase, section: label },
          `analysis-${label}-${index}-${value}`,
          topicContext,
        ),
      );
    });
  }

  getNewsTitles(source.watchedContent).forEach((value, index) => {
    if (isLowValueNewsLine(sourceName, value)) {
      return;
    }
    drafts.push(
      makeDraft(
        source,
        FlashcardKind.NEWS,
        `Industry news: ${sourceName}`,
        value,
        62 + Math.min(index, 2) * 2,
        76,
        74,
        { ...evidenceBase, section: "newsSignals" },
        `news-${index}-${value}`,
        topicContext,
      ),
    );
  });

  for (const [label, kind] of Object.entries(SECTION_KIND_MAP)) {
    const values = sections.get(label) ?? [];
    values.forEach((value, index) => {
      if (isLowValueCardText(value)) {
        return;
      }
      drafts.push(
        makeDraft(
          source,
          kind,
          `${KIND_LABELS[kind]}: ${sourceName}`,
          value,
          kind === FlashcardKind.GOSSIP ? 52 : 64 + Math.min(index, 2) * 2,
          kind === FlashcardKind.RECOMMENDATION ? 86 : 78,
          kind === FlashcardKind.RECOMMENDATION ? 84 : 76,
          { ...evidenceBase, section: label },
          `${label}-${index}-${value}`,
          topicContext,
        ),
      );
    });
  }

  if (source.pricing && !isWeakPriceSignal(source.pricing)) {
    drafts.push(
      makeDraft(
        source,
        FlashcardKind.PRICE,
        `Pricing: ${sourceName}`,
        `${sourceName} shows a visible price signal of ${source.pricing}`,
        78,
        80,
        79,
        evidenceBase,
        `price-${source.pricing}`,
        topicContext,
      ),
    );
  }

  const product = context.find((item): item is ProductSource => (item as any).entityTag === "product" && (item as any).features?.length > 0);
  if (product) {
    const comparison = comparisonText(
      sourceName,
      competitorEvidenceSignals(source),
      displaySourceName(product.knowledgeName),
      productEvidenceSignals(product),
    );

    if (comparison) {
      drafts.push(
        makeDraft(
          source,
          FlashcardKind.COMPARISON,
          `Comparison: ${sourceName}`,
          comparison,
          66,
          88,
          86,
          {
            ...evidenceBase,
            comparedTo: {
              id: product.id,
              publicId: product.publicId,
              name: product.knowledgeName,
            },
          },
          `comparison-${product.id}`,
          topicContext,
        ),
      );
    }
  }

  return drafts;
}

function buildFileDrafts(source: FileSource, topicContext: TopicRecord[]) {
  const drafts: FlashcardDraft[] = [];
  const sourceName = displaySourceName(source.knowledgeName);
  const evidenceBase = {
    mimeType: source.mimeType,
    sizeBytes: source.sizeBytes,
    hashtags: source.hashtags,
    extractedText: source.extractedText,
    watchedContent: source.watchedContent,
  } satisfies Prisma.InputJsonObject;
  const watchedRecord = getWatchedContentRecord(source.watchedContent);
  const analysis = getWatchedObject(watchedRecord, "analysis");
  const summary = getFileSummary(source.watchedContent);
  const analysisByKind: Array<[FlashcardKind, string, string[]]> = [
    [FlashcardKind.EXPLANATION, "explanations", getAnalysisItems(source.watchedContent, "explanations")],
    [FlashcardKind.CONCLUSION, "conclusions", getAnalysisItems(source.watchedContent, "conclusions")],
    [FlashcardKind.EVALUATION, "evaluations", getAnalysisItems(source.watchedContent, "evaluations")],
    [FlashcardKind.JUDGMENT, "judgments", getAnalysisItems(source.watchedContent, "judgments")],
    [FlashcardKind.RECOMMENDATION, "recommendations", getAnalysisItems(source.watchedContent, "recommendations")],
    [FlashcardKind.COMPARISON, "comparisons", getAnalysisItems(source.watchedContent, "comparisons")],
    [FlashcardKind.NEWS, "industryNews", getAnalysisItems(source.watchedContent, "industryNews")],
    [FlashcardKind.RESEARCH, "researchPlans", getAnalysisItems(source.watchedContent, "researchPlans")],
    [FlashcardKind.FORECAST, "forecasts", getAnalysisItems(source.watchedContent, "forecasts")],
    [FlashcardKind.PRICE, "prices", getAnalysisItems(source.watchedContent, "prices")],
    [FlashcardKind.GOSSIP, "marketChatter", getAnalysisItems(source.watchedContent, "marketChatter")],
  ];

  if (summary && !isLowValueCardText(summary)) {
    drafts.push(
      makeDraft(
        source,
        FlashcardKind.EXPLANATION,
        `File insight: ${sourceName}`,
        summary,
        72,
        76,
        76,
        evidenceBase,
        `file-summary-${summary}`,
        topicContext,
      ),
    );
  }

  for (const [kind, label, values] of analysisByKind) {
    values.forEach((value, index) => {
      drafts.push(
        makeDraft(
          source,
          kind,
          `${KIND_LABELS[kind]}: ${sourceName}`,
          value,
          kind === FlashcardKind.GOSSIP ? 54 : 68 + Math.min(index, 2) * 2,
          kind === FlashcardKind.RECOMMENDATION ? 84 : 76,
          kind === FlashcardKind.RECOMMENDATION ? 82 : 76,
          { ...evidenceBase, section: label, analysis },
          `file-${label}-${index}-${value}`,
          topicContext,
        ),
      );
    });
  }

  return drafts;
}

function isPublishableSource(source: SourceRecord) {
  if (source.type === "FILE") {
    return Boolean(source.extractedText || getFileSummary(source.watchedContent) || getAnalysisItems(source.watchedContent, "conclusions").length > 0);
  }

  // Handle Unified Sources by entityTag
  if (source.entityTag === "product") {
    const s = source as ProductSource;
    return Boolean(normalizeText(s.description) || normalizeText(s.pricing) || s.features.length > 0);
  }
  if (source.entityTag === "customer") {
    const s = source as CustomerSource;
    return Boolean(normalizeText(s.notes) || s.segments.length > 0 || s.painPoints.length > 0 || s.channels.length > 0 || s.lifetimeValue || s.email);
  }
  if (source.entityTag === "competitor") {
    const s = source as CompetitorSource;
    return Boolean(normalizeText(s.positioning) || normalizeText(s.pricing) || s.strengths.length > 0 || s.weaknesses.length > 0);
  }

  // Fallback to legacy/generic insight check
  return extractSourceInsights(source as UnifiedSource, 2).length > 0;
}

function buildFlashcardDrafts(source: UnifiedSource, context: SourceRecord[], topicContext: TopicRecord[]) {
  if (source.entityTag === "product") {
    return buildProductDrafts(source as any, context, topicContext);
  }
  if (source.entityTag === "competitor") {
    return buildCompetitorDrafts(source as any, context, topicContext);
  }
  if (source.entityTag === "customer") {
    return buildCustomerDrafts(source as any, topicContext);
  }

  // Fallback to generic source or file specific drafting
  if ((source as any).type === "FILE") {
    return buildFileDrafts(source as any, topicContext);
  }

  return buildSourceDrafts(source, context, topicContext);
}

function resolveDisplayContent(existing: { manualTitle: string | null; manualBody: string | null }, draft: FlashcardDraft) {
  const manualTitle = normalizeText(existing.manualTitle);
  const manualBody = existing.manualBody ? normalizeMarkdownBody(existing.manualBody) : null;

  return {
    generatedTitle: draft.title,
    generatedBody: normalizeMarkdownBody(draft.body),
    manualTitle,
    manualBody,
    title: manualTitle ?? draft.title,
    body: manualBody ?? normalizeMarkdownBody(draft.body),
  };
}

function applyFeedbackDeltas(draft: FlashcardDraft, existing?: { feedbackWeightDelta: number; feedbackConfidenceDelta: number }) {
  const weightDelta = existing?.feedbackWeightDelta ?? 0;
  const confidenceDelta = existing?.feedbackConfidenceDelta ?? 0;

  return {
    confidence: clampMetric(draft.confidence + confidenceDelta),
    weight: clampMetric(draft.weight + weightDelta),
  };
}

function effectiveConfidence(value: { confidence: number; feedbackConfidenceDelta?: number | null }) {
  return clampMetric(value.confidence + (value.feedbackConfidenceDelta ?? 0));
}

function effectiveWeight(value: { weight: number; feedbackWeightDelta?: number | null }) {
  return clampMetric(value.weight + (value.feedbackWeightDelta ?? 0));
}

function shouldPublishDraft(draft: FlashcardDraft, existing?: { feedbackConfidenceDelta: number }) {
  const confidenceDelta = existing?.feedbackConfidenceDelta ?? 0;
  return draft.confidence + confidenceDelta > 5;
}

async function reconcilePendingTasksForFlashcards(tx: Prisma.TransactionClient, flashcardIds: string[]) {
  if (flashcardIds.length === 0) {
    return;
  }

  const affected = await tx.checklistTask.findMany({
    where: {
      status: "PENDING",
      sourceFlashcardIds: { hasSome: flashcardIds },
    },
  });

  if (affected.length === 0) {
    return;
  }

  const relatedIds = Array.from(new Set(affected.flatMap((item) => item.sourceFlashcardIds)));
  const flashcards = await tx.flashcard.findMany({
    where: { id: { in: relatedIds } },
    select: {
      id: true,
      status: true,
      reviewStatus: true,
      confidence: true,
      feedbackConfidenceDelta: true,
    },
  });
  const flashcardById = new Map(flashcards.map((flashcard) => [flashcard.id, flashcard]));

  for (const item of affected) {
    const eligibleSources = item.sourceFlashcardIds.filter((id) => {
      const flashcard = flashcardById.get(id);
      if (!flashcard) return false;
      return (
        flashcard.status === FlashcardStatus.ACTIVE &&
        flashcard.reviewStatus !== FlashcardReviewStatus.DECLINED &&
        effectiveConfidence(flashcard) > 5
      );
    });

    if (eligibleSources.length === 0) {
      await tx.checklistTask.update({
        where: { id: item.id },
        data: {
          status: "DECLINED",
          userAnnotation: "Auto-declined because supporting flashcards fell below quality threshold.",
        },
      });
      continue;
    }

    if (eligibleSources.length !== item.sourceFlashcardIds.length) {
      await tx.checklistTask.update({
        where: { id: item.id },
        data: { sourceFlashcardIds: eligibleSources },
      });
    }
  }
}

function needsFlashcardUpdate(
  existing: {
    kind: FlashcardKind;
    title: string;
    body: string;
    generatedTitle: string | null;
    generatedBody: string | null;
    manualTitle: string | null;
    manualBody: string | null;
    confidence: number;
    impact: number;
    weight: number;
    evidence: Prisma.JsonValue | null;
    feedbackWeightDelta: number;
    feedbackConfidenceDelta: number;
    citationSnapshotIds: string[];
    conflictDetected: boolean;
    conflictSummary: string | null;
    status: FlashcardStatus;
    appVersion: string | null;
    brainVersion: string | null;
    promptVersion: string | null;
    generatedAt: Date | null;
    refreshedAt: Date;
    fingerprint: string | null;
  },
  draft: FlashcardDraft,
  refreshedAt: Date,
) {
  const resolved = resolveDisplayContent(existing, draft);
  const adjusted = applyFeedbackDeltas(draft, existing);

  return (
    existing.kind !== draft.kind ||
    existing.fingerprint !== draft.fingerprint ||
    existing.title !== resolved.title ||
    existing.body !== resolved.body ||
    existing.generatedTitle !== resolved.generatedTitle ||
    existing.generatedBody !== resolved.generatedBody ||
    existing.manualTitle !== resolved.manualTitle ||
    existing.manualBody !== resolved.manualBody ||
    existing.confidence !== adjusted.confidence ||
    existing.impact !== draft.impact ||
    existing.weight !== adjusted.weight ||
    JSON.stringify(existing.evidence) !== JSON.stringify(draft.evidence) ||
    JSON.stringify(existing.citationSnapshotIds ?? []) !== JSON.stringify(draft.citationSnapshotIds ?? []) ||
    existing.conflictDetected !== Boolean(draft.conflictDetected) ||
    (existing.conflictSummary ?? null) !== (draft.conflictSummary ?? null) ||
    existing.status !== FlashcardStatus.ACTIVE ||
    existing.appVersion !== APP_VERSION ||
    existing.brainVersion !== BRAIN_VERSION ||
    existing.promptVersion !== FLASHCARD_PROMPT_VERSION ||
    !sameDate(existing.generatedAt, refreshedAt) ||
    !sameDate(existing.refreshedAt, refreshedAt)
  );
}

function draftSourceEntries(draft: FlashcardDraft) {
  const desired = [
    {
      ...draft.source,
      relationRole: FlashcardSourceRole.PRIMARY,
    },
    ...(draft.supportingSources ?? []).map((source) => ({
      ...source,
      relationRole: FlashcardSourceRole.SUPPORTING,
    })),
  ];

  const seen = new Set<string>();
  return desired.filter((entry) => {
    const key = `${entry.type}:${entry.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function syncFlashcardSources(
  tx: Prisma.TransactionClient,
  flashcardId: string,
  existingSources: Array<{
    id: string;
    sourceType: FlashcardSourceKind;
    sourceId: string;
    sourcePublicId: number | null;
    sourceName: string;
    relationRole: FlashcardSourceRole;
  }>,
  draft: FlashcardDraft,
) {
  const desired = draftSourceEntries(draft);
  const desiredKeys = new Set(desired.map((entry) => `${entry.type}:${entry.id}`));

  for (const entry of desired) {
    const existing = existingSources.find(
      (item) => item.sourceType === entry.type && item.sourceId === entry.id,
    );

    if (existing) {
      if (
        existing.sourcePublicId !== entry.publicId ||
        existing.sourceName !== entry.sourceName ||
        existing.relationRole !== entry.relationRole
      ) {
        await tx.flashcardSource.update({
          where: {
            flashcardId_sourceType_sourceId: {
              flashcardId,
              sourceType: entry.type,
              sourceId: entry.id,
            },
          },
          data: {
            sourcePublicId: entry.publicId,
            sourceName: entry.sourceName,
            relationRole: entry.relationRole,
            updatedAt: new Date(),
          },
        });
      }
      continue;
    }

    await tx.flashcardSource.create({
      data: {
        flashcardId,
        sourceType: entry.type,
        sourceId: entry.id,
        sourcePublicId: entry.publicId,
        sourceName: entry.sourceName,
        relationRole: entry.relationRole,
      },
    });
  }

  for (const existing of existingSources) {
    const key = `${existing.sourceType}:${existing.sourceId}`;
    if (desiredKeys.has(key)) continue;
    await tx.flashcardSource.delete({ where: { id: existing.id } });
  }
}

async function mapSeries<T, R>(items: T[], mapper: (item: T) => Promise<R>) {
  const results: R[] = [];
  for (const item of items) {
    results.push(await mapper(item));
  }
  return results;
}

async function loadCompanySources(companyId: string) {
  await ensureUnifiedSources(companyId);
  const suppressedSourceCorrections = await prisma.flashcardCorrection.findMany({
    where: {
      companyId,
      correctionType: FlashcardCorrectionType.SUPPRESS_SOURCE,
      sourceId: { not: null },
    },
    select: {
      sourceType: true,
      sourceId: true,
    },
  });
  const suppressedSourceKeys = new Set(
    suppressedSourceCorrections
      .map((correction) => sourceKeyFromCorrection(correction.sourceType as FlashcardSourceKind | null, correction.sourceId))
      .filter((value): value is string => Boolean(value)),
  );
  const [sources, uploadedFiles] = await Promise.all([
    prisma.source.findMany({ where: { companyId }, orderBy: [{ publicId: "asc" }, { createdAt: "asc" }] }),
    prisma.uploadedSourceFile.findMany({ where: { companyId }, orderBy: [{ publicId: "asc" }, { createdAt: "asc" }] }),
  ]);

  const [derivedSources, derivedFiles] = await Promise.all([
    Promise.resolve(
      sources.map((source) => ({
        type: "SOURCE",
        id: source.id,
        publicId: source.publicId,
        sourceName: sourceDisplayName({
          type: "SOURCE",
          id: source.id,
          publicId: source.publicId,
          sourceName: "",
          knowledgeName: "",
          hashtags: source.hashtags,
          createdAt: source.createdAt,
          updatedAt: source.updatedAt,
          content: source.content,
          entityTag: source.entityTag,
          aiClusters: source.aiClusters,
          metadata: source.metadata,
        }),
        knowledgeName: sourceDisplayName({
          type: "SOURCE",
          id: source.id,
          publicId: source.publicId,
          sourceName: "",
          knowledgeName: "",
          hashtags: source.hashtags,
          createdAt: source.createdAt,
          updatedAt: source.updatedAt,
          content: source.content,
          entityTag: source.entityTag,
          aiClusters: source.aiClusters,
          metadata: source.metadata,
        }),
        hashtags: normalizeSourceHashtags(source.hashtags),
        confidence: source.confidence,
        confidenceScore: source.confidenceScore,
        impact: source.impact,
        weight: source.weight,
        iceScore: source.iceScore,
        content: source.content,
        entityTag: normalizeText(source.entityTag),
        aiClusters: normalizeSourceHashtags(source.aiClusters),
        metadata: source.metadata,
        createdAt: source.createdAt,
        updatedAt: source.updatedAt,
      }) satisfies UnifiedSource),
    ),
    mapSeries(uploadedFiles, async (file) => {
      const enriched = await enrichUploadedFile({
        name: file.name,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        hashtags: file.hashtags,
        content: Buffer.from(file.content),
      });

      return {
        type: "FILE",
        id: file.id,
        publicId: file.publicId,
        sourceName: file.name,
        knowledgeName: file.name,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        hashtags: normalizeSourceHashtags(file.hashtags, "product"),
        confidence: file.confidence,
        confidenceScore: file.confidenceScore,
        impact: file.impact,
        weight: file.weight,
        iceScore: file.iceScore,
        extractedText: enriched.extractedText,
        watchedContent: (enriched.watchedContent as Prisma.JsonValue | undefined) ?? null,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      } satisfies FileSource;
    }),
  ]);

  return [
    ...derivedSources,
    ...derivedFiles,
  ].filter((source) => !suppressedSourceKeys.has(sourceKey(source.type, source.id))) satisfies SourceRecord[];
}

export async function syncCompanyKnowledge(companyId: string) {
  await syncBootstrapFlashcards(companyId);
}

export async function syncBootstrapFlashcards(companyId: string) {
  await ensureSourcePublicIds(companyId);
  const sources = await loadCompanySources(companyId);
  const topics = await prisma.topic.findMany({
    where: { companyId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      label: true,
      hashtags: true,
      active: true,
      sortOrder: true,
      notes: true,
      confidence: true,
      confidenceScore: true,
      impact: true,
      weight: true,
      iceScore: true,
    },
  });
  const candidateDrafts = sources
    .filter(isPublishableSource)
    .flatMap((source) => buildFlashcardDrafts(source, sources, topics));

  return withSerializableRetry(() =>
    prisma.$transaction(async (tx) => {
      const flashcards = await tx.flashcard.findMany({
        where: { companyId, createdBy: BOOTSTRAP_CREATED_BY },
        include: { sources: true },
      });

      const flashcardByFingerprint = new Map(flashcards.map((flashcard) => [flashcard.fingerprint, flashcard]));
      const newDrafts = candidateDrafts.filter((draft) => {
        const existing = flashcardByFingerprint.get(draft.fingerprint);
        return !existing && shouldPublishDraft(draft);
      });
      const reservedFlashcardIds = await reservePublicIds(
        tx,
        PUBLIC_ID_SCOPES.flashcard,
        newDrafts.length,
      );
      let nextReservedFlashcardIdIndex = 0;
      const flashcardsToCreate: Prisma.FlashcardCreateManyInput[] = [];
      const flashcardSourcesToCreate: Prisma.FlashcardSourceCreateManyInput[] = [];
      const activeFingerprints = new Set<string>();
      const seenFingerprints = new Set<string>();

      for (const draft of candidateDrafts) {
        if (seenFingerprints.has(draft.fingerprint)) {
          continue;
        }
        seenFingerprints.add(draft.fingerprint);

        const existing = flashcardByFingerprint.get(draft.fingerprint);
        if (!shouldPublishDraft(draft, existing)) {
          if (existing && existing.status !== FlashcardStatus.ARCHIVED) {
            await tx.flashcard.update({ where: { id: existing.id }, data: { status: FlashcardStatus.ARCHIVED } });
          }
          continue;
        }

        activeFingerprints.add(draft.fingerprint);

        if (existing) {
          const resolved = resolveDisplayContent(existing, draft);
          const adjusted = applyFeedbackDeltas(draft, existing);

          if (needsFlashcardUpdate(existing, draft, draft.refreshedAt)) {
            await tx.flashcard.update({
              where: { id: existing.id },
              data: {
                kind: draft.kind,
                title: resolved.title,
                body: resolved.body,
                generatedTitle: resolved.generatedTitle,
                generatedBody: resolved.generatedBody,
                manualTitle: resolved.manualTitle,
                manualBody: resolved.manualBody,
                confidence: adjusted.confidence,
                confidenceScore: adjusted.confidence,
                impact: draft.impact,
                weight: adjusted.weight,
                iceScore: calculateKnowledgeIceScore({
                  impact: draft.impact,
                  confidence: adjusted.confidence,
                  weight: adjusted.weight,
                }),
                hashtags: draft.hashtags,
                evidence: draft.evidence ?? undefined,
                citationSnapshotIds: draft.citationSnapshotIds ?? [],
                conflictDetected: Boolean(draft.conflictDetected),
                conflictSummary: draft.conflictSummary ?? null,
                status: FlashcardStatus.ACTIVE,
                appVersion: APP_VERSION,
                brainVersion: BRAIN_VERSION,
                promptVersion: FLASHCARD_PROMPT_VERSION,
                generatedAt: draft.refreshedAt,
                refreshedAt: draft.refreshedAt,
              },
            });
          }

          await syncFlashcardSources(tx, existing.id, existing.sources as Array<{
            id: string;
            sourceType: FlashcardSourceKind;
            sourceId: string;
            sourcePublicId: number | null;
            sourceName: string;
            relationRole: FlashcardSourceRole;
          }>, draft);

          continue;
        }

        const publicId = reservedFlashcardIds[nextReservedFlashcardIdIndex];
        nextReservedFlashcardIdIndex += 1;
        const adjusted = applyFeedbackDeltas(draft);

        const flashcardId = randomUUID();
        flashcardsToCreate.push({
          id: flashcardId,
          publicId,
          companyId,
          kind: draft.kind,
          fingerprint: draft.fingerprint,
          title: draft.title,
          body: draft.body,
          generatedTitle: draft.title,
          generatedBody: draft.body,
          confidence: adjusted.confidence,
          confidenceScore: adjusted.confidence,
          impact: draft.impact,
          weight: adjusted.weight,
          iceScore: calculateKnowledgeIceScore({
            impact: draft.impact,
            confidence: adjusted.confidence,
            weight: adjusted.weight,
          }),
          hashtags: draft.hashtags,
          evidence: draft.evidence ?? undefined,
          citationSnapshotIds: draft.citationSnapshotIds ?? [],
          conflictDetected: Boolean(draft.conflictDetected),
          conflictSummary: draft.conflictSummary ?? null,
          status: FlashcardStatus.ACTIVE,
          createdBy: BOOTSTRAP_CREATED_BY,
          appVersion: APP_VERSION,
          brainVersion: BRAIN_VERSION,
          promptVersion: FLASHCARD_PROMPT_VERSION,
          generatedAt: draft.refreshedAt,
          refreshedAt: draft.refreshedAt,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        for (const sourceEntry of draftSourceEntries(draft)) {
          flashcardSourcesToCreate.push({
            id: randomUUID(),
            flashcardId,
            sourceType: sourceEntry.type,
            sourceId: sourceEntry.id,
            sourcePublicId: sourceEntry.publicId,
            sourceName: sourceEntry.sourceName,
            relationRole: sourceEntry.relationRole,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }

      if (flashcardsToCreate.length > 0) {
        await tx.flashcard.createMany({ data: flashcardsToCreate });
        await tx.flashcardSource.createMany({ data: flashcardSourcesToCreate });
      }

      for (const flashcard of flashcards) {
        const fingerprint = flashcard.fingerprint ?? "";
        if (!activeFingerprints.has(fingerprint) && flashcard.status !== FlashcardStatus.ARCHIVED) {
          await tx.flashcard.update({ where: { id: flashcard.id }, data: { status: FlashcardStatus.ARCHIVED, updatedAt: new Date() } });
        }
      }

      await reconcilePendingTasksForFlashcards(tx, [
        ...flashcards.map((flashcard) => flashcard.id),
        ...flashcardsToCreate
          .map((flashcard) => flashcard.id)
          .filter((flashcardId): flashcardId is string => Boolean(flashcardId)),
      ]);
    }, {
      ...TRANSACTION_SETTINGS,
    }),
  );
}

function flashcardActionDelta(action: FlashcardActionType) {
  switch (action) {
    case FlashcardActionType.ACCEPT:
      return { confidence: 1, weight: 1 };
    case FlashcardActionType.DECLINE:
      return { confidence: -3, weight: -2 };
    case FlashcardActionType.MODIFY_ACCEPT:
      return { confidence: 2, weight: 2 };
    default:
      return assertNever(action);
  }
}

export async function recordFlashcardAction(input: FlashcardActionInput) {
  const annotation = normalizeAnnotationText(input.annotation);

  return withSerializableRetry(() =>
    prisma.$transaction(async (tx) => {
      const flashcard = await tx.flashcard.findUnique({
        where: { id: input.flashcardId },
        include: FLASHCARD_INCLUDES,
      });

      if (!flashcard) {
        throw new Error("Flashcard not found");
      }

      if (flashcard.status === FlashcardStatus.ARCHIVED || flashcard.activityState === FlashcardActivityState.ARCHIVED) {
        throw new Error("This flashcard has already been archived or declined.");
      }

      if (input.action === FlashcardActionType.DECLINE && !annotation) {
        throw new Error("Decline requires a comment");
      }

      // BASELINE CONTENT: We use generatedTitle/Body if they exist, otherwise we use the current title/body as the "AI baseline"
      // unless we ALREADY have a manual override.
      const generatedTitle = flashcard.generatedTitle ?? (flashcard.manualTitle ? null : flashcard.title);
      const generatedBody = flashcard.generatedBody ?? (flashcard.manualBody ? null : flashcard.body);
      
      let currentManualTitle = normalizeText(flashcard.manualTitle);
      let currentManualBody = normalizeText(flashcard.manualBody);
      
      let effectiveTitle = flashcard.title;
      let effectiveBody = flashcard.body;
      let modifiedTitle: string | null = null;
      let modifiedBody: string | null = null;
      let newProcessingStatus: FlashcardProcessingStatus = flashcard.processingStatus;

      if (input.action === FlashcardActionType.MODIFY_ACCEPT) {
        modifiedTitle = normalizeText(input.modifiedTitle);
        modifiedBody = input.modifiedBody ? normalizeMarkdownBody(input.modifiedBody) : null;

        if (!modifiedTitle || !modifiedBody) {
          throw new Error("Modify and accept requires both title and body");
        }

        // Only set manual if it's DIFFERENT from the AI baseline (if baseline exists)
        // If baseline doesn't exist (e.g. legacy), we always treat user input as manual if it differs from current.
        const baselineTitle = generatedTitle ?? flashcard.title;
        const baselineBody = generatedBody ?? flashcard.body;

        currentManualTitle = (modifiedTitle === baselineTitle) ? null : modifiedTitle;
        currentManualBody = (modifiedBody === baselineBody) ? null : modifiedBody;
        
        effectiveTitle = modifiedTitle;
        effectiveBody = modifiedBody;
        newProcessingStatus = FlashcardProcessingStatus.ACCEPTED;
      } else if (input.action === FlashcardActionType.ACCEPT) {
        effectiveTitle = currentManualTitle ?? flashcard.title;
        effectiveBody = currentManualBody ?? flashcard.body;
        newProcessingStatus = FlashcardProcessingStatus.ACCEPTED;
      } else if (input.action === FlashcardActionType.DECLINE) {
        effectiveTitle = currentManualTitle ?? flashcard.title;
        effectiveBody = currentManualBody ?? flashcard.body;
        newProcessingStatus = FlashcardProcessingStatus.DECLINED;
      } else {
        effectiveTitle = currentManualTitle ?? flashcard.title;
        effectiveBody = currentManualBody ?? flashcard.body;
      }

      const delta = flashcardActionDelta(input.action);
      const lastActionAt = new Date();

      await tx.flashcardAction.create({
        data: {
          id: randomUUID(),
          flashcardId: flashcard.id,
          action: input.action,
          annotation,
          previousTitle: flashcard.title,
          previousBody: flashcard.body,
          modifiedTitle,
          modifiedBody,
          createdAt: new Date(),
        },
      });

      const updatedFlashcard = await tx.flashcard.update({
        where: { id: flashcard.id },
        data: {
          title: effectiveTitle,
          body: effectiveBody,
          manualTitle: currentManualTitle,
          manualBody: currentManualBody,
          processingStatus: newProcessingStatus,
          reviewStatus: REVIEW_STATUS_BY_ACTION[input.action],
          userAnnotation: annotation,
          lastActionAt,
          feedbackConfidenceDelta: clamp(flashcard.feedbackConfidenceDelta + delta.confidence, -5, 5),
          feedbackWeightDelta: clamp(flashcard.feedbackWeightDelta + delta.weight, -5, 5),
          confidence: clampMetric(flashcard.confidence + delta.confidence),
          weight: clampMetric(flashcard.weight + delta.weight),
          iceScore: calculateKnowledgeIceScore({
            impact: flashcard.impact,
            confidence: flashcard.confidence + delta.confidence,
            weight: flashcard.weight + delta.weight,
          }),
          activityState:
            input.action === FlashcardActionType.DECLINE ||
            effectiveConfidence({
              confidence: flashcard.confidence + delta.confidence,
              feedbackConfidenceDelta: flashcard.feedbackConfidenceDelta + delta.confidence,
            }) <= 5
              ? FlashcardActivityState.ARCHIVED
              : FlashcardActivityState.ACTIVE,
          status:
            input.action === FlashcardActionType.DECLINE ||
            effectiveConfidence({
              confidence: flashcard.confidence + delta.confidence,
              feedbackConfidenceDelta: flashcard.feedbackConfidenceDelta + delta.confidence,
            }) <= 5
              ? FlashcardStatus.ARCHIVED
              : FlashcardStatus.ACTIVE,
        },
        include: FLASHCARD_INCLUDES,
      });

      await reconcilePendingTasksForFlashcards(tx, [flashcard.id]);

      return {
        companyId: flashcard.companyId,
        flashcard: updatedFlashcard,
      };
    }, {
      ...TRANSACTION_SETTINGS,
    }),
  );
}

export async function applyTaskFeedbackToFlashcards(checklistTaskId: string, action: "ACCEPT" | "DECLINE", annotation?: string | null) {
  return withSerializableRetry(() =>
    prisma.$transaction(async (tx) => {
      const item = await tx.checklistTask.findUnique({
        where: { id: checklistTaskId },
        select: { sourceFlashcardIds: true },
      });

      if (!item || item.sourceFlashcardIds.length === 0) {
        return;
      }

      const flashcards = await tx.flashcard.findMany({
        where: { id: { in: item.sourceFlashcardIds } },
      });

      const delta = action === "ACCEPT"
        ? { confidence: 2, weight: 2 }
        : { confidence: -3, weight: -2 };

      for (const flashcard of flashcards) {
        const nextFeedbackConfidenceDelta = clamp(flashcard.feedbackConfidenceDelta + delta.confidence, -5, 5);
        const nextFeedbackWeightDelta = clamp(flashcard.feedbackWeightDelta + delta.weight, -5, 5);
        const nextConfidence = clampMetric(flashcard.confidence + delta.confidence);
        const nextWeight = clampMetric(flashcard.weight + delta.weight);
        const nextStatus =
          action === "DECLINE" ||
          effectiveConfidence({
            confidence: nextConfidence,
            feedbackConfidenceDelta: nextFeedbackConfidenceDelta,
          }) <= 5
            ? FlashcardStatus.ARCHIVED
            : flashcard.status;

        await tx.flashcard.update({
          where: { id: flashcard.id },
          data: {
            feedbackConfidenceDelta: nextFeedbackConfidenceDelta,
            feedbackWeightDelta: nextFeedbackWeightDelta,
            confidence: nextConfidence,
            weight: nextWeight,
            iceScore: calculateKnowledgeIceScore({
              impact: flashcard.impact,
              confidence: nextConfidence,
              weight: nextWeight,
            }),
            userAnnotation: normalizeText(annotation) ?? flashcard.userAnnotation,
            status: nextStatus,
          },
        });
      }

      await reconcilePendingTasksForFlashcards(tx, item.sourceFlashcardIds);
    }, {
      ...TRANSACTION_SETTINGS,
    }),
  );
}

export async function listCompanyFlashcards(companyId: string) {
  return prisma.flashcard.findMany({
    where: {
      companyId,
      processingStatus: {
        in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED", "REVIEW"]
      },
      activityState: {
        in: ["ACTIVE", "STALE"]
      }
    },
    include: FLASHCARD_INCLUDES,
    orderBy: [
      { iceScore: "desc" },
      { confidenceScore: "desc" },
      { updatedAt: "desc" },
      { publicId: "asc" },
    ],
  });
}

function correctionNote(note: string | undefined) {
  return normalizeAnnotationText(note);
}

export async function listCompanyFlashcardCorrections(companyId: string) {
  return prisma.flashcardCorrection.findMany({
    where: { companyId },
    orderBy: [{ createdAt: "desc" }],
    take: 100,
  });
}

export async function recordFlashcardCorrection(input: FlashcardCorrectionInput) {
  const note = correctionNote(input.note);

  return withSerializableRetry(() =>
    prisma.$transaction(async (tx) => {
      let companyId = input.companyId ?? null;
      let flashcard = null as Awaited<ReturnType<typeof tx.flashcard.findUnique>> | null;

      if (input.flashcardId) {
        flashcard = await tx.flashcard.findUnique({
          where: { id: input.flashcardId },
          include: { sources: true },
        });

        if (!flashcard) {
          throw new Error("Flashcard not found");
        }

        companyId = flashcard.companyId;
      }

      if (!companyId) {
        throw new Error("companyId required");
      }

      if (input.correctionType === FlashcardCorrectionType.SUPPRESS_SOURCE && (!input.sourceType || !input.sourceId)) {
        throw new Error("Suppress source requires sourceType and sourceId");
      }

      const created = await tx.flashcardCorrection.create({
        data: {
          id: randomUUID(),
          companyId,
          flashcardId: input.flashcardId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          sourcePublicId: input.sourcePublicId,
          sourceName: normalizeText(input.sourceName),
          correctionType: input.correctionType,
          note,
        },
      });

      if (flashcard) {
        if (input.correctionType === FlashcardCorrectionType.HIDE || input.correctionType === FlashcardCorrectionType.MARK_WRONG) {
          await tx.flashcard.update({
            where: { id: flashcard.id },
            data: {
              status: FlashcardStatus.ARCHIVED,
              activityState: FlashcardActivityState.ARCHIVED,
              reviewStatus: FlashcardReviewStatus.DECLINED,
              userAnnotation: note ?? flashcard.userAnnotation,
              lastActionAt: new Date(),
            },
          });
          await reconcilePendingTasksForFlashcards(tx, [flashcard.id]);
        }

        if (input.correctionType === FlashcardCorrectionType.PIN) {
          await tx.flashcard.update({
            where: { id: flashcard.id },
            data: {
              status: FlashcardStatus.ACTIVE,
              activityState: FlashcardActivityState.ACTIVE,
              confidence: clampMetric(flashcard.confidence + 1),
              weight: clampMetric(flashcard.weight + 2),
              iceScore: calculateKnowledgeIceScore({
                impact: flashcard.impact,
                confidence: flashcard.confidence + 1,
                weight: flashcard.weight + 2,
              }),
              feedbackConfidenceDelta: clamp(flashcard.feedbackConfidenceDelta + 1, -5, 5),
              feedbackWeightDelta: clamp(flashcard.feedbackWeightDelta + 2, -5, 5),
              userAnnotation: note ?? flashcard.userAnnotation,
              lastActionAt: new Date(),
            },
          });
        }

        if (input.correctionType === FlashcardCorrectionType.REQUEST_REFRESH) {
          await tx.flashcard.update({
            where: { id: flashcard.id },
            data: {
              processingStatus: FlashcardProcessingStatus.REVIEW,
              reviewStatus: FlashcardReviewStatus.PENDING,
              status: FlashcardStatus.ACTIVE,
              activityState: FlashcardActivityState.ACTIVE,
              userAnnotation: note ?? flashcard.userAnnotation,
              lastActionAt: new Date(),
              lastCorrectionReconciledAt: null,
              lastRescoredAt: null,
            },
          });
        }
      }

      if (input.correctionType === FlashcardCorrectionType.SUPPRESS_SOURCE && input.sourceType && input.sourceId) {
        const impacted = await tx.flashcard.findMany({
          where: {
            companyId,
            sources: {
              some: {
                sourceType: input.sourceType,
                sourceId: input.sourceId,
              },
            },
          },
          select: { id: true },
        });

        if (impacted.length > 0) {
          await tx.flashcard.updateMany({
            where: { id: { in: impacted.map((item) => item.id) } },
            data: {
              status: FlashcardStatus.ARCHIVED,
              activityState: FlashcardActivityState.ARCHIVED,
              userAnnotation: note ?? `Suppressed source ${input.sourceName ?? input.sourceId}`,
              lastActionAt: new Date(),
            },
          });
          await reconcilePendingTasksForFlashcards(tx, impacted.map((item) => item.id));
        }
      }

      return { companyId, correction: created };
    }, {
      ...TRANSACTION_SETTINGS,
    }),
  ).then(async (result) => {
    if (
      input.correctionType === FlashcardCorrectionType.REQUEST_REFRESH ||
      input.correctionType === FlashcardCorrectionType.SUPPRESS_SOURCE
    ) {
      await escalateCompanyPipelineJob(prisma as any, result.companyId, "COMPANY_SYNTHESIS");
      await escalateCompanyPipelineJob(prisma as any, result.companyId, "FEEDBACK_RECONCILIATION");
      await escalateCompanyPipelineJob(prisma as any, result.companyId, "CARD_RESCORING");
    }

    return result;
  });
}
