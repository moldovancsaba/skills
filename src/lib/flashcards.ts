import {
  FlashcardActionType,
  FlashcardCorrectionType,
  FlashcardKind,
  FlashcardReviewStatus,
  FlashcardSourceRole,
  FlashcardStatus,
  Prisma,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
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
import {
  enrichCompetitorSeed,
  enrichProductSeed,
  shouldEnrichCompetitor,
  shouldEnrichProduct,
} from "@/lib/url-enrichment";

type FlashcardSourceKind = "PRODUCT" | "CUSTOMER" | "COMPETITOR" | "FILE" | "AGENT_FOUND";

type BaseSourceRecord = {
  id: string;
  publicId: number | null;
  sourceName: string;
  knowledgeName: string;
  hashtags: string[];
  createdAt: Date;
  updatedAt: Date;
};

type ProductSource = BaseSourceRecord & {
  type: "PRODUCT";
  description: string | null;
  pricing: string | null;
  features: string[];
  urls: string[];
  watchedContent: Prisma.JsonValue | null;
};

type CustomerSource = BaseSourceRecord & {
  type: "CUSTOMER";
  email: string | null;
  segments: string[];
  painPoints: string[];
  channels: string[];
  lifetimeValue: number | null;
  notes: string | null;
};

type CompetitorSource = BaseSourceRecord & {
  type: "COMPETITOR";
  urls: string[];
  pricing: string | null;
  strengths: string[];
  weaknesses: string[];
  positioning: string | null;
  watchedContent: Prisma.JsonValue | null;
};

type FileSource = BaseSourceRecord & {
  type: "FILE";
  mimeType: string;
  sizeBytes: number;
  hashtags: string[];
  extractedText: string | null;
  watchedContent: Prisma.JsonValue | null;
};

type SourceRecord = ProductSource | CustomerSource | CompetitorSource | FileSource;

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
  refreshedAt: Date;
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

function makeDraft(source: SourceRecord, kind: FlashcardKind, title: string, body: string, confidence: number, impact: number, weight: number, evidence: Prisma.InputJsonValue | null, seed: string): FlashcardDraft {
  return {
    kind,
    fingerprint: buildFingerprint(source, kind, seed),
    title,
    body: sentenceize(body),
    confidence: clamp(Math.round(confidence), 1, 100),
    impact: clamp(Math.round(impact), 1, 100),
    weight: clamp(Math.round(weight), 1, 100),
    evidence,
    hashtags: stripSourceTypeHashtags(source.hashtags),
    source: {
      type: source.type,
      id: source.id,
      publicId: source.publicId,
      sourceName: source.sourceName,
    },
    refreshedAt: source.updatedAt,
  };
}

function buildProductDrafts(source: ProductSource, context: SourceRecord[]) {
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
      ),
    );
  });

  const competitor = context.find((item): item is CompetitorSource => item.type === "COMPETITOR" && item.id !== source.id && item.strengths.length > 0);
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
        ),
      );
    }
  }

  return drafts;
}

function buildCustomerDrafts(source: CustomerSource) {
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
      ),
    );
  }

  return drafts;
}

function buildCompetitorDrafts(source: CompetitorSource, context: SourceRecord[]) {
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
      ),
    );
  }

  const product = context.find((item): item is ProductSource => item.type === "PRODUCT" && item.features.length > 0);
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
        ),
      );
    }
  }

  return drafts;
}

function buildFileDrafts(source: FileSource) {
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
        ),
      );
    });
  }

  return drafts;
}

