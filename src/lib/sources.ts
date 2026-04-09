import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeHashtagList } from "@/lib/hashtags";
import { nextSourcePublicId, TRANSACTION_SETTINGS } from "@/lib/source-public-ids";
import { prepareRawSourceInput } from "@/lib/url-enrichment";

type LegacyRecord = {
  id: string;
  companyId: string;
  publicId: number | null;
  hashtags: string[];
  entityTag: string | null;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
  rawContent: string;
  originKey: string;
};

function compactLines(values: Array<string | null | undefined>) {
  return values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
}

function block(label: string, values: Array<string | null | undefined>) {
  const lines = compactLines(values);
  if (lines.length === 0) return null;
  return `${label}:\n${lines.join("\n")}`;
}

function listBlock(label: string, values: string[] | null | undefined) {
  const items = (values ?? []).map((value) => value.trim()).filter(Boolean);
  if (items.length === 0) return null;
  return `${label}:\n${items.map((item) => `- ${item}`).join("\n")}`;
}

function legacyProductRecord(product: any): LegacyRecord {
  const raw = prepareRawSourceInput(product.name ?? "", product.urls ?? []);
  return {
    id: product.id,
    companyId: product.companyId,
    publicId: product.publicId ?? null,
    hashtags: normalizeHashtagList(product.hashtags),
    entityTag: product.entityTag ?? null,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    originKey: `legacy:product:${product.id}`,
    metadata: {
      legacyType: "product",
      urls: raw.urls,
      description: product.description ?? null,
      pricing: product.pricing ?? null,
      features: product.features ?? [],
    },
    rawContent: compactLines([
      raw.name,
      block("Context", [
        product.description,
        product.pricing ? `Pricing: ${product.pricing}` : null,
      ]),
      listBlock("Signals", product.features),
      listBlock("URLs", raw.urls),
    ]).join("\n\n"),
  };
}

function legacyCustomerRecord(customer: any): LegacyRecord {
  return {
    id: customer.id,
    companyId: customer.companyId,
    publicId: customer.publicId ?? null,
    hashtags: normalizeHashtagList(customer.hashtags),
    entityTag: customer.entityTag ?? null,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
    originKey: `legacy:customer:${customer.id}`,
    metadata: {
      legacyType: "customer",
      email: customer.email ?? null,
      segments: customer.segments ?? [],
      painPoints: customer.painPoints ?? [],
      channels: customer.channels ?? [],
      lifetimeValue: customer.lifetimeValue ?? null,
      notes: customer.notes ?? null,
    },
    rawContent: compactLines([
      customer.name,
      block("Context", [
        customer.email ? `Email: ${customer.email}` : null,
        customer.lifetimeValue != null ? `Lifetime value: ${customer.lifetimeValue}` : null,
        customer.notes,
      ]),
      listBlock("Segments", customer.segments),
      listBlock("Pain points", customer.painPoints),
      listBlock("Channels", customer.channels),
    ]).join("\n\n"),
  };
}

function legacyCompetitorRecord(competitor: any): LegacyRecord {
  const raw = prepareRawSourceInput(competitor.name ?? "", competitor.urls ?? []);
  return {
    id: competitor.id,
    companyId: competitor.companyId,
    publicId: competitor.publicId ?? null,
    hashtags: normalizeHashtagList(competitor.hashtags),
    entityTag: competitor.entityTag ?? null,
    createdAt: competitor.createdAt,
    updatedAt: competitor.updatedAt,
    originKey: `legacy:competitor:${competitor.id}`,
    metadata: {
      legacyType: "competitor",
      urls: raw.urls,
      pricing: competitor.pricing ?? null,
      strengths: competitor.strengths ?? [],
      weaknesses: competitor.weaknesses ?? [],
      positioning: competitor.positioning ?? null,
      watchedContent: competitor.watchedContent ?? null,
    },
    rawContent: compactLines([
      raw.name,
      block("Context", [
        competitor.positioning,
        competitor.pricing ? `Pricing: ${competitor.pricing}` : null,
      ]),
      listBlock("Strengths", competitor.strengths),
      listBlock("Weaknesses", competitor.weaknesses),
      listBlock("URLs", raw.urls),
    ]).join("\n\n"),
  };
}

async function listLegacyRecords(companyId: string) {
  const [products, customers, competitors] = await Promise.all([
    prisma.product.findMany({ where: { companyId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.customer.findMany({ where: { companyId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.competitor.findMany({ where: { companyId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
  ]);

  return [
    ...products.map(legacyProductRecord),
    ...customers.map(legacyCustomerRecord),
    ...competitors.map(legacyCompetitorRecord),
  ].sort((left, right) => {
    const byDate = left.createdAt.getTime() - right.createdAt.getTime();
    if (byDate !== 0) return byDate;
    return left.originKey.localeCompare(right.originKey);
  });
}

export async function backfillLegacySources(companyId: string) {
  const legacyRecords = await listLegacyRecords(companyId);
  if (legacyRecords.length === 0) return 0;

  const existing = await prisma.source.findMany({
    where: {
      companyId,
      legacyOriginKey: { in: legacyRecords.map((record) => record.originKey) },
    },
    select: { legacyOriginKey: true },
  });
  const existingKeys = new Set(existing.map((record) => record.legacyOriginKey).filter(Boolean));
  const missing = legacyRecords.filter((record) => !existingKeys.has(record.originKey));
  if (missing.length === 0) return 0;

  await prisma.$transaction(async (tx) => {
    for (const record of missing) {
      const publicId = record.publicId ?? await nextSourcePublicId(tx);
      await tx.source.create({
        data: {
          companyId,
          publicId,
          content: record.rawContent || "(empty source)",
          hashtags: record.hashtags,
          entityTag: record.entityTag,
          metadata: record.metadata as Prisma.InputJsonObject,
          legacyOriginKey: record.originKey,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        },
      });
    }
  }, TRANSACTION_SETTINGS);

  return missing.length;
}

export async function ensureUnifiedSources(companyId: string) {
  await backfillLegacySources(companyId);
}
