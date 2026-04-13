import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeHashtagList } from "@/lib/hashtags";
import { nextSourcePublicId, TRANSACTION_SETTINGS } from "@/lib/source-public-ids";

/**
 * Liberated Source Library
 * No hardcoded entities. Purely Data-Driven.
 */

export async function listCompanySources(companyId: string, entityTag?: string) {
  return prisma.source.findMany({
    where: {
      companyId,
      ...(entityTag ? { entityTag } : {}),
    },
    orderBy: [{ publicId: "asc" }, { createdAt: "asc" }],
  });
}

export async function ensureUnifiedSources(companyId: string) {
  // Legacy backfill logic has been purged. 
  // All entities are now natively created as DataCards (Sources).
  return true;
}