function isPublishableSource(source: SourceRecord) {
  switch (source.type) {
    case "PRODUCT":
      return Boolean(normalizeText(source.description) || normalizeText(source.pricing) || source.features.length > 0);
    case "CUSTOMER":
      return Boolean(normalizeText(source.notes) || source.segments.length > 0 || source.painPoints.length > 0 || source.channels.length > 0 || source.lifetimeValue || source.email);
    case "COMPETITOR":
      return Boolean(normalizeText(source.positioning) || normalizeText(source.pricing) || source.strengths.length > 0 || source.weaknesses.length > 0);
    case "FILE":
      return Boolean(source.extractedText || getFileSummary(source.watchedContent) || getAnalysisItems(source.watchedContent, "conclusions").length > 0);
    default:
      return assertNever(source);
  }
}

function buildFlashcardDrafts(source: SourceRecord, context: SourceRecord[]) {
  switch (source.type) {
    case "PRODUCT":
      return buildProductDrafts(source, context);
    case "CUSTOMER":
      return buildCustomerDrafts(source);
    case "COMPETITOR":
      return buildCompetitorDrafts(source, context);
    case "FILE":
      return buildFileDrafts(source);
    default:
      return assertNever(source);
  }
}

function resolveDisplayContent(existing: { manualTitle: string | null; manualBody: string | null }, draft: FlashcardDraft) {
  const manualTitle = normalizeText(existing.manualTitle);
  const manualBody = normalizeText(existing.manualBody);

  return {
    generatedTitle: draft.title,
    generatedBody: draft.body,
    manualTitle,
    manualBody,
    title: manualTitle ?? draft.title,
    body: manualBody ?? draft.body,
  };
}

function applyFeedbackDeltas(draft: FlashcardDraft, existing?: { feedbackWeightDelta: number; feedbackConfidenceDelta: number }) {
  const weightDelta = existing?.feedbackWeightDelta ?? 0;
  const confidenceDelta = existing?.feedbackConfidenceDelta ?? 0;

  return {
    confidence: clamp(draft.confidence + confidenceDelta, 1, 100),
    weight: clamp(draft.weight + weightDelta, 1, 100),
  };
}

function effectiveConfidence(value: { confidence: number; feedbackConfidenceDelta?: number | null }) {
  return clamp(value.confidence + (value.feedbackConfidenceDelta ?? 0), 1, 100);
}

function effectiveWeight(value: { weight: number; feedbackWeightDelta?: number | null }) {
  return clamp(value.weight + (value.feedbackWeightDelta ?? 0), 1, 100);
}

function shouldPublishDraft(draft: FlashcardDraft, existing?: { feedbackConfidenceDelta: number }) {
  const confidenceDelta = existing?.feedbackConfidenceDelta ?? 0;
  return draft.confidence + confidenceDelta > 50;
}

