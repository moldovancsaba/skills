import {
  FlashcardSourceRole,
  FlashcardStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  ensureSourcePublicIds,
  nextPublicId,
  PUBLIC_ID_SCOPES,
  TransactionClient,
  withSerializableRetry,
} from "@/lib/source-public-ids";

type FlashcardSourceKind =
  | "PRODUCT"
  | "CUSTOMER"
  | "COMPETITOR"
  | "AGENT_FOUND";

type ProductSource = {
  type: "PRODUCT";
  id: string;
  publicId: number | null;
  name: string;
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
  name: string;
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
  name: string;
  urls: string[];
  pricing: string | null;
  strengths: string[];
  weaknesses: string[];
  positioning: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type SourceRecord = ProductSource | CustomerSource | CompetitorSource;

const BOOTSTRAP_CREATED_BY = "bootstrap-source";

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

function buildProductFlashcard(source: ProductSource) {
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
    title: `Product knowledge: ${source.name}`,
    body:
      bodyParts.join(" ") ||
      "This product has been added as a source and is ready for deeper enrichment.",
    confidence: clamp(56 + completeness * 7, 55, 88),
    impact: clamp(68 + completeness * 6, 65, 92),
    weight: clamp(60 + completeness * 5, 58, 85),
  };
}

function buildCustomerFlashcard(source: CustomerSource) {
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
    title: `Customer knowledge: ${source.name}`,
    body:
      bodyParts.join(" ") ||
      "This customer record has been added as a source and is ready for deeper enrichment.",
    confidence: clamp(58 + completeness * 6, 58, 90),
    impact: clamp(72 + completeness * 5, 70, 94),
    weight: clamp(70 + completeness * 4, 68, 92),
  };
}

function buildCompetitorFlashcard(source: CompetitorSource) {
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
    title: `Competitor knowledge: ${source.name}`,
    body:
      bodyParts.join(" ") ||
      "This competitor record has been added as a source and is ready for deeper enrichment.",
    confidence: clamp(54 + completeness * 6, 54, 86),
    impact: clamp(66 + completeness * 5, 64, 90),
    weight: clamp(64 + completeness * 5, 62, 89),
  };
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

function needsFlashcardUpdate(
  existing: {
    title: string;
    body: string;
    confidence: number;
    impact: number;
    weight: number;
    status: FlashcardStatus;
    refreshedAt: Date;
  },
  draft: {
    title: string;
    body: string;
    confidence: number;
    impact: number;
    weight: number;
  },
  refreshedAt: Date,
) {
  return (
    existing.title !== draft.title ||
    existing.body !== draft.body ||
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
    name: string;
  },
) {
  return (
    existing.sourcePublicId !== source.publicId ||
    existing.sourceName !== source.name ||
    existing.relationRole !== FlashcardSourceRole.PRIMARY
  );
}

async function loadCompanySources(
  tx: TransactionClient,
  companyId: string,
) {
  const [products, customers, competitors] = await Promise.all([
    tx.product.findMany({
      where: { companyId },
      orderBy: [{ publicId: "asc" }, { createdAt: "asc" }],
    }),
    tx.customer.findMany({
      where: { companyId },
      orderBy: [{ publicId: "asc" }, { createdAt: "asc" }],
    }),
    tx.competitor.findMany({
      where: { companyId },
      orderBy: [{ publicId: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  return [
    ...products.map(
      (item) =>
        ({
          ...item,
          type: "PRODUCT",
        }) satisfies ProductSource,
    ),
    ...customers.map(
      (item) =>
        ({
          ...item,
          type: "CUSTOMER",
        }) satisfies CustomerSource,
    ),
    ...competitors.map(
      (item) =>
        ({
          ...item,
          type: "COMPETITOR",
        }) satisfies CompetitorSource,
    ),
  ] satisfies SourceRecord[];
}

export async function syncBootstrapFlashcards(companyId: string) {
  await ensureSourcePublicIds(companyId);

  return withSerializableRetry(() =>
    prisma.$transaction(async (tx) => {
      const [sources, flashcards] = await Promise.all([
        loadCompanySources(tx, companyId),
        tx.flashcard.findMany({
          where: {
            companyId,
            createdBy: BOOTSTRAP_CREATED_BY,
          },
          include: {
            sources: true,
          },
        }),
      ]);

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
        activeSourceKeys.add(key);
        const draft = buildFlashcardDraft(source);
        const refreshedAt = source.updatedAt;
        const existing = flashcardBySourceKey.get(key);

        if (existing) {
          if (needsFlashcardUpdate(existing, draft, refreshedAt)) {
            await tx.flashcard.update({
              where: { id: existing.id },
              data: {
                title: draft.title,
                body: draft.body,
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
                  sourceName: source.name,
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
                sourceName: source.name,
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
                sourceName: source.name,
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
    }),
  );
}

export async function listCompanyFlashcards(companyId: string) {
  await syncBootstrapFlashcards(companyId);

  return prisma.flashcard.findMany({
    where: {
      companyId,
      status: FlashcardStatus.ACTIVE,
    },
    include: {
      sources: {
        orderBy: [{ sourcePublicId: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: [{ publicId: "asc" }, { createdAt: "asc" }],
  });
}
