const crypto = require("crypto");
const { harvestResearch } = require("./research");
const { fetchUrlContent } = require("./fetcher");
const { mineOpportunitycards, SALES_DEPARTMENT_KEY } = require("../../src/lib/opportunitycards-runtime");

const MAX_QUERIES = 3;
const MAX_RESULTS = 6;
const MAX_FETCHES = 4;

function normalizeText(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function buildSearchQueries(company, flashcards = []) {
  const industry = normalizeText(company?.industry || "");
  const targetMarket = normalizeText(company?.targetMarket || "");
  const companyName = normalizeText(company?.name || "company");
  const flashcardTerms = flashcards
    .flatMap((flashcard) => [flashcard.title, ...(Array.isArray(flashcard.hashtags) ? flashcard.hashtags : [])])
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .slice(0, 6);

  const seedTerms = [...new Set([targetMarket, industry, ...flashcardTerms].filter(Boolean))].slice(0, 3);
  const primary = seedTerms[0] || industry || targetMarket || "business software";
  const secondary = seedTerms[1] || targetMarket || industry || "platform";
  const tertiary = seedTerms[2] || "companies";

  return [
    `${primary} companies ${secondary}`.trim(),
    `${primary} providers ${tertiary}`.trim(),
    `${companyName} partner ecosystem ${primary}`.trim(),
  ].filter(Boolean).slice(0, MAX_QUERIES);
}

function buildCanonicalContentHash(content) {
  return crypto.createHash("sha1").update(String(content || "")).digest("hex");
}

async function persistHarvestedSources(prisma, company, results) {
  let created = 0;
  let updated = 0;

  for (const result of results) {
    const snippet = normalizeText(result.snippet || "");
    const fetched = result.fetched || null;
    const title = normalizeText(result.title || fetched?.title || "Lead research");
    const pageContent = normalizeText(fetched?.content || "");
    const content = [title, snippet, pageContent ? `Page Evidence: ${pageContent}` : null, `Source: ${result.url}`]
      .filter(Boolean)
      .join("\n\n");
    const canonicalContentHash = buildCanonicalContentHash(content);
    const existing = await prisma.source.findFirst({
      where: {
        companyId: company.id,
        OR: [
          { provenance: result.url },
          { canonicalContentHash },
        ],
      },
      select: { id: true },
    });

    const metadata = {
      type: "OPPORTUNITY_SEARCH_HARVEST",
      origin: "worker-opportunity-search",
      query: result.query,
      harvestedAt: new Date().toISOString(),
      url: result.url,
      title,
      searchSnippet: snippet,
      fetchStatus: fetched?.status ?? null,
    };

    if (existing) {
      await prisma.source.update({
        where: { id: existing.id },
        data: {
          content,
          canonicalContent: content,
          canonicalContentHash,
          provenance: result.url,
          entityTag: title,
          metadata,
          sourceType: "WEB",
          intelligenceType: "COMPETITOR",
          departmentKey: SALES_DEPARTMENT_KEY,
          processingStatus: "DRAFT",
        },
      });
      updated += 1;
      continue;
    }

    await prisma.source.create({
      data: {
        companyId: company.id,
        content,
        canonicalContent: content,
        canonicalContentHash,
        provenance: result.url,
        entityTag: title,
        metadata,
        sourceType: "WEB",
        intelligenceType: "COMPETITOR",
        departmentKey: SALES_DEPARTMENT_KEY,
        processingStatus: "DRAFT",
        confidence: 6,
        confidenceScore: 6,
        impact: 6,
        weight: 5,
        freshnessWindowDays: 21,
        hashtags: ["sales", "opportunity-search"],
      },
    });
    created += 1;
  }

  return { created, updated };
}

async function searchInternetOpportunitycards(prisma, company, executionOptions = {}) {
  const flashcards = await prisma.flashcard.findMany({
    where: {
      companyId: company.id,
      activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] },
      OR: [
        { departmentKey: SALES_DEPARTMENT_KEY },
        { intelligenceType: "COMPETITOR" },
      ],
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 8,
    select: {
      title: true,
      hashtags: true,
    },
  });

  const queries = buildSearchQueries(company, flashcards);
  if (queries.length === 0) {
    return { queries: 0, harvested: 0, createdSources: 0, updatedSources: 0, createdOpportunitycards: 0, updatedOpportunitycards: 0 };
  }

  const harvested = (await harvestResearch(queries))
    .map((result, index) => ({ ...result, query: queries[Math.min(index, queries.length - 1)] }))
    .slice(0, MAX_RESULTS);

  const fetchBudget = Number.isFinite(executionOptions?.batchLimitOverride)
    ? Math.max(1, Math.min(MAX_FETCHES, Number(executionOptions.batchLimitOverride) * 2))
    : MAX_FETCHES;

  const fetchedResults = [];
  for (const result of harvested.slice(0, fetchBudget)) {
    const fetched = await fetchUrlContent(result.url);
    fetchedResults.push({ ...result, fetched });
  }

  const persisted = await persistHarvestedSources(prisma, company, fetchedResults);
  const mined = await mineOpportunitycards(prisma, company.id);

  return {
    queries: queries.length,
    harvested: fetchedResults.length,
    createdSources: persisted.created,
    updatedSources: persisted.updated,
    createdOpportunitycards: mined.created || 0,
    updatedOpportunitycards: mined.updated || 0,
  };
}

module.exports = {
  searchInternetOpportunitycards,
};