async function reconcilePendingTasksForFlashcards(tx: Prisma.TransactionClient, flashcardIds: string[]) {
  if (flashcardIds.length === 0) {
    return;
  }

  const affected = await tx.nBAItem.findMany({
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
        effectiveConfidence(flashcard) > 50
      );
    });

    if (eligibleSources.length === 0) {
      await tx.nBAItem.update({
        where: { id: item.id },
        data: {
          status: "DECLINED",
          userAnnotation: "Auto-declined because supporting flashcards fell below quality threshold.",
        },
      });
      continue;
    }

    if (eligibleSources.length !== item.sourceFlashcardIds.length) {
      await tx.nBAItem.update({
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
    existing.status !== FlashcardStatus.ACTIVE ||
    existing.appVersion !== APP_VERSION ||
    existing.brainVersion !== BRAIN_VERSION ||
    existing.promptVersion !== FLASHCARD_PROMPT_VERSION ||
    !sameDate(existing.generatedAt, refreshedAt) ||
    !sameDate(existing.refreshedAt, refreshedAt)
  );
}

function needsSourceSnapshotUpdate(existing: { sourcePublicId: number | null; sourceName: string; relationRole: FlashcardSourceRole }, source: { publicId: number | null; sourceName: string }) {
  return (
    existing.sourcePublicId !== source.publicId ||
    existing.sourceName !== source.sourceName ||
    existing.relationRole !== FlashcardSourceRole.PRIMARY
  );
}

async function mapSeries<T, R>(items: T[], mapper: (item: T) => Promise<R>) {
  const results: R[] = [];
  for (const item of items) {
    results.push(await mapper(item));
  }
  return results;
}

async function loadCompanySources(companyId: string) {
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
  const [products, customers, competitors, uploadedFiles] = await Promise.all([
    prisma.product.findMany({ where: { companyId }, orderBy: [{ publicId: "asc" }, { createdAt: "asc" }] }),
    prisma.customer.findMany({ where: { companyId }, orderBy: [{ publicId: "asc" }, { createdAt: "asc" }] }),
    prisma.competitor.findMany({ where: { companyId }, orderBy: [{ publicId: "asc" }, { createdAt: "asc" }] }),
    prisma.uploadedSourceFile.findMany({ where: { companyId }, orderBy: [{ publicId: "asc" }, { createdAt: "asc" }] }),
  ]);

  const [derivedProducts, derivedCompetitors, derivedFiles] = await Promise.all([
    mapSeries(products, async (product) => {
      const enriched = shouldEnrichProduct(product) ? await enrichProductSeed(product) : null;
      return {
        type: "PRODUCT",
        id: product.id,
        publicId: product.publicId,
        sourceName: product.name,
        knowledgeName: normalizeText(enriched?.name) ?? product.name,
        hashtags: normalizeSourceHashtags(product.hashtags, "product"),
        description: normalizeText(enriched?.description) ?? normalizeText(product.description),
        pricing: normalizeText(enriched?.pricing) ?? normalizeText(product.pricing),
        features: enriched?.features ?? product.features,
        urls: enriched?.urls ?? product.urls,
        watchedContent: (enriched?.watchedContent as Prisma.JsonValue | undefined) ?? null,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      } satisfies ProductSource;
    }),
    mapSeries(competitors, async (competitor) => {
      const enriched = shouldEnrichCompetitor(competitor) ? await enrichCompetitorSeed(competitor) : null;
      return {
        type: "COMPETITOR",
        id: competitor.id,
        publicId: competitor.publicId,
        sourceName: competitor.name,
        knowledgeName: normalizeText(enriched?.name) ?? competitor.name,
        hashtags: normalizeSourceHashtags(competitor.hashtags, "competitor"),
        urls: enriched?.urls ?? competitor.urls,
        pricing: normalizeText(enriched?.pricing) ?? normalizeText(competitor.pricing),
        strengths: enriched?.strengths ?? competitor.strengths,
        weaknesses: enriched?.weaknesses ?? competitor.weaknesses,
        positioning: normalizeText(enriched?.positioning) ?? normalizeText(competitor.positioning),
        watchedContent: (enriched?.watchedContent as Prisma.JsonValue | undefined) ?? competitor.watchedContent,
        createdAt: competitor.createdAt,
        updatedAt: competitor.updatedAt,
      } satisfies CompetitorSource;
    }),
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
        extractedText: enriched.extractedText,
        watchedContent: (enriched.watchedContent as Prisma.JsonValue | undefined) ?? null,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      } satisfies FileSource;
    }),
  ]);

  return [
    ...derivedProducts,
    ...customers.map((item) => ({
      ...item,
      type: "CUSTOMER",
      sourceName: item.name,
      knowledgeName: item.name,
      hashtags: normalizeSourceHashtags(item.hashtags, "customer"),
    }) satisfies CustomerSource),
    ...derivedCompetitors,
    ...derivedFiles,
  ].filter((source) => !suppressedSourceKeys.has(sourceKey(source.type, source.id))) satisfies SourceRecord[];
}

export async function syncCompanyKnowledge(companyId: string) {
  await syncBootstrapFlashcards(companyId);
}

