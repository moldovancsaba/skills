import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";

const SOURCE_PUBLIC_ID_SCOPE = "source";
const FLASHCARD_PUBLIC_ID_SCOPE = "flashcard";
const MAX_RETRIES = 3;

export const PUBLIC_ID_SCOPES = {
  source: SOURCE_PUBLIC_ID_SCOPE,
  flashcard: FLASHCARD_PUBLIC_ID_SCOPE,
} as const;

type SourceKind = "product" | "customer" | "competitor";

type MissingSource = {
  id: string;
  createdAt: Date;
  kind: SourceKind;
};

export type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

const KIND_ORDER: Record<SourceKind, number> = {
  product: 0,
  customer: 1,
  competitor: 2,
};

function isRetryableTransactionError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034"
  );
}

export async function withSerializableRetry<T>(
  operation: () => Promise<T>,
  attempt = 0,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isRetryableTransactionError(error) || attempt >= MAX_RETRIES) {
      throw error;
    }

    return withSerializableRetry(operation, attempt + 1);
  }
}

async function reservePublicIds(
  tx: TransactionClient,
  scope: string,
  count: number,
): Promise<number[]> {
  if (count <= 0) {
    return [];
  }

  await tx.publicIdCounter.upsert({
    where: { scope },
    update: {},
    create: {
      scope,
      value: 0,
    },
  });

  const counter = await tx.publicIdCounter.update({
    where: { scope },
    data: {
      value: {
        increment: count,
      },
    },
  });

  const firstPublicId = counter.value - count + 1;

  return Array.from({ length: count }, (_, index) => firstPublicId + index);
}

function sortMissingSources(a: MissingSource, b: MissingSource) {
  const createdAtDiff = a.createdAt.getTime() - b.createdAt.getTime();
  if (createdAtDiff !== 0) {
    return createdAtDiff;
  }

  const kindDiff = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  if (kindDiff !== 0) {
    return kindDiff;
  }

  return a.id.localeCompare(b.id);
}

async function readMissingSources(
  tx: TransactionClient,
  companyId?: string,
): Promise<MissingSource[]> {
  const productWhere = companyId
    ? { companyId, publicId: null }
    : { publicId: null };
  const customerWhere = companyId
    ? { companyId, publicId: null }
    : { publicId: null };
  const competitorWhere = companyId
    ? { companyId, publicId: null }
    : { publicId: null };

  const [products, customers, competitors] = await Promise.all([
    tx.product.findMany({
      where: productWhere,
      select: { id: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    tx.customer.findMany({
      where: customerWhere,
      select: { id: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    tx.competitor.findMany({
      where: competitorWhere,
      select: { id: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);

  return [
    ...products.map((item) => ({ ...item, kind: "product" as const })),
    ...customers.map((item) => ({ ...item, kind: "customer" as const })),
    ...competitors.map((item) => ({ ...item, kind: "competitor" as const })),
  ].sort(sortMissingSources);
}

async function assignSourcePublicId(
  tx: TransactionClient,
  source: MissingSource,
  publicId: number,
) {
  switch (source.kind) {
    case "product":
      return tx.product.updateMany({
        where: {
          id: source.id,
          publicId: null,
        },
        data: { publicId },
      });
    case "customer":
      return tx.customer.updateMany({
        where: {
          id: source.id,
          publicId: null,
        },
        data: { publicId },
      });
    case "competitor":
      return tx.competitor.updateMany({
        where: {
          id: source.id,
          publicId: null,
        },
        data: { publicId },
      });
  }
}

export async function ensureSourcePublicIds(companyId?: string) {
  return withSerializableRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const missingSources = await readMissingSources(tx, companyId);
        if (missingSources.length === 0) {
          return 0;
        }

        const reservedPublicIds = await reservePublicIds(
          tx,
          SOURCE_PUBLIC_ID_SCOPE,
          missingSources.length,
        );

        let assignedCount = 0;

        for (const [index, source] of missingSources.entries()) {
          const result = await assignSourcePublicId(
            tx,
            source,
            reservedPublicIds[index],
          );
          assignedCount += result.count;
        }

        return assignedCount;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    ),
  );
}

export async function nextSourcePublicId(tx: TransactionClient) {
  const [publicId] = await reservePublicIds(tx, SOURCE_PUBLIC_ID_SCOPE, 1);
  return publicId;
}

export async function nextPublicId(
  tx: TransactionClient,
  scope: string,
) {
  const [publicId] = await reservePublicIds(tx, scope, 1);
  return publicId;
}
