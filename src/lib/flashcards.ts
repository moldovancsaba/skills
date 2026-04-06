import {
  FlashcardActionType,
  FlashcardReviewStatus,
  FlashcardSourceRole,
  FlashcardStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  ensureSourcePublicIds,
  nextPublicId,
  PUBLIC_ID_SCOPES,
  TRANSACTION_SETTINGS,
  withSerializableRetry,
} from "@/lib/source-public-ids";
import {
  enrichCompetitorSeed,
  enrichProductSeed,
  shouldEnrichCompetitor,
  shouldEnrichProduct,
} from "@/lib/url-enrichment";

type FlashcardSourceKind =
  | "PRODUCT"
  | "CUSTOMER"
  | "COMPETITOR"
  | "AGENT_FOUND";

type ProductSource = {
  type: "PRODUCT";
  id: string;
  publicId: number | null;
  sourceName: string;
  knowledgeName: string;
  description: string | null;
  pricing: string | null;
  features: string[];
  urls: string[];
  createdAt: Date;
  updatedAt: Date;
};

type CustomerSource = {
  type: "CUSTOMER";
  id: string;
  publicId: number | null;
  sourceName: string;
  knowledgeName: string;
  email: string | null;
  segments: string[];
  painPoints: string[];
  channels: string[];
  lifetimeValue: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type CompetitorSource = {
  type: "COMPETITOR";
  id: string;
  publicId: number | null;
  sourceName: string;
  knowledgeName: string;
  urls: string[];
  pricing: string | null;
  strengths: string[];
  weaknesses: string[];
  positioning: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type SourceRecord = ProductSource | CustomerSource | CompetitorSource;

type FlashcardDraft = {
  title: string;
  body: string;
  confidence: number;
  impact: number;
  weight: number;
};

type FlashcardActionInput = {
  flashcardId: string;
  action: FlashcardActionType;
  annotation?: string;
  modifiedTitle?: string;
  modifiedBody?: string;
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
} satisfies Prisma.FlashcardInclude;

const REVIEW_STATUS_BY_ACTION: Record<FlashcardActionType, FlashcardReviewStatus> = {
  ACCEPT: FlashcardReviewStatus.ACCEPTED,
  DECLINE: FlashcardReviewStatus.DECLINED,
  MODIFY_ACCEPT: FlashcardReviewStatus.MODIFIED_ACCEPTED,
};

function sourceKey(sourceType: FlashcardSourceKind, sourceId: string) {
  return `${sourceType}:${sourceId}`;
}

function takeFirst(values: string[], count = 3) {
  return values.filter(Boolean).slice(0, count);
}

function buildSentence(label: string, values: string[]) {
  if (values.length === 0) {
    return null;
  }

  return `${label}: ${values.join(", ")}.`;
}

function normalizeText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function displaySourceName(value: string) {
  return value.replace(/[{}[\]]/g, "").trim();
}

function nonEmptyCount(values: Array<string | number | null | undefined | string[]>) {
  return values.reduce((count: number, value) => {
    if (Array.isArray(value)) {
      return count + (value.length > 0 ? 1 : 0);
    }

    if (typeof value === "number") {
      return count + 1;
    }

    return count + (value ? 1 : 0);
  }, 0);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function assertNever(value: never): never {
  throw new Error(`Unsupported source type: ${JSON.stringify(value)}`);
}

function sameDate(left: Date, right: Date) {
  return left.getTime() === right.getTime();
}

function buildProductFlashcard(source: ProductSource): FlashcardDraft {
  const bodyParts = [
    source.description?.trim() || null,
    source.pricing ? `Pricing: ${source.pricing}.` : null,
    buildSentence("Key features", takeFirst(source.features)),
    buildSentence("Known URLs", takeFirst(source.urls)),
  ].filter(Boolean);
  const completeness = nonEmptyCount([
    source.description,
    source.pricing,
    source.features,
    source.urls,
  ]);

  return {
    title: `Product knowledge: ${displaySourceName(source.knowledgeName)}`,
    body:
      bodyParts.join(" ") ||
      "No structured product summary is available yet. Add product details or a product URL for automatic enrichment.",
    confidence: clamp(56 + completeness * 7, 55, 88),
    impact: clamp(68 + completeness * 6, 65, 92),
    weight: clamp(60 + completeness * 5, 58, 85),
  };
}

function buildCustomerFlashcard(source: CustomerSource): FlashcardDraft {
  const bodyParts = [
    source.notes?.trim() || null,
    buildSentence("Segments", takeFirst(source.segments)),
    buildSentence("Pain points", takeFirst(source.painPoints)),
    buildSentence("Channels", takeFirst(source.channels)),
    source.lifetimeValue
      ? `Lifetime value: ${Math.round(source.lifetimeValue)}.`
      : null,
    source.email ? `Contact: ${source.email}.` : null,
  ].filter(Boolean);
  const completeness = nonEmptyCount([
    source.notes,
    source.segments,
    source.painPoints,
    source.channels,
    source.lifetimeValue,
    source.email,
  ]);

  return {
    title: `Customer knowledge: ${displaySourceName(source.knowledgeName)}`,
    body:
      bodyParts.join(" ") ||
      "No structured customer insight is available yet. Add notes, segments, pain points, or channels to improve this card.",
    confidence: clamp(58 + completeness * 6, 58, 90),
    impact: clamp(72 + completeness * 5, 70, 94),
    weight: clamp(70 + completeness * 4, 68, 92),
  };
}

function buildCompetitorFlashcard(source: CompetitorSource): FlashcardDraft {
  const bodyParts = [
    source.positioning?.trim() || null,
    source.pricing ? `Pricing: ${source.pricing}.` : null,
    buildSentence("Strengths", takeFirst(source.strengths)),
    buildSentence("Weaknesses", takeFirst(source.weaknesses)),
    buildSentence("Tracked URLs", takeFirst(source.urls)),
  ].filter(Boolean);
  const completeness = nonEmptyCount([
    source.positioning,
    source.pricing,
    source.strengths,
    source.weaknesses,
    source.urls,
  ]);

  return {
    title: `Competitor knowledge: ${displaySourceName(source.knowledgeName)}`,
    body:
      bodyParts.join(" ") ||
      "No structured competitor summary is available yet. Add competitor URLs or market notes for automatic enrichment.",
    confidence: clamp(54 + completeness * 6, 54, 86),
    impact: clamp(66 + completeness * 5, 64, 90),
    weight: clamp(64 + completeness * 5, 62, 89),
  };
}

export async function syncCompanyKnowledge(companyId: string) {
  await syncBootstrapFlashcards(companyId);
}

function buildFlashcardDraft(source: SourceRecord) {
  switch (source.type) {
    case "PRODUCT":
      return buildProductFlashcard(source);
    case "CUSTOMER":
      return buildCustomerFlashcard(source);
    case "COMPETITOR":
      return buildCompetitorFlashcard(source);
    default:
      return assertNever(source);
  }
}

function isPublishableSource(source: SourceRecord) {
  switch (source.type) {
    case "PRODUCT":
      return Boolean(
        normalizeText(source.description) ||
          normalizeText(source.pricing) ||
          source.features.length > 0,
      );
    case "CUSTOMER":
      return nonEmptyCount([
        source.notes,
        source.segments,
        source.painPoints,
        source.channels,
        source.lifetimeValue,
        source.email,
      ]) > 0;
    case "COMPETITOR":
      return Boolean(
        normalizeText(source.positioning) ||
          normalizeText(source.pricing) ||
          source.strengths.length > 0 ||
          source.weaknesses.length > 0,
      );
    default:
      return assertNever(source);
  }
}

function resolveDisplayContent(
  existing: {
    manualTitle: string | null;
    manualBody: string | null;
  },
  draft: FlashcardDraft,
) {
  // User-approved edits stay visible while the generated baseline keeps refreshing underneath.
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

function needsFlashcardUpdate(
  existing: {
    title: string;
    body: string;
    generatedTitle: string | null;
    generatedBody: string | null;
    manualTitle: string | null;
    manualBody: string | null;
    confidence: number;
    impact: number;
    weight: number;
    status: FlashcardStatus;
    refreshedAt: Date;
  },
  draft: FlashcardDraft,
  refreshedAt: Date,
) {
  const resolved = resolveDisplayContent(existing, draft);

  return (
    existing.title !== resolved.title ||
    existing.body !== resolved.body ||
    existing.generatedTitle !== resolved.generatedTitle ||
    existing.generatedBody !== resolved.generatedBody ||
    existing.manualTitle !== resolved.manualTitle ||
    existing.manualBody !== resolved.manualBody ||
    existing.confidence !== draft.confidence ||
    existing.impact !== draft.impact ||
    existing.weight !== draft.weight ||
    existing.status !== FlashcardStatus.ACTIVE ||
    !sameDate(existing.refreshedAt, refreshedAt)
  );
}

function needsSourceSnapshotUpdate(
  existing: {
    sourcePublicId: number | null;
    sourceName: string;
    relationRole: FlashcardSourceRole;
  },
  source: {
    publicId: number | null;
    sourceName: string;
  },
) {
  return (
    existing.sourcePublicId !== source.publicId ||
    existing.sourceName !== source.sourceName ||
    existing.relationRole !== FlashcardSourceRole.PRIMARY
  );
}

async function loadCompanySources(companyId: string) {
  const [products, customers, competitors] = await Promise.all([
    prisma.product.findMany({
      where: { companyId },
      orderBy: [{ publicId: "asc" }, { createdAt: "asc" }],
    }),
    prisma.customer.findMany({
      where: { companyId },
      orderBy: [{ publicId: "asc" }, { createdAt: "asc" }],
    }),
    prisma.competitor.findMany({
      where: { companyId },
      orderBy: [{ publicId: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const [derivedProducts, derivedCompetitors] = await Promise.all([
    Promise.all(
      products.map(async (product) => {
        const enriched = shouldEnrichProduct(product)
          ? await enrichProductSeed(product)
          : null;

        return {
          type: "PRODUCT",
          id: product.id,
          publicId: product.publicId,
          sourceName: product.name,
          knowledgeName: normalizeText(enriched?.name) ?? product.name,
          description: normalizeText(enriched?.description) ?? normalizeText(product.description),
          pricing: normalizeText(enriched?.pricing) ?? normalizeText(product.pricing),
          features: enriched?.features ?? product.features,
          urls: enriched?.urls ?? product.urls,
          createdAt: product.createdAt,
          updatedAt: product.updatedAt,
        } satisfies ProductSource;
      }),
    ),
    Promise.all(
      competitors.map(async (competitor) => {
        const enriched = shouldEnrichCompetitor(competitor)
          ? await enrichCompetitorSeed(competitor)
          : null;

        return {
          type: "COMPETITOR",
          id: competitor.id,
          publicId: competitor.publicId,
          sourceName: competitor.name,
          knowledgeName: normalizeText(enriched?.name) ?? competitor.name,
          urls: enriched?.urls ?? competitor.urls,
          pricing: normalizeText(enriched?.pricing) ?? normalizeText(competitor.pricing),
          strengths: enriched?.strengths ?? competitor.strengths,
          weaknesses: enriched?.weaknesses ?? competitor.weaknesses,
          positioning: normalizeText(enriched?.positioning) ?? normalizeText(competitor.positioning),
          createdAt: competitor.createdAt,
          updatedAt: competitor.updatedAt,
        } satisfies CompetitorSource;
      }),
    ),
  ]);

  return [
    ...derivedProducts,
    ...customers.map(
      (item) =>
        ({
          ...item,
          type: "CUSTOMER",
          sourceName: item.name,
          knowledgeName: item.name,
        }) satisfies CustomerSource,
    ),
    ...derivedCompetitors,
  ] satisfies SourceRecord[];
}

export async function syncBootstrapFlashcards(companyId: string) {
  await ensureSourcePublicIds(companyId);
  const sources = await loadCompanySources(companyId);

  return withSerializableRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const flashcards = await tx.flashcard.findMany({
          where: {
            companyId,
            createdBy: BOOTSTRAP_CREATED_BY,
          },
          include: {
            sources: true,
          },
        });

        const flashcardBySourceKey = new Map<
          string,
          (typeof flashcards)[number]
        >();

        for (const flashcard of flashcards) {
          for (const source of flashcard.sources) {
            flashcardBySourceKey.set(
              sourceKey(source.sourceType, source.sourceId),
              flashcard,
            );
          }
        }

        const activeSourceKeys = new Set<string>();

        for (const source of sources) {
          const key = sourceKey(source.type, source.id);
          const existing = flashcardBySourceKey.get(key);

          if (!isPublishableSource(source)) {
            if (existing && existing.status !== FlashcardStatus.ARCHIVED) {
              await tx.flashcard.update({
                where: { id: existing.id },
                data: { status: FlashcardStatus.ARCHIVED },
              });
            }
            continue;
          }

          activeSourceKeys.add(key);
          const draft = buildFlashcardDraft(source);
          const refreshedAt = source.updatedAt;

          if (existing) {
            const resolved = resolveDisplayContent(existing, draft);

            if (needsFlashcardUpdate(existing, draft, refreshedAt)) {
              await tx.flashcard.update({
                where: { id: existing.id },
                data: {
                  title: resolved.title,
                  body: resolved.body,
                  generatedTitle: resolved.generatedTitle,
                  generatedBody: resolved.generatedBody,
                  manualTitle: resolved.manualTitle,
                  manualBody: resolved.manualBody,
                  confidence: draft.confidence,
                  impact: draft.impact,
                  weight: draft.weight,
                  status: FlashcardStatus.ACTIVE,
                  refreshedAt,
                },
              });
            }

            const existingSource = existing.sources.find(
              (item) =>
                item.sourceType === source.type && item.sourceId === source.id,
            );

            if (existingSource) {
              if (needsSourceSnapshotUpdate(existingSource, source)) {
                await tx.flashcardSource.update({
                  where: {
                    flashcardId_sourceType_sourceId: {
                      flashcardId: existing.id,
                      sourceType: source.type,
                      sourceId: source.id,
                    },
                  },
                  data: {
                    sourcePublicId: source.publicId,
                    sourceName: source.sourceName,
                    relationRole: FlashcardSourceRole.PRIMARY,
                  },
                });
              }
            } else {
              await tx.flashcardSource.create({
                data: {
                  flashcardId: existing.id,
                  sourceType: source.type,
                  sourceId: source.id,
                  sourcePublicId: source.publicId,
                  sourceName: source.sourceName,
                  relationRole: FlashcardSourceRole.PRIMARY,
                },
              });
            }

            continue;
          }

          const publicId = await nextPublicId(tx, PUBLIC_ID_SCOPES.flashcard);

          await tx.flashcard.create({
            data: {
              publicId,
              companyId,
              title: draft.title,
              body: draft.body,
              generatedTitle: draft.title,
              generatedBody: draft.body,
              confidence: draft.confidence,
              impact: draft.impact,
              weight: draft.weight,
              status: FlashcardStatus.ACTIVE,
              createdBy: BOOTSTRAP_CREATED_BY,
              refreshedAt,
              sources: {
                create: {
                  sourceType: source.type,
                  sourceId: source.id,
                  sourcePublicId: source.publicId,
                  sourceName: source.sourceName,
                  relationRole: FlashcardSourceRole.PRIMARY,
                },
              },
            },
          });
        }

        for (const flashcard of flashcards) {
          const hasAnyLiveSource = flashcard.sources.some((source) =>
            activeSourceKeys.has(sourceKey(source.sourceType, source.sourceId)),
          );

          if (!hasAnyLiveSource && flashcard.status !== FlashcardStatus.ARCHIVED) {
            await tx.flashcard.update({
              where: { id: flashcard.id },
              data: { status: FlashcardStatus.ARCHIVED },
            });
          }
        }
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        ...TRANSACTION_SETTINGS,
      },
    ),
  );
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

      const lastActionAt = new Date();

      await tx.flashcardAction.create({
        data: {
          flashcardId: flashcard.id,
          action: input.action,
          annotation,
          previousTitle: flashcard.title,
          previousBody: flashcard.body,
          modifiedTitle,
          modifiedBody,
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
        },
        include: FLASHCARD_INCLUDES,
      });

      return {
        companyId: flashcard.companyId,
        flashcard: updatedFlashcard,
      };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      ...TRANSACTION_SETTINGS,
    }),
  );
}

export async function listCompanyFlashcards(companyId: string) {
  return prisma.flashcard.findMany({
    where: {
      companyId,
      status: FlashcardStatus.ACTIVE,
    },
    include: FLASHCARD_INCLUDES,
    orderBy: [{ publicId: "asc" }, { createdAt: "asc" }],
  });
}