export async function syncBootstrapFlashcards(companyId: string) {
  await ensureSourcePublicIds(companyId);
  const sources = await loadCompanySources(companyId);
  const candidateDrafts = sources
    .filter(isPublishableSource)
    .flatMap((source) => buildFlashcardDrafts(source, sources));

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
                impact: draft.impact,
                weight: adjusted.weight,
                hashtags: draft.hashtags,
                evidence: draft.evidence ?? undefined,
                status: FlashcardStatus.ACTIVE,
                appVersion: APP_VERSION,
                brainVersion: BRAIN_VERSION,
                promptVersion: FLASHCARD_PROMPT_VERSION,
                generatedAt: draft.refreshedAt,
                refreshedAt: draft.refreshedAt,
              },
            });
          }

          const existingSource = existing.sources.find((item) => item.sourceType === draft.source.type && item.sourceId === draft.source.id);
          if (existingSource) {
            if (needsSourceSnapshotUpdate(existingSource, draft.source)) {
              await tx.flashcardSource.update({
                where: {
                  flashcardId_sourceType_sourceId: {
                    flashcardId: existing.id,
                    sourceType: draft.source.type,
                    sourceId: draft.source.id,
                  },
                },
                data: {
                  sourcePublicId: draft.source.publicId,
                  sourceName: draft.source.sourceName,
                  relationRole: FlashcardSourceRole.PRIMARY,
                  updatedAt: new Date(),
                },
              });
            }
          } else {
            await tx.flashcardSource.create({
              data: {
                flashcardId: existing.id,
                sourceType: draft.source.type,
                sourceId: draft.source.id,
                sourcePublicId: draft.source.publicId,
                sourceName: draft.source.sourceName,
                relationRole: FlashcardSourceRole.PRIMARY,
              },
            });
          }

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
          impact: draft.impact,
          weight: adjusted.weight,
          hashtags: draft.hashtags,
          evidence: draft.evidence ?? undefined,
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
        flashcardSourcesToCreate.push({
          id: randomUUID(),
          flashcardId,
          sourceType: draft.source.type,
          sourceId: draft.source.id,
          sourcePublicId: draft.source.publicId,
          sourceName: draft.source.sourceName,
          relationRole: FlashcardSourceRole.PRIMARY,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
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
      return { confidence: 5, weight: 6 };
    case FlashcardActionType.DECLINE:
      return { confidence: -18, weight: -14 };
    case FlashcardActionType.MODIFY_ACCEPT:
      return { confidence: 8, weight: 8 };
    default:
      return assertNever(action);
  }
}

