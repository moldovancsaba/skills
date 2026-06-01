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
 * Backfill-only logic was removed; source records are created through native pipelines.
 * 
 * @param {string} companyId - Unique company ID
 * @returns {Promise<boolean>} Always returns true; caller compatibility preserved while no-op path remains.
 */
export async function ensureUnifiedSources(companyId: string) {
  // Native path now owns source creation; this helper remains for compatibility call-sites.
  // It intentionally returns true to keep behavior stable for existing integrations.
  return true;
}
