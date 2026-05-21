const crypto = require("crypto");
const { harvestResearch } = require("./research");
const { fetchUrlContent } = require("./fetcher");
const { mineOpportunitycards, SALES_DEPARTMENT_KEY } = require("../../src/lib/opportunitycards-runtime");

const MAX_QUERIES = 4;
const MAX_RESULTS = 6;
const MAX_FETCHES = 4;
const SEARCH_STATE_PREFIX = "opportunity_search_state:";
const FEEDBACK_TERM_STOPWORDS = new Set([
  "and",
  "company",
  "companies",
  "for",
  "from",
  "guide",
  "into",
  "lead",
  "leads",
  "list",
  "market",
  "platform",
  "providers",
  "revops",
  "sales",
  "software",
  "team",
  "teams",
  "the",
  "with",
]);
const SOURCE_HOST_DENYLIST = new Set([
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "linkedin.cn",
  "reddit.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "youtube.com",
]);
const FILE_EXTENSION_RE = /\.(?:pdf|docx?|xlsx?|pptx?)(?:$|[?#])/i;
const NON_COMPANY_RESULT_RE = /\b(?:job|jobs|career|careers|salary|resume|curriculum vitae|cv|profile|people|person)\b/i;
const GENERIC_RESULT_RE = /\b(?:top\s+\d+|best\s+\d+|list of|directory|roundup|comparison|compare|alternatives|competitors?|market map|template|guide|playbook|blog)\b/i;
const COMPANY_HINT_RE = /\b(?:company|platform|software|vendor|provider|agency|studio|labs|systems|technologies|solutions|partners?|services)\b/i;

function normalizeText(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function normalizeQueryTerm(value) {
  return normalizeText(String(value || "").replace(/^#/, "").replace(/\s+#/g, " "));
}

function normalizeDomain(value) {
  const input = normalizeText(value);
  if (!input) return null;
  try {
    const url = new URL(input.startsWith("http") ? input : `https://${input}`);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function normalizeLocation(value) {
  if (typeof value === "string") return normalizeText(value);
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeText(entry))
      .filter(Boolean)
      .join(" ");
  }
  if (value && typeof value === "object") {
    return normalizeText(value.location || value.region || value.country || value.market || "");
  }
  return "";
}

function collectFlashcardTerms(flashcards = []) {
  return flashcards
    .flatMap((flashcard) => [flashcard.title, ...(Array.isArray(flashcard.hashtags) ? flashcard.hashtags : [])])
    .map((value) => normalizeText(String(value || "").replace(/^#/, "")))
    .filter(Boolean)
    .slice(0, 8);
}

function opportunitySearchStateKey(companyId) {
  return `${SEARCH_STATE_PREFIX}${companyId}`;
}

function normalizeSearchState(value) {
  const rawVersion = Number(value?.version || 1);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      version: 2,
      totalRuns: 0,
      lastQueries: [],
      queryStats: {},
      termScores: {},
      domainScores: {},
      updatedAt: null,
    };
  }
  const rawQueryStats = value.queryStats && typeof value.queryStats === "object" && !Array.isArray(value.queryStats) ? value.queryStats : {};
  const queryStats = Object.fromEntries(
    Object.entries(rawQueryStats).map(([query, stats]) => {
      const existing = stats && typeof stats === "object" && !Array.isArray(stats) ? stats : {};
      const migratedCandidateCount = Number(existing.candidateCount || 0) + (rawVersion < 2 ? Number(existing.accepted || 0) : 0);
      return [query, {
        ...existing,
        accepted: rawVersion < 2 ? 0 : Number(existing.accepted || 0),
        declined: Number(existing.declined || 0),
        candidateCount: migratedCandidateCount,
      }];
    }),
  );
  return {
    version: 2,
    totalRuns: Number(value.totalRuns || 0),
    lastQueries: Array.isArray(value.lastQueries) ? value.lastQueries.filter((entry) => typeof entry === "string") : [],
    queryStats,
    termScores: value.termScores && typeof value.termScores === "object" && !Array.isArray(value.termScores) ? value.termScores : {},
    domainScores: value.domainScores && typeof value.domainScores === "object" && !Array.isArray(value.domainScores) ? value.domainScores : {},
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
  };
}

async function readOpportunitySearchState(prisma, companyId) {
  const record = await prisma.globalSetting.findUnique({
    where: { key: opportunitySearchStateKey(companyId) },
    select: { value: true },
  });
  return normalizeSearchState(record?.value);
}

async function writeOpportunitySearchState(prisma, companyId, state) {
  const nextValue = {
    ...state,
    updatedAt: new Date().toISOString(),
  };
  await prisma.globalSetting.upsert({
    where: { key: opportunitySearchStateKey(companyId) },
    create: {
      key: opportunitySearchStateKey(companyId),
      value: nextValue,
    },
    update: {
      value: nextValue,
    },
  });
  return nextValue;
}

function topScoredKeys(scoreMap, limit = 4) {
  return Object.entries(scoreMap || {})
    .filter(([key, score]) => typeof key === "string" && key && Number(score) > 0)
    .sort((left, right) => Number(right[1]) - Number(left[1]))
    .slice(0, limit)
    .map(([key]) => key);
}

function clampScore(value, min = -8, max = 24) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function incrementCounter(map, key, amount = 1) {
  if (!key) return;
  map[key] = Number(map[key] || 0) + amount;
}

function extractFeedbackTerms(values = []) {
  return Array.from(
    new Set(
      values
        .flatMap((value) => normalizeText(value || "").toLowerCase().split(/[^a-z0-9]+/))
        .map((term) => term.trim())
        .filter((term) => term.length >= 4 && !/^\d+$/.test(term))
        .filter((term) => !GENERIC_RESULT_RE.test(term))
        .filter((term) => !FEEDBACK_TERM_STOPWORDS.has(term)),
    ),
  ).slice(0, 8);
}

function extractTitleTerms(results = []) {
  return results
    .flatMap((result) => normalizeText(result?.title || "").split(/\s+/))
    .map((term) => normalizeText(String(term || "").replace(/^#/, "")))
    .filter((term) => term && term.length >= 4 && !/^\d+$/.test(term))
    .filter((term) => !GENERIC_RESULT_RE.test(term))
    .slice(0, 24);
}

function buildSearchQueries(company, flashcards = [], searchState = null) {
  const industry = normalizeText(company?.industry || "");
  const normalizedIndustry = normalizeQueryTerm(company?.industry || "");
  const targetMarket = normalizeQueryTerm(company?.targetMarket || "");
  const companyName = normalizeText(company?.name || "company");
  const productCategories = Array.isArray(company?.productCategories)
    ? company.productCategories.map((value) => normalizeQueryTerm(value)).filter(Boolean)
    : [];
  const geography = normalizeLocation(company?.demographics);
  const flashcardTerms = collectFlashcardTerms(flashcards);
  const learnedTerms = topScoredKeys(searchState?.termScores || {}, 4);
  const bestHistoricalQueries = Object.entries(searchState?.queryStats || {})
    .filter(([query, stats]) => typeof query === "string" && query && stats && typeof stats === "object")
    .sort((left, right) => {
      const leftStats = left[1];
      const rightStats = right[1];
      const leftScore = Number(leftStats.accepted || 0) * 6
        + Number(leftStats.createdOpportunitycards || 0) * 3
        + Number(leftStats.createdSources || 0)
        + Number(leftStats.candidateCount || 0)
        - Number(leftStats.declined || 0) * 7;
      const rightScore = Number(rightStats.accepted || 0) * 6
        + Number(rightStats.createdOpportunitycards || 0) * 3
        + Number(rightStats.createdSources || 0)
        + Number(rightStats.candidateCount || 0)
        - Number(rightStats.declined || 0) * 7;
      return rightScore - leftScore;
    })
    .slice(0, 2)
    .map(([query]) => query);

  const primary = targetMarket || learnedTerms[0] || flashcardTerms[0] || normalizedIndustry || "business software";
  const productTerm = productCategories[0] || learnedTerms[1] || flashcardTerms[1] || "platform";
  const geographyTerm = geography || flashcardTerms.find((term) => /\b(?:global|europe|emea|apac|latam|north america|south america|usa|us|uk)\b/i.test(term)) || "";
  const secondary = normalizedIndustry || productCategories[1] || learnedTerms[2] || flashcardTerms[2] || "companies";
  const learnedVariant = learnedTerms[0]
    ? [learnedTerms[0], "companies", targetMarket || productTerm, geographyTerm].filter(Boolean).join(" ")
    : null;

  return Array.from(
    new Set(
      [
        [primary, productTerm, "companies", geographyTerm].filter(Boolean).join(" "),
        [secondary, "providers", targetMarket || productTerm, geographyTerm].filter(Boolean).join(" "),
        [companyName, "partner ecosystem", productTerm || primary, geographyTerm].filter(Boolean).join(" "),
        ...bestHistoricalQueries,
        learnedVariant,
      ].filter(Boolean),
    ),
  ).slice(0, MAX_QUERIES);
}

function buildCanonicalContentHash(content) {
  return crypto.createHash("sha1").update(String(content || "")).digest("hex");
}

function isAllowedCompanyCandidate(result, company) {
  const url = normalizeText(result?.url || "");
  if (!url || !url.startsWith("http")) return false;
  if (FILE_EXTENSION_RE.test(url)) return false;

  const domain = normalizeDomain(url);
  if (!domain) return false;

  const ownDomain = normalizeDomain(company?.website || "");
  if (ownDomain && domain === ownDomain) return false;
  if (SOURCE_HOST_DENYLIST.has(domain)) return false;

  const combinedText = normalizeText([result?.title, result?.snippet].filter(Boolean).join(" "));
  if (NON_COMPANY_RESULT_RE.test(combinedText)) return false;
  if (GENERIC_RESULT_RE.test(combinedText) && !COMPANY_HINT_RE.test(combinedText)) return false;

  const title = normalizeText(result?.title || "");
  const titleWords = title.split(/\s+/).filter(Boolean);
  if (titleWords.length > 10 && !COMPANY_HINT_RE.test(title)) return false;

  return true;
}

function filterCandidateResults(results, company) {
  const accepted = [];
  for (const result of results) {
    if (!isAllowedCompanyCandidate(result, company)) continue;
    accepted.push({
      ...result,
      searchDomain: normalizeDomain(result.url),
    });
    if (accepted.length >= MAX_RESULTS) break;
  }
  return accepted;
}

async function persistHarvestedSources(prisma, company, results) {
  let created = 0;
  let updated = 0;
  const createdByQuery = {};
  const updatedByQuery = {};

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
      searchDomain: result.searchDomain || normalizeDomain(result.url),
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
      incrementCounter(updatedByQuery, normalizeText(result.query || ""), 1);
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
    incrementCounter(createdByQuery, normalizeText(result.query || ""), 1);
  }

  return { created, updated, createdByQuery, updatedByQuery };
}

async function recordOpportunitySearchOutcome(prisma, company, input) {
  const state = await readOpportunitySearchState(prisma, company.id);
  const nextState = {
    ...state,
    totalRuns: state.totalRuns + 1,
    lastQueries: input.queries.slice(0, MAX_QUERIES),
    queryStats: { ...state.queryStats },
    termScores: { ...state.termScores },
    domainScores: { ...state.domainScores },
  };

  const candidateCountByQuery = new Map();
  for (const result of input.candidates || []) {
    const query = normalizeText(result?.query || "");
    if (!query) continue;
    candidateCountByQuery.set(query, (candidateCountByQuery.get(query) || 0) + 1);
  }

  for (const query of input.queries) {
    const existing = nextState.queryStats[query] && typeof nextState.queryStats[query] === "object"
      ? nextState.queryStats[query]
      : {};
    nextState.queryStats[query] = {
      runs: Number(existing.runs || 0) + 1,
      accepted: Number(existing.accepted || 0),
      declined: Number(existing.declined || 0),
      candidateCount: Number(existing.candidateCount || 0) + Number(candidateCountByQuery.get(query) || 0),
      createdSources: Number(existing.createdSources || 0) + Number(input.createdSourcesByQuery?.[query] || 0),
      createdOpportunitycards: Number(existing.createdOpportunitycards || 0) + Number(input.createdOpportunitycardsByQuery?.[query] || 0),
      lastRunAt: new Date().toISOString(),
    };
  }

  for (const term of extractTitleTerms(input.candidates || [])) {
    nextState.termScores[term] = Number(nextState.termScores[term] || 0) + 1;
  }

  for (const result of input.candidates || []) {
    const domain = normalizeDomain(result?.url || "");
    if (!domain) continue;
    nextState.domainScores[domain] = Number(nextState.domainScores[domain] || 0) + 1;
  }

  return writeOpportunitySearchState(prisma, company.id, nextState);
}

function applyOpportunitySearchFeedback(state, input) {
  const nextState = {
    ...state,
    queryStats: { ...state.queryStats },
    termScores: { ...state.termScores },
    domainScores: { ...state.domainScores },
  };
  const query = normalizeText(input?.query || "");
  const domain = normalizeDomain(input?.domain || "");
  const action = normalizeText(input?.action || "")?.toUpperCase();
  const isAccepted = action === "ACCEPT";
  const isDeclined = action === "DECLINE";
  if (!isAccepted && !isDeclined) {
    return nextState;
  }

  const delta = isAccepted ? 2 : -3;
  const terms = extractFeedbackTerms(input?.terms || []);

  if (query) {
    const existing = nextState.queryStats[query] && typeof nextState.queryStats[query] === "object"
      ? nextState.queryStats[query]
      : {};
    nextState.queryStats[query] = {
      runs: Number(existing.runs || 0),
      accepted: Number(existing.accepted || 0) + (isAccepted ? 1 : 0),
      declined: Number(existing.declined || 0) + (isDeclined ? 1 : 0),
      candidateCount: Number(existing.candidateCount || 0),
      createdSources: Number(existing.createdSources || 0),
      createdOpportunitycards: Number(existing.createdOpportunitycards || 0),
      lastRunAt: existing.lastRunAt || null,
      lastFeedbackAt: new Date().toISOString(),
    };
  }

  if (domain) {
    nextState.domainScores[domain] = clampScore(Number(nextState.domainScores[domain] || 0) + delta);
  }

  for (const term of terms) {
    nextState.termScores[term] = clampScore(Number(nextState.termScores[term] || 0) + delta);
  }

  return nextState;
}

async function recordOpportunitySearchFeedback(prisma, companyId, input) {
  const state = await readOpportunitySearchState(prisma, companyId);
  const nextState = applyOpportunitySearchFeedback(state, input);
  return writeOpportunitySearchState(prisma, companyId, nextState);
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

  const searchState = await readOpportunitySearchState(prisma, company.id);
  const queries = buildSearchQueries(company, flashcards, searchState);
  if (queries.length === 0) {
    return { queries: 0, candidates: 0, harvested: 0, createdSources: 0, updatedSources: 0, createdOpportunitycards: 0, updatedOpportunitycards: 0 };
  }

  const harvested = (await harvestResearch(queries)).slice(0, MAX_RESULTS * 2);
  const candidates = filterCandidateResults(harvested, company);

  const fetchBudget = Number.isFinite(executionOptions?.batchLimitOverride)
    ? Math.max(1, Math.min(MAX_FETCHES, Number(executionOptions.batchLimitOverride) * 2))
    : MAX_FETCHES;

  const fetchedResults = [];
  for (const result of candidates.slice(0, fetchBudget)) {
    const fetched = await fetchUrlContent(result.url);
    fetchedResults.push({ ...result, fetched });
  }

  const persisted = await persistHarvestedSources(prisma, company, fetchedResults);
  const mined = await mineOpportunitycards(prisma, company.id);
  await recordOpportunitySearchOutcome(prisma, company, {
    queries,
    candidates: fetchedResults,
    createdSourcesByQuery: persisted.createdByQuery,
    createdOpportunitycardsByQuery: mined.createdByQuery || {},
  });

  return {
    queries: queries.length,
    candidates: candidates.length,
    harvested: fetchedResults.length,
    createdSources: persisted.created,
    updatedSources: persisted.updated,
    createdOpportunitycards: mined.created || 0,
    updatedOpportunitycards: mined.updated || 0,
  };
}

module.exports = {
  applyOpportunitySearchFeedback,
  buildSearchQueries,
  filterCandidateResults,
  isAllowedCompanyCandidate,
  normalizeDomain,
  normalizeSearchState,
  recordOpportunitySearchFeedback,
  recordOpportunitySearchOutcome,
  readOpportunitySearchState,
  searchInternetOpportunitycards,
};