export async function recordFlashcardAction(input: FlashcardActionInput) {
  const annotation = normalizeText(input.annotation);

  return withSerializableRetry(() =>
    prisma.$transaction(async (tx) => {
      const flashcard = await tx.flashcard.findUnique({
        where: { id: input.flashcardId },
        include: FLASHCARD_INCLUDES,
      });

      if (!flashcard) {
        throw new Error("Flashcard not found");
      }

      if (flashcard.status !== FlashcardStatus.ACTIVE) {
        throw new Error("Only active flashcards can be reviewed");
      }

      if (input.action === FlashcardActionType.DECLINE && !annotation) {
        throw new Error("Decline requires a comment");
      }

      const generatedTitle = flashcard.generatedTitle ?? flashcard.title;
      const generatedBody = flashcard.generatedBody ?? flashcard.body;
      let manualTitle = normalizeText(flashcard.manualTitle);
      let manualBody = normalizeText(flashcard.manualBody);
      let effectiveTitle = flashcard.title;
      let effectiveBody = flashcard.body;
      let modifiedTitle: string | null = null;
      let modifiedBody: string | null = null;

      if (input.action === FlashcardActionType.MODIFY_ACCEPT) {
        modifiedTitle = normalizeText(input.modifiedTitle);
        modifiedBody = normalizeText(input.modifiedBody);

        if (!modifiedTitle || !modifiedBody) {
          throw new Error("Modify and accept requires both title and body");
        }

        manualTitle = modifiedTitle === generatedTitle ? null : modifiedTitle;
        manualBody = modifiedBody === generatedBody ? null : modifiedBody;
        effectiveTitle = manualTitle ?? generatedTitle;
        effectiveBody = manualBody ?? generatedBody;
      } else {
        effectiveTitle = manualTitle ?? generatedTitle;
        effectiveBody = manualBody ?? generatedBody;
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
          manualTitle,
          manualBody,
          reviewStatus: REVIEW_STATUS_BY_ACTION[input.action],
          userAnnotation: annotation,
          lastActionAt,
          feedbackConfidenceDelta: clamp(flashcard.feedbackConfidenceDelta + delta.confidence, -40, 40),
          feedbackWeightDelta: clamp(flashcard.feedbackWeightDelta + delta.weight, -40, 40),
          confidence: clamp(flashcard.confidence + delta.confidence, 1, 100),
          weight: clamp(flashcard.weight + delta.weight, 1, 100),
          status:
            input.action === FlashcardActionType.DECLINE ||
            effectiveConfidence({
              confidence: flashcard.confidence + delta.confidence,
              feedbackConfidenceDelta: flashcard.feedbackConfidenceDelta + delta.confidence,
            }) <= 50
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

export async function applyTaskFeedbackToFlashcards(nbaItemId: string, action: "ACCEPT" | "DECLINE", annotation?: string | null) {
  return withSerializableRetry(() =>
    prisma.$transaction(async (tx) => {
      const item = await tx.nBAItem.findUnique({
        where: { id: nbaItemId },
        select: { sourceFlashcardIds: true },
      });

      if (!item || item.sourceFlashcardIds.length === 0) {
        return;
      }

      const flashcards = await tx.flashcard.findMany({
        where: { id: { in: item.sourceFlashcardIds } },
      });

      const delta = action === "ACCEPT"
        ? { confidence: 8, weight: 10 }
        : { confidence: -22, weight: -18 };

      for (const flashcard of flashcards) {
        const nextFeedbackConfidenceDelta = clamp(flashcard.feedbackConfidenceDelta + delta.confidence, -50, 50);
        const nextFeedbackWeightDelta = clamp(flashcard.feedbackWeightDelta + delta.weight, -50, 50);
        const nextConfidence = clamp(flashcard.confidence + delta.confidence, 1, 100);
        const nextWeight = clamp(flashcard.weight + delta.weight, 1, 100);
        const nextStatus =
          action === "DECLINE" ||
          effectiveConfidence({
            confidence: nextConfidence,
            feedbackConfidenceDelta: nextFeedbackConfidenceDelta,
          }) <= 50
            ? FlashcardStatus.ARCHIVED
            : flashcard.status;

        await tx.flashcard.update({
          where: { id: flashcard.id },
          data: {
            feedbackConfidenceDelta: nextFeedbackConfidenceDelta,
            feedbackWeightDelta: nextFeedbackWeightDelta,
            confidence: nextConfidence,
            weight: nextWeight,
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
      status: FlashcardStatus.ACTIVE,
      reviewStatus: {
        not: FlashcardReviewStatus.DECLINED,
      },
      confidence: {
        gt: 50,
      },
    },
    include: FLASHCARD_INCLUDES,
    orderBy: [{ weight: "desc" }, { confidence: "desc" }, { publicId: "asc" }, { createdAt: "asc" }],
  });
}

function correctionNote(note: string | undefined) {
  return normalizeText(note);
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
              confidence: clamp(flashcard.confidence + 10, 1, 100),
              weight: clamp(flashcard.weight + 18, 1, 100),
              feedbackConfidenceDelta: clamp(flashcard.feedbackConfidenceDelta + 10, -50, 50),
              feedbackWeightDelta: clamp(flashcard.feedbackWeightDelta + 18, -50, 50),
              userAnnotation: note ?? flashcard.userAnnotation,
              lastActionAt: new Date(),
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
  );
}
