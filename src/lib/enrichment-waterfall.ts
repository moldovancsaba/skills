import { prisma } from "@/lib/db";

export type EnrichmentProviderDefinition = {
  providerKey: string;
  label: string;
  entityTypes: string[];
  description: string;
};

export const ENRICHMENT_PROVIDER_DEFINITIONS: EnrichmentProviderDefinition[] = [
  {
    providerKey: "WEBSITE_INSIGHTS",
    label: "Website Insights",
    entityTypes: ["PRODUCT", "COMPETITOR", "SOURCE"],
    description: "Primary website fetch, extraction, and insight derivation.",
  },
  {
    providerKey: "NEWS_SIGNALS",
    label: "News Signals",
    entityTypes: ["PRODUCT", "COMPETITOR"],
    description: "Public news lookups for current external signal and context expansion.",
  },
  {
    providerKey: "WEB_SEARCH",
    label: "Web Search",
    entityTypes: ["PRODUCT", "COMPETITOR", "SOURCE"],
    description: "Search-result signal collection when direct page evidence is sparse.",
  },
  {
    providerKey: "STOCK_SIGNAL",
    label: "Stock Signal",
    entityTypes: ["COMPETITOR"],
    description: "Ticker and public market signal lookup when available.",
  },
  {
    providerKey: "FILE_ANALYSIS",
    label: "File Analysis",
    entityTypes: ["FILE"],
    description: "Structured file extraction and conversion into usable evidence.",
  },
];

const DEFAULT_POLICIES = [
  { entityType: "PRODUCT", providerKey: "WEBSITE_INSIGHTS", priority: 10, name: "Product Website Primary" },
  { entityType: "PRODUCT", providerKey: "NEWS_SIGNALS", priority: 20, name: "Product News Fallback" },
  { entityType: "PRODUCT", providerKey: "WEB_SEARCH", priority: 30, name: "Product Search Fallback" },
  { entityType: "COMPETITOR", providerKey: "WEBSITE_INSIGHTS", priority: 10, name: "Competitor Website Primary" },
  { entityType: "COMPETITOR", providerKey: "NEWS_SIGNALS", priority: 20, name: "Competitor News Fallback" },
  { entityType: "COMPETITOR", providerKey: "WEB_SEARCH", priority: 30, name: "Competitor Search Fallback" },
  { entityType: "COMPETITOR", providerKey: "STOCK_SIGNAL", priority: 40, name: "Competitor Stock Signal" },
  { entityType: "FILE", providerKey: "FILE_ANALYSIS", priority: 10, name: "File Analysis Primary" },
];

export async function ensureDefaultEnrichmentPolicies(companyId: string) {
  const existing = await prisma.enrichmentWaterfallPolicy.count({ where: { companyId } });
  if (existing > 0) return;

  await prisma.enrichmentWaterfallPolicy.createMany({
    data: DEFAULT_POLICIES.map((policy) => ({
      companyId,
      name: policy.name,
      entityType: policy.entityType,
      providerKey: policy.providerKey,
      priority: policy.priority,
      strategy: "FALLBACK",
      enabled: true,
    })),
  });
}

export async function listCompanyEnrichmentPolicies(companyId: string) {
  await ensureDefaultEnrichmentPolicies(companyId);
  return prisma.enrichmentWaterfallPolicy.findMany({
    where: { companyId },
    orderBy: [{ entityType: "asc" }, { priority: "asc" }],
  });
}
