/**
 * checklist ID ORCHESTRATOR
 * v0.11.4-STABLE
 * 
 * Logic for managing sequential, human-readable Public IDs across all DataCards.
 * Implements transaction-safe reservation and backfill orchestration for Sources and Tasks.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";

const SOURCE_PUBLIC_ID_SCOPE = "source";
const FLASHCARD_PUBLIC_ID_SCOPE = "flashcard";
const checklist_PUBLIC_ID_SCOPE = "checklist";
const MAX_RETRIES = 3;
const TRANSACTION_MAX_WAIT_MS = 10_000;
const TRANSACTION_TIMEOUT_MS = 120_000;

export const PUBLIC_ID_SCOPES = {
  source: SOURCE_PUBLIC_ID_SCOPE,
  flashcard: FLASHCARD_PUBLIC_ID_SCOPE,
  checklist: checklist_PUBLIC_ID_SCOPE,
} as const;

type SourceKind = "source" | "file";

type MissingSource = {
  id: string;
  createdAt: Date;
  kind: SourceKind;
};

type MissingchecklistItem = {
  id: string;
  createdAt: Date;
};

export type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

const KIND_ORDER: Record<SourceKind, number> = {
  source: 0,
  file: 1,
};

function isRetryableTransactionError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034"
  );
}

/**
 * Executes an operation with serializable-fault retry logic.
 * Primarily used to handle Prisma P2034 (Transaction isolation) errors.
 * 
 * @param {Function} operation - The async closure to execute
 * @param {number} attempt - Current retry attempt
 * @returns {Promise<any>} Operation result
 */
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

/**
 * Reserves a block of sequential IDs for a specific scope in the database.
 * 
 * @param {TransactionClient} tx - Active database transaction
 * @param {string} scope - Counter scope (e.g. "source", "flashcard")
 * @param {number} count - Number of IDs to reserve
 * @returns {Promise<number[]>} Array of reserved IDs
 */
export async function reservePublicIds(
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
      updatedAt: new Date(),
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
  const fileWhere = companyId
    ? { companyId, publicId: null }
    : { publicId: null };

  const [sources, uploadedFiles] = await Promise.all([
    tx.source.findMany({
      where: companyId ? { companyId, publicId: null } : { publicId: null },
      select: { id: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    tx.uploadedSourceFile.findMany({
      where: fileWhere,
      select: { id: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);

  return [
    ...sources.map((item) => ({ ...item, kind: "source" as const })),
    ...uploadedFiles.map((item) => ({ ...item, kind: "file" as const })),
  ].sort(sortMissingSources);
}

async function assignSourcePublicId(
  tx: TransactionClient,
  source: MissingSource,
  publicId: number,
) {
  switch (source.kind) {
    case "source":
      return tx.source.updateMany({
        where: {
          id: source.id,
          publicId: null,
        },
        data: { publicId },
      });
    case "file":
      return tx.uploadedSourceFile.updateMany({
        where: {
          id: source.id,
          publicId: null,
        },
        data: { publicId },
      });
  }
}

/**
 * Scans for Sources without public IDs and assigns them in order of creation.
 * Uses serializable-retry wrapper to ensure data-integrity under concurrency.
 * 
 * @param {string} [companyId] - Optional company filter
 * @returns {Promise<number>} Count of assigned IDs
 */
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
        maxWait: TRANSACTION_MAX_WAIT_MS,
        timeout: TRANSACTION_TIMEOUT_MS,
      },
    ),
  );
}

export async function nextSourcePublicId(tx: TransactionClient) {
  const [publicId] = await reservePublicIds(tx, SOURCE_PUBLIC_ID_SCOPE, 1);
  return publicId;
}

async function readMissingchecklistItems(
  tx: TransactionClient,
  companyId?: string,
): Promise<MissingchecklistItem[]> {
  const where = companyId ? { companyId, publicId: null } : { publicId: null };

  return tx.nBAItem.findMany({
    where,
    select: { id: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

/**
 * Scans for TaskCards (NBAItems) without public IDs and assigns them in order of creation.
 * 
 * @param {string} [companyId] - Optional company filter
 * @returns {Promise<number>} Count of assigned IDs
 */
export async function ensurechecklistPublicIds(companyId?: string) {
  return withSerializableRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const missingItems = await readMissingchecklistItems(tx, companyId);
        if (missingItems.length === 0) {
          return 0;
        }

        const reservedPublicIds = await reservePublicIds(
          tx,
          checklist_PUBLIC_ID_SCOPE,
          missingItems.length,
        );

        let assignedCount = 0;

        for (const [index, item] of missingItems.entries()) {
          const result = await tx.nBAItem.updateMany({
            where: {
              id: item.id,
              publicId: null,
            },
            data: { publicId: reservedPublicIds[index], updatedAt: new Date() },
          });
          assignedCount += result.count;
        }

        return assignedCount;
      },
      {
        maxWait: TRANSACTION_MAX_WAIT_MS,
        timeout: TRANSACTION_TIMEOUT_MS,
      },
    ),
  );
}

export async function nextchecklistPublicId(tx: TransactionClient) {
  const [publicId] = await reservePublicIds(tx, checklist_PUBLIC_ID_SCOPE, 1);
  return publicId;
}

export async function nextPublicId(
  tx: TransactionClient,
  scope: string,
) {
  const [publicId] = await reservePublicIds(tx, scope, 1);
  return publicId;
}

export const TRANSACTION_SETTINGS = {
  maxWait: TRANSACTION_MAX_WAIT_MS,
  timeout: TRANSACTION_TIMEOUT_MS,
} as const;
