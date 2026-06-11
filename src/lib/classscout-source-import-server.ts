import "server-only";

import {
  normalizeClassScoutManhattanSourceLeads,
  type ClassScoutManhattanSourceLead,
} from "@/lib/classscout-source-import";
import { createVisitorSourceDatacard } from "@/lib/visitor-source-graph";

export async function importClassScoutManhattanSourceDatacards(input: {
  companyId: string;
  visitorKey: string;
  destinationKey?: string;
  importBatchId?: string;
  leads: ClassScoutManhattanSourceLead[];
  dryRun?: boolean;
}) {
  const normalized = normalizeClassScoutManhattanSourceLeads(input.leads, input.importBatchId);
  if (!normalized.ok || input.dryRun) {
    return {
      ...normalized,
      dryRun: Boolean(input.dryRun),
      importedCount: 0,
      sources: [],
    };
  }

  // Reuse the existing visitor source datacard upsert path so retries are
  // idempotent by canonical URL and source graph observability stays centralized.
  const sources = [];
  for (const entry of normalized.normalized) {
    const source = await createVisitorSourceDatacard(
      input.companyId,
      input.visitorKey,
      entry.datacard,
      input.destinationKey,
    );
    sources.push(source);
  }

  return {
    ...normalized,
    dryRun: false,
    importedCount: sources.length,
    sources,
  };
}
