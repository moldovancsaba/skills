import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeHashtagList } from "@/lib/hashtags";
import { nextSourcePublicId, TRANSACTION_SETTINGS } from "@/lib/source-public-ids";

/**
 * checklist SOURCE LIBRARY
 *
 * Source and datacard management helpers for multi-tenant intelligence.
 */

/**
 * Retrieves a list of sources for a specific company, optionally filtered by entity tag.
 * 
 * @param {string} companyId - Unique company ID
 * @param {string} [entityTag] - Optional tag to filter sources
 * @returns {Promise<object[]>} List of source records
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

/**
 * Orchestrates unified source management for a company.
 * Legacy backfill logic has been removed from this path.
 * 
 * @param {string} companyId - Unique company ID
 * @returns {Promise<boolean>} Always returns true as all sources are now native DataCards
 */
export async function ensureUnifiedSources(companyId: string) {
  // Legacy backfill logic has been purged. 
  // All entities are now natively created as DataCards (Sources).
  return true;
}
