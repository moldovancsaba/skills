const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

function buildChecklistEnvCandidates() {
  const candidates = [];
  if (process.env.CHECKLIST_ENV_PATH) {
    candidates.push(process.env.CHECKLIST_ENV_PATH);
  }

  const repoRoot = path.join(__dirname, "..");
  candidates.push(path.join(repoRoot, ".env"));

  return [...new Set(candidates.map((candidate) => path.resolve(candidate)))];
}

for (const envPath of buildChecklistEnvCandidates()) {
  require("dotenv").config({ path: envPath, override: false });
}

function envFlag(value, fallback = false) {
  if (value == null || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

const PORT = Number(process.env.PORT || "10005");
const OLLAMA_HOST = process.env.OLLAMA_HOST || process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma4:latest";
const POLL_INTERVAL = Math.max(Number(process.env.POLL_INTERVAL || "300000"), 30_000);
const ENRICHMENT_INTERVAL = 15 * 60 * 1000; // 15 minutes
const ENRICHMENT_BATCH_SIZE = 5;
const LOCAL_SYNC_SECRET = process.env.LOCAL_SYNC_SECRET || "checklist-sync-2024";
const APP_VERSION = process.env.CHECKLIST_APP_VERSION || "checklist-local-worker";
const BRAIN_VERSION = process.env.CHECKLIST_BRAIN_VERSION || "worker-v3-research";
const PROMPT_VERSION = process.env.CHECKLIST_PROMPT_VERSION || "2026-04-06.checklist-worker-v3-research";
const KNOWLEDGE_DIR = process.env.KNOWLEDGE_DIR || path.join(__dirname, "knowledge");
const RESEARCH_ENABLED = envFlag(process.env.CHECKLIST_RESEARCH_ENABLED, false);
const RESEARCH_PROVIDER = process.env.CHECKLIST_RESEARCH_PROVIDER || "duckduckgo-html";
const RESEARCH_TIMEOUT_MS = Math.max(Number(process.env.CHECKLIST_RESEARCH_TIMEOUT_MS || "12000"), 3_000);
const RESEARCH_MAX_QUERIES = Math.max(Math.min(Number(process.env.CHECKLIST_RESEARCH_MAX_QUERIES || "2"), 5), 0);
const RESEARCH_MAX_RESULTS = Math.max(Math.min(Number(process.env.CHECKLIST_RESEARCH_MAX_RESULTS || "3"), 6), 0);
const RESEARCH_MAX_FETCHES = Math.max(Math.min(Number(process.env.CHECKLIST_RESEARCH_MAX_FETCHES || "3"), 6), 0);
const RESEARCH_REFRESH_HOURS = Math.max(Number(process.env.CHECKLIST_RESEARCH_REFRESH_HOURS || "24"), 1);
const FACTCHECK_MIN_CITATIONS = Math.max(Math.min(Number(process.env.CHECKLIST_FACTCHECK_MIN_CITATIONS || "2"), 5), 1);
const FACTCHECK_MIN_DOMAINS = Math.max(Math.min(Number(process.env.CHECKLIST_FACTCHECK_MIN_DOMAINS || "2"), 5), 1);
const RESEARCH_ALLOWED_HOSTS = String(process.env.CHECKLIST_RESEARCH_ALLOWED_HOSTS || "")
  .split(",")
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);
const FLASHCARD_KINDS = new Set([
  "SUMMARY",
  "EXPLANATION",
  "COMPARISON",
  "NEWS",
  "CONCLUSION",
  "EVALUATION",
  "OPINION",
  "JUDGMENT",
  "RECOMMENDATION",
  "RESEARCH",
  "FORECAST",
  "STOCK",
  "GOSSIP",
  "PRICE",
]);
const FACTCHECK_CAPS = {
  VERIFIED: 92,
  CORROBORATED: 82,
  SINGLE_SOURCE: 72,
  SOURCE_GROUNDED: 68,
  UNVERIFIED: 45,
  NOT_RUN: 70,
};

let currentDbUrl = process.env.NEON_DB || process.env.DATABASE_URL || "";
let dbReady = false;
let dbBlocker = currentDbUrl ? null : "DATABASE_URL environment variable required (check .env)";
let modelReady = false;
let modelBlocker = null;
let lastPollError = null;
let lastSync = Date.now() - 3_600_000;
let firstRun = true;
let prisma = null;

if (!fs.existsSync(KNOWLEDGE_DIR)) {
  fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });
}

async function refreshDbConfig() {
  currentDbUrl = process.env.NEON_DB || process.env.DATABASE_URL || "";
  if (!currentDbUrl) {
    dbReady = false;
    dbBlocker = "DATABASE_URL environment variable required (check .env)";
    prisma = null;
    return false;
  }
  if (!prisma) {
    try {
      prisma = new PrismaClient({
        datasources: {
          db: {
            url: currentDbUrl,
          },
        },
      });
      dbReady = true;
      dbBlocker = null;
    } catch (e) {
      dbReady = false;
      dbBlocker = `Prisma initialization failed: ${e.message}`;
      return false;
    }
  }
  return true;
}

async function connectDB() {
  if (!(await refreshDbConfig())) {
    throw new Error(dbBlocker);
  }
  try {
    await prisma.$connect();
    dbReady = true;
    dbBlocker = null;
    lastPollError = null;
    console.log("\x1b[32m%s\x1b[0m", "✓ Connected to Checklist database via Prisma");
  } catch (error) {
    dbReady = false;
    dbBlocker = `Database connection failed: ${error.message}`;
    throw error;
  }
}

function normalizeText(value) {
  return String(value || "").replace(/\u0000/g, " ").trim();
}

function normalizeLoose(value) {
  return normalizeText(value).toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function truncate(value, max = 4000) {
  const text = normalizeText(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function similarity(a, b) {
  const left = normalizeLoose(a).split(/\s+/).filter(Boolean);
  const right = normalizeLoose(b).split(/\s+/).filter(Boolean);
  const common = left.filter((token) => right.includes(token) && token.length > 2);
  return common.length / Math.max(left.length, right.length, 1);
}

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return [];
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function extractJsonCandidate(raw) {
  const content = normalizeText(raw).replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");
  if (!content) return null;
  if (content.startsWith("{") || content.startsWith("[")) return content;
  const objectMatch = content.match(/\{[\s\S]*\}/);
  if (objectMatch) return objectMatch[0];
  const arrayMatch = content.match(/\[[\s\S]*\]/);
  if (arrayMatch) return arrayMatch[0];
  return null;
}

function clampInt(value, fallback, min = 1, max = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), min), max);
}

function isoTimestamp(value = new Date()) {
  return new Date(value).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function buildSnapshot(data) {
  const fingerprint = (rows, keyFields) =>
    (rows || [])
      .map((row) => keyFields.map((field) => row?.[field] ?? "").join(":"))
      .sort()
      .join("|");

  return {
    products: fingerprint(data.products, ["id", "updatedAt", "name"]),
    customers: fingerprint(data.customers, ["id", "updatedAt", "name"]),
    competitors: fingerprint(data.competitors, ["id", "updatedAt", "name"]),
    uploadedFiles: fingerprint(data.uploadedFiles, ["id", "updatedAt", "name", "sizeBytes"]),
    flashcards: fingerprint(data.flashcards, ["id", "updatedAt", "status", "reviewStatus", "fingerprint"]),
    flashcardActions: fingerprint(data.flashcardActions, ["id", "createdAt", "action", "flashcardId"]),
    feedback: fingerprint(data.feedback, ["id", "createdAt", "action", "nbaItemId"]),
    pendingNBA: fingerprint(data.existingNBA, ["id", "updatedAt", "status", "title"]),
  };
}

function hasDataChanged(previousSnapshot, nextSnapshot) {
  if (!previousSnapshot) return true;
  return Object.keys(nextSnapshot).some((key) => previousSnapshot[key] !== nextSnapshot[key]);
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function buildSearchLabel(value) {
  const url = safeUrl(value);
  if (!url) return normalizeText(value);
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, "").split(".").slice(0, -1).join(" ");
    const pathSegments = parsed.pathname.split("/").filter(Boolean).slice(0, 2).join(" ");
    return normalizeText(`${hostname} ${pathSegments}`) || url;
  } catch {
    return normalizeText(value);
  }
}

function stripHtml(html) {
  return truncate(
    decodeHtmlEntities(
      String(html || "")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
    ),
    6000
  );
}

function parseBooleanBody(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function safeUrl(raw) {
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function urlDomain(raw) {
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function urlAllowed(raw) {
  if (!raw) return false;
  if (RESEARCH_ALLOWED_HOSTS.length === 0) return true;
  const domain = urlDomain(raw);
  return RESEARCH_ALLOWED_HOSTS.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
}

function shortenUrl(raw) {
  try {
    const parsed = new URL(raw);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "");
  } catch {
    return raw;
  }
}

async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || RESEARCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "ChecklistResearchBot/1.0 (+https://checklist.messmass.com)",
        Accept: "text/html, text/plain, application/json;q=0.9, */*;q=0.5",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`request failed with status ${response.status}`);
    }

    const contentType = normalizeText(response.headers.get("content-type")).toLowerCase();
    const body = await response.text();
    return {
      finalUrl: response.url || url,
      contentType,
      body,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function decodeDuckDuckGoResultUrl(rawUrl) {
  const decoded = decodeHtmlEntities(rawUrl || "");
  if (decoded.startsWith("//")) {
    return decodeDuckDuckGoResultUrl(`https:${decoded}`);
  }
  const parsed = safeUrl(decoded);
  if (!parsed) return null;
  try {
    const url = new URL(parsed);
    if (url.hostname.endsWith("duckduckgo.com") && url.pathname === "/l/") {
      const target = url.searchParams.get("uddg");
      return safeUrl(target);
    }
    return parsed;
  } catch {
    return parsed;
  }
}

function parseDuckDuckGoResults(html) {
  const results = [];
  const regex = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html))) {
    const url = decodeDuckDuckGoResultUrl(match[1]);
    if (!url) continue;
    const title = truncate(stripHtml(match[2]), 220);
    if (!title) continue;
    results.push({ url, title });
    if (results.length >= RESEARCH_MAX_RESULTS) break;
  }
  return results;
}

async function searchDuckDuckGo(query) {
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetchText(searchUrl, { timeoutMs: RESEARCH_TIMEOUT_MS });
  return parseDuckDuckGoResults(response.body).map((result) => ({ ...result, query }));
}

function parseFetchedDocument(url, body, contentType) {
  const isText = contentType.startsWith("text/plain") || contentType.includes("json") || contentType.includes("javascript");
  const titleMatch = !isText ? body.match(/<title[^>]*>([\s\S]*?)<\/title>/i) : null;
  const metaDescriptionMatch = !isText
    ? body.match(/<meta[^+name=["']description["'][^+content=["']([^"']+)["'][^>]*>/i)
    : null;
  const rawText = isText ? body : stripHtml(body);
  const excerpt = truncate(rawText, 1800);
  return {
    url,
    domain: urlDomain(url),
    title: truncate(decodeHtmlEntities(titleMatch?.[1] || ""), 220) || url,
    snippet: truncate(decodeHtmlEntities(metaDescriptionMatch?.[1] || excerpt), 420),
    excerpt,
    contentType,
  };
}

function extractUrlsFromText(text) {
  const matches = String(text || "").match(/https?:\/\/[^\s<>"')]+/g) || [];
  return unique(matches.map((url) => safeUrl(url)).filter(Boolean));
}

function decodeUploadedFile(file) {
  const mimeType = normalizeText(file?.mimeType).toLowerCase();
  const name = normalizeText(file?.name).toLowerCase();
  const looksLikeArchive =
    mimeType.includes("officedocument") ||
    mimeType.includes("zip") ||
    mimeType.includes("pdf") ||
    name.endsWith(".docx") ||
    name.endsWith(".xlsx") ||
    name.endsWith(".pptx") ||
    name.endsWith(".pdf");
  const isTextLike =
    !looksLikeArchive &&
    (mimeType.startsWith("text/") ||
    mimeType.includes("json") ||
    mimeType.includes("csv") ||
    mimeType.includes("xml") ||
    mimeType.includes("javascript") ||
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".csv") ||
    name.endsWith(".json") ||
    name.endsWith(".xml"));

  if (!isTextLike || !file?.content) {
    return `File metadata only: ${normalizeText(file?.name)} (${mimeType || "unknown mime"}, ${file?.sizeBytes || 0} bytes).`;
  }

  const buffer = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content);
  const text = buffer.toString("utf8");
  const hasTooManyControlChars = (text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) || []).length > 8;
  if (hasTooManyControlChars) {
    return `File metadata only: ${normalizeText(file?.name)} (${mimeType || "unknown mime"}, ${file?.sizeBytes || 0} bytes).`;
  }
  return truncate(text, 5000);
}

function buildSourceRecords(company, data) {
  const sources = [];

  for (const product of data.products) {
    const urls = unique(toArray(product.urls).map((url) => safeUrl(url)).filter(Boolean));
    const searchLabel = buildSearchLabel(product.name);
    const promptBody = [
      `Product name: ${product.name}`,
      `Description: ${normalizeText(product.description) || "n/a"}`,
      `Pricing: ${normalizeText(product.pricing) || "n/a"}`,
      `Features: ${toArray(product.features).join(", ") || "n/a"}`,
      `URLs: ${urls.join(", ") || "n/a"}`,
      `Hashtags: ${toArray(product.hashtags).join(", ") || "n/a"}`,
    ].join("\n");
    sources.push({
      sourceType: "PRODUCT",
      sourceId: product.id,
      sourcePublicId: product.publicId ?? null,
      sourceName: product.name,
      relationRole: "PRIMARY",
      urls,
      queryHints: unique([
        `${normalizeText(company.name)} ${searchLabel}`,
        `${searchLabel} pricing`,
        `${searchLabel} reviews`,
      ]),
      promptBody,
      fingerprint: hashValue(`PRODUCT:${product.id}:${product.updatedAt}:${promptBody}`),
    });
  }

  for (const customer of data.customers) {
    const searchLabel = buildSearchLabel(customer.name);
    const promptBody = [
      `Customer name: ${customer.name}`,
      `Segments: ${toArray(customer.segments).join(", ") || "n/a"}`,
      `Pain points: ${toArray(customer.painPoints).join(", ") || "n/a"}`,
      `Channels: ${toArray(customer.channels).join(", ") || "n/a"}`,
      `Lifetime value: ${customer.lifetimeValue ?? "n/a"}`,
      `Notes: ${normalizeText(customer.notes) || "n/a"}`,
      `Hashtags: ${toArray(customer.hashtags).join(", ") || "n/a"}`,
    ].join("\n");
    sources.push({
      sourceType: "CUSTOMER",
      sourceId: customer.id,
      sourcePublicId: customer.publicId ?? null,
      sourceName: customer.name,
      relationRole: "PRIMARY",
      urls: [],
      queryHints: unique([
        `${normalizeText(company.name)} ${searchLabel}`,
        `${searchLabel} industry`,
      ]),
      promptBody,
      fingerprint: hashValue(`CUSTOMER:${customer.id}:${customer.updatedAt}:${promptBody}`),
    });
  }

  for (const competitor of data.competitors) {
    const urls = unique(toArray(competitor.urls).map((url) => safeUrl(url)).filter(Boolean));
    const searchLabel = buildSearchLabel(competitor.name);
    const promptBody = [
      `Competitor name: ${competitor.name}`,
      `Pricing: ${normalizeText(competitor.pricing) || "n/a"}`,
      `Positioning: ${normalizeText(competitor.positioning) || "n/a"}`,
      `Strengths: ${toArray(competitor.strengths).join(", ") || "n/a"}`,
      `Weaknesses: ${toArray(competitor.weaknesses).join(", ") || "n/a"}`,
      `URLs: ${urls.join(", ") || "n/a"}`,
      `Hashtags: ${toArray(competitor.hashtags).join(", ") || "n/a"}`,
    ].join("\n");
    sources.push({
      sourceType: "COMPETITOR",
      sourceId: competitor.id,
      sourcePublicId: competitor.publicId ?? null,
      sourceName: competitor.name,
      relationRole: "PRIMARY",
      urls,
      queryHints: unique([
        `${searchLabel} pricing`,
        `${searchLabel} company`,
        `${searchLabel} product`,
      ]),
      promptBody,
      fingerprint: hashValue(`COMPETITOR:${competitor.id}:${competitor.updatedAt}:${promptBody}`),
    });
  }

  for (const file of data.uploadedFiles) {
    const extractedContent = decodeUploadedFile(file);
    const urls = extractUrlsFromText(extractedContent);
    const searchLabel = buildSearchLabel(file.name);
    const promptBody = [
      `Uploaded file: ${normalizeText(file.name)}`,
      `Mime type: ${normalizeText(file.mimeType) || "n/a"}`,
      `Hashtags: ${toArray(file.hashtags).join(", ") || "n/a"}`,
      `Extracted content: ${extractedContent}`,
    ].join("\n");
    sources.push({
      sourceType: "FILE",
      sourceId: file.id,
      sourcePublicId: file.publicId ?? null,
      sourceName: file.name || `file-${file.publicId || file.id}`,
      relationRole: "PRIMARY",
      urls,
      queryHints: unique([
        urls[0] ? "" : `${normalizeText(company.name)} ${searchLabel}`,
      ]),
      promptBody,
      fingerprint: hashValue(`FILE:${file.id}:${file.updatedAt}:${file.sizeBytes}:${promptBody}`),
    });
  }

  return sources;
}

function buildFactCheckAssessment(source, citations) {
  const usableCitations = citations.filter((citation) => citation.url && citation.domain && citation.excerpt);
  const distinctDomains = new Set(usableCitations.map((citation) => citation.domain));
  let status = "NOT_RUN";

  if (!RESEARCH_ENABLED) {
    status = "NOT_RUN";
  } else if (usableCitations.length >= FACTCHECK_MIN_CITATIONS && distinctDomains.size >= FACTCHECK_MIN_DOMAINS) {
    status = "VERIFIED";
  } else if (usableCitations.length >= FACTCHECK_MIN_CITATIONS) {
    status = "CORROBORATED";
  } else if (usableCitations.length === 1) {
    status = "SINGLE_SOURCE";
  } else if (source.promptBody) {
    status = "SOURCE_GROUNDED";
  } else {
    status = "UNVERIFIED";
  }

  return {
    status,
    citationCount: usableCitations.length,
    distinctDomainCount: distinctDomains.size,
    confidenceCap: FACTCHECK_CAPS[status] || 60,
    minCitationsRequired: FACTCHECK_MIN_CITATIONS,
    minDomainsRequired: FACTCHECK_MIN_DOMAINS,
  };
}

function buildCitationFooter(factCheck, citations) {
  if (!citations.length) {
    return `Fact-check: ${factCheck.status.replace(/_/g, " ").toLowerCase()} (0 external citations).`;
  }
  const sourcesLine = citations
    .slice(0, 3)
    .map((citation) => `${shortenUrl(citation.url)} @ ${isoTimestamp(citation.fetchedAt)}`)
    .join(" | ");
  return [
    `Fact-check: ${factCheck.status.replace(/_/g, " ").toLowerCase()} (${factCheck.citationCount} citations, ${factCheck.distinctDomainCount} domains).`,
    `Sources: ${sourcesLine}`,
  ].join("\n");
}

async function discoverResearch(company, source) {
  if (!RESEARCH_ENABLED) {
    return {
      enabled: false,
      provider: null,
      queries: [],
      citations: [],
      errors: [],
      factCheck: buildFactCheckAssessment(source, []),
    };
  }

  const queries = unique(
    toArray(source.queryHints)
      .map((entry) => normalizeText(entry))
      .filter(Boolean)
      .slice(0, RESEARCH_MAX_QUERIES)
  );
  const candidateUrls = unique(toArray(source.urls).map((entry) => safeUrl(entry)).filter(Boolean));
  const citations = [];
  const errors = [];
  const seenUrls = new Set();

  async function tryFetch(url, meta = {}) {
    if (!url || seenUrls.has(url) || !urlAllowed(url) || citations.length >= RESEARCH_MAX_FETCHES) return;
    seenUrls.add(url);
    try {
      const fetched = await fetchText(url);
      const finalUrl = safeUrl(fetched.finalUrl) || url;
      if (!urlAllowed(finalUrl)) return;
      const parsed = parseFetchedDocument(finalUrl, fetched.body, fetched.contentType);
      citations.push({
        url: parsed.url,
        domain: parsed.domain,
        title: parsed.title,
        snippet: truncate(meta.snippet || parsed.snippet, 320),
        excerpt: parsed.excerpt,
        fetchedAt: isoTimestamp(),
        sourceKind: meta.sourceKind || "search-result",
        query: meta.query || null,
      });
    } catch (error) {
      errors.push({ stage: meta.sourceKind || "fetch", url, message: error.message });
    }
  }

  for (const url of candidateUrls) {
    await tryFetch(url, { sourceKind: "seed-url" });
  }

  if (RESEARCH_PROVIDER === "duckduckgo-html") {
    for (const query of queries) {
      if (citations.length >= RESEARCH_MAX_FETCHES) break;
      try {
        const results = await searchDuckDuckGo(query);
        for (const result of results) {
          if (citations.length >= RESEARCH_MAX_FETCHES) break;
          await tryFetch(result.url, {
            sourceKind: "search-result",
            query,
            snippet: result.title,
          });
        }
      } catch (error) {
        errors.push({ stage: "search", query, message: error.message });
      }
    }
  } else if (RESEARCH_PROVIDER !== "none") {
    errors.push({ stage: "config", message: `Unsupported research provider: ${RESEARCH_PROVIDER}` });
  }

  const dedupedCitations = [];
  const seenCitationUrls = new Set();
  for (const citation of citations) {
    if (!citation.url || seenCitationUrls.has(citation.url)) continue;
    seenCitationUrls.add(citation.url);
    dedupedCitations.push(citation);
  }

  return {
    enabled: true,
    provider: RESEARCH_PROVIDER,
    queries,
    citations: dedupedCitations,
    errors,
    factCheck: buildFactCheckAssessment(source, dedupedCitations),
  };
}

function buildFlashcardEvidence(source, generated, research) {
  return {
    version: "research-v1",
    source: {
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      sourcePublicId: source.sourcePublicId ?? null,
      sourceName: source.sourceName,
      fingerprint: source.fingerprint,
      excerpt: truncate(source.promptBody, 700),
    },
    research: {
      enabled: research.enabled,
      provider: research.provider,
      queries: research.queries,
      runAt: isoTimestamp(),
      refreshHours: RESEARCH_REFRESH_HOURS,
      factCheck: research.factCheck,
      errors: research.errors,
    },
    citations: research.citations.map((citation) => ({
      url: citation.url,
      domain: citation.domain,
      title: citation.title,
      snippet: citation.snippet,
      fetchedAt: citation.fetchedAt,
      sourceKind: citation.sourceKind,
      query: citation.query,
    })),
    generated: {
      title: generated.title,
      body: generated.body,
      kind: generated.kind,
      confidence: generated.confidence,
      impact: generated.impact,
      weight: generated.weight,
    },
  };
}

// Logic removed as it was refactored above into startup block

async function ensureDbReady() {
  if (dbReady && prisma) return true;
  try {
    await connectDB();
    return true;
  } catch (error) {
    dbReady = false;
    dbBlocker = error.message;
    lastPollError = error.message;
    console.error("Checklist worker DB unavailable:", error.message);
    return false;
  }
}

async function ensureModelReady() {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/tags`, { method: "GET" });
    if (!response.ok) {
      throw new Error(`Ollama tags request failed with status ${response.status}`);
    }
    const payload = await response.json();
    const names = (payload.models || []).map((model) => model?.name).filter(Boolean);
    if (!names.includes(OLLAMA_MODEL)) {
      throw new Error(`Required Ollama model ${OLLAMA_MODEL} is not installed`);
    }
    modelReady = true;
    modelBlocker = null;
    return true;
  } catch (error) {
    modelReady = false;
    modelBlocker = error.message;
    lastPollError = error.message;
    console.error("Checklist worker model unavailable:", error.message);
    return false;
  }
}

async function callOllama(messages) {
  if (!(await ensureModelReady())) {
    throw new Error(modelBlocker || "Ollama model unavailable");
  }

  const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      messages,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Ollama chat failed with status ${response.status}`);
  }

  return payload?.message?.content || "";
}

async function callOllamaJson(systemPrompt, userPrompt) {
  const content = await callOllama([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);
  const candidate = extractJsonCandidate(content);
  if (!candidate) {
    throw new Error("Ollama returned no JSON content");
  }

  try {
    return JSON.parse(candidate);
  } catch (error) {
    const repaired = await callOllama([
      {
        role: "system",
        content:
          "Repair the following payload into valid JSON. Return only valid JSON with no markdown fences or commentary.",
      },
      { role: "user", content: candidate },
    ]);
    const repairedCandidate = extractJsonCandidate(repaired);
    if (!repairedCandidate) {
      throw new Error(`Failed to parse Ollama JSON response: ${error.message}`);
    }
    try {
      return JSON.parse(repairedCandidate);
    } catch (repairError) {
      throw new Error(`Failed to parse Ollama JSON response: ${repairError.message}`);
    }
  }
}

async function saveKnowledge(companyId, data) {
  const file = path.join(KNOWLEDGE_DIR, `${companyId}.json`);
  let existing = {};
  if (fs.existsSync(file)) {
    try {
      existing = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      existing = {};
    }
  }
  const updated = { ...existing, ...data, updatedAt: isoTimestamp() };
  fs.writeFileSync(file, JSON.stringify(updated, null, 2));
}

async function loadKnowledge(companyId) {
  const file = path.join(KNOWLEDGE_DIR, `${companyId}.json`);
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function isResearchRefreshDue(knowledge) {
  if (!RESEARCH_ENABLED) return false;
  const lastResearchAt = knowledge?.research?.lastRunAt || knowledge?.updatedAt;
  if (!lastResearchAt) return true;
  const lastMs = new Date(lastResearchAt).getTime();
  if (!Number.isFinite(lastMs)) return true;
  return Date.now() - lastMs >= RESEARCH_REFRESH_HOURS * 3_600_000;
}

async function getAllData(companyId) {
  const [
    company,
    products,
    customers,
    competitors,
    uploadedFiles,
    flashcards,
    flashcardActions,
    feedback,
    nba,
  ] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId } }),
    prisma.product.findMany({ where: { companyId }, orderBy: { updatedAt: "desc" } }),
    prisma.customer.findMany({ where: { companyId }, orderBy: { updatedAt: "desc" } }),
    prisma.competitor.findMany({ where: { companyId }, orderBy: { updatedAt: "desc" } }),
    prisma.uploadedSourceFile.findMany({ where: { companyId }, orderBy: { updatedAt: "desc" } }),
    prisma.flashcard.findMany({ where: { companyId }, orderBy: { updatedAt: "desc" } }),
    prisma.flashcardAction.findMany({
      where: { flashcard: { companyId } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.feedback.findMany({
      where: { nbaItem: { companyId } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.nbaItem.findMany({ where: { companyId }, orderBy: { updatedAt: "desc" } }),
  ]);

  return {
    company,
    products,
    customers,
    competitors,
    uploadedFiles,
    flashcards,
    flashcardActions,
    feedback,
    existingNBA: nba,
  };
}

async function generateFlashcardCandidate(company, source, research) {
  const systemPrompt = [
    "You generate exactly one Checklist flashcard as strict JSON.",
    "Return an object with keys: title, body, kind, confidence, impact, weight.",
    "Allowed kinds: SUMMARY, EXPLANATION, COMPARISON, NEWS, CONCLUSION, EVALUATION, OPINION, JUDGMENT, RECOMMENDATION, RESEARCH, FORECAST, STOCK, GOSSIP, PRICE.",
    "Use concise business language.",
    "Ground the output in the provided first-party source and public evidence only.",
    "If public evidence is present, reflect that in the body without inventing claims.",
    "confidence, impact, and weight must be integers from 1 to 100.",
    "Do not include markdown fences or extra text.",
  ].join(" ");

  const evidencePayload = {
    firstPartySource: {
      sourceType: source.sourceType,
      sourceName: source.sourceName,
      excerpt: truncate(source.promptBody, 1200),
    },
    publicEvidence: research.citations.map((citation) => ({
      url: citation.url,
      domain: citation.domain,
      title: citation.title,
      snippet: citation.snippet,
      excerpt: truncate(citation.excerpt, 900),
    })),
    factCheck: research.factCheck,
  };

  const userPrompt = [
    `Company: ${company.name}`,
    `Industry: ${normalizeText(company.industry) || "n/a"}`,
    `Main goal: ${normalizeText(company.mainGoal) || "n/a"}`,
    `Source type: ${source.sourceType}`,
    `Source name: ${source.sourceName}`,
    "",
    JSON.stringify(evidencePayload, null, 2),
  ].join("\n");

  const raw = await callOllamaJson(systemPrompt, userPrompt);
  const kind = normalizeText(raw.kind || (research.citations.length > 0 ? "RESEARCH" : "SUMMARY")).toUpperCase();
  const rawBody = truncate(raw.body || source.promptBody, 900);
  const body = truncate(`${rawBody}\n\n${buildCitationFooter(research.factCheck, research.citations)}`, 1200);
  const modelConfidence = clampInt(raw.confidence, 60);
  return {
    title: truncate(raw.title || `${source.sourceType}: ${source.sourceName}`, 160),
    body,
    kind: FLASHCARD_KINDS.has(kind) ? kind : "SUMMARY",
    confidence: Math.min(modelConfidence, research.factCheck.confidenceCap),
    impact: clampInt(raw.impact, 55),
    weight: clampInt(raw.weight, 55),
  };
}

async function upsertFlashcardSource(flashcardId, source) {
  const existing = await prisma.flashcardSource.findUnique({
    where: {
      flashcardId_sourceType_sourceId: {
        flashcardId,
        sourceType: source.sourceType,
        sourceId: source.sourceId,
      },
    },
  });

  if (!existing) {
    await prisma.flashcardSource.create({
      data: {
        id: crypto.randomUUID(),
        flashcardId,
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        sourcePublicId: source.sourcePublicId,
        sourceName: source.sourceName,
        relationRole: source.relationRole,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }
}

async function syncSupportingSources(flashcardId, citations) {
  await prisma.flashcardSource.deleteMany({
    where: {
      flashcardId,
      sourceType: "AGENT_FOUND",
      relationRole: "SUPPORTING",
    },
  });

  for (const citation of citations) {
    await upsertFlashcardSource(flashcardId, {
      sourceType: "AGENT_FOUND",
      sourceId: hashValue(citation.url),
      sourcePublicId: null,
      sourceName: truncate(`${citation.title} (${citation.domain})`, 200),
      relationRole: "SUPPORTING",
    });
  }
}

async function syncFlashcards(companyId, company, data, previousKnowledge = {}) {
  const sources = buildSourceRecords(company, data);
  const localFlashcards = (data.flashcards || []).filter((card) => normalizeText(card.createdBy) === "local-ai");
  const existingByFingerprint = new Map(localFlashcards.map((card) => [card.fingerprint, card]));
  const seenFingerprints = new Set();
  
  // Strategy 2: If we have an existing ACTIVE local flashcard, its fingerprint is "seen" 
  // unless we definitely have new data on Neon for it.
  localFlashcards.forEach(card => {
    if (card.status === 'ACTIVE' && card.fingerprint) {
      seenFingerprints.add(card.fingerprint);
    }
  });

  let created = 0;
  let updated = 0;
  let researched = 0;

  for (const source of sources) {
    seenFingerprints.add(source.fingerprint);
    const research = await discoverResearch(company, source);
    if (research.enabled) researched += 1;

    let generated;
    try {
      generated = await generateFlashcardCandidate(company, source, research);
    } catch (error) {
      console.error(`Flashcard generation failed for ${companyId}/${source.sourceType}/${source.sourceId}: ${error.message}`);
      continue;
    }

    const evidence = buildFlashcardEvidence(source, generated, research);
    const existing = existingByFingerprint.get(source.fingerprint);
    
    if (existing) {
      const title = existing.manualTitle || existing.title || generated.title;
      const body = existing.manualBody || generated.body;
      
      await prisma.flashcard.update({
        where: { id: existing.id },
        data: {
          title,
          body,
          confidence: generated.confidence,
          impact: generated.impact,
          weight: generated.weight,
          status: "ACTIVE",
          refreshedAt: new Date(),
          updatedAt: new Date(),
          generatedTitle: generated.title,
          generatedBody: generated.body,
          evidence: evidence,
          kind: generated.kind,
          appVersion: APP_VERSION,
          brainVersion: BRAIN_VERSION,
          generatedAt: new Date(),
          promptVersion: PROMPT_VERSION,
        },
      });
      
      await upsertFlashcardSource(existing.id, source);
      if (RESEARCH_ENABLED) {
        await syncSupportingSources(existing.id, research.citations);
      }
      updated += 1;
      continue;
    }

    const flashcardId = crypto.randomUUID();
    await prisma.flashcard.create({
      data: {
        id: flashcardId,
        publicId: null,
        companyId,
        title: generated.title,
        body: generated.body,
        confidence: generated.confidence,
        impact: generated.impact,
        weight: generated.weight,
        status: "ACTIVE",
        createdBy: "local-ai",
        refreshedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        generatedBody: generated.body,
        generatedTitle: generated.title,
        reviewStatus: "PENDING",
        evidence: evidence,
        fingerprint: source.fingerprint,
        kind: generated.kind,
        appVersion: APP_VERSION,
        brainVersion: BRAIN_VERSION,
        generatedAt: new Date(),
        promptVersion: PROMPT_VERSION,
      },
    });
    
    await upsertFlashcardSource(flashcardId, source);
    if (RESEARCH_ENABLED) {
      await syncSupportingSources(flashcardId, research.citations);
    }
    created += 1;
  }

  const staleCandidates = localFlashcards
    .filter((card) => card.status === "ACTIVE")
    .filter((card) => !seenFingerprints.has(card.fingerprint))
    .map((card) => card.id);

  if (staleCandidates.length > 0) {
    await prisma.flashcard.updateMany({
      where: { id: { in: staleCandidates } },
      data: {
        status: "STALE",
        refreshedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  return { created, updated, stale: staleCandidates.length, researched };
}

async function evictProcessedSources(companyId, data) {
  let evictedCount = 0;
  
  if (data.products.length > 0) {
    const ids = data.products.map(p => p.id);
    const deleted = await prisma.product.deleteMany({ where: { id: { in: ids } } });
    evictedCount += deleted.count;
  }
  
  if (data.customers.length > 0) {
    const ids = data.customers.map(c => c.id);
    const deleted = await prisma.customer.deleteMany({ where: { id: { in: ids } } });
    evictedCount += deleted.count;
  }
  
  if (data.competitors.length > 0) {
    const ids = data.competitors.map(c => c.id);
    const deleted = await prisma.competitor.deleteMany({ where: { id: { in: ids } } });
    evictedCount += deleted.count;
  }
  
  if (data.uploadedFiles.length > 0) {
    const ids = data.uploadedFiles.map(f => f.id);
    const deleted = await prisma.uploadedSourceFile.deleteMany({ where: { id: { in: ids } } });
    evictedCount += deleted.count;
  }
  
  if (evictedCount > 0) {
    console.log(`Company ${companyId}: evicted ${evictedCount} source records from MongoDB.`);
  }
  return evictedCount;
}

async function generateRecommendationCandidates(company, flashcards) {
  const cards = flashcards.slice(0, 25).map((card) => ({
    id: card.id,
    title: card.title,
    body: truncate(card.body, 400),
    kind: card.kind,
    confidence: card.confidence,
    impact: card.impact,
    weight: card.weight,
    factCheckStatus: normalizeText(card?.evidence?.research?.factCheck?.status || "NOT_RUN"),
    citationCount: Number(card?.evidence?.research?.factCheck?.citationCount || 0),
  }));

  if (cards.length === 0) return [];

  const systemPrompt = [
    "You generate exactly three Checklist recommendations as strict JSON.",
    "Return a JSON array of objects.",
    "Each object must contain: title, description, impact, confidence, ease, sourceFlashcardIds.",
    "impact and ease are integers from 1 to 10.",
    "confidence is an integer from 1 to 100.",
    "Prefer the strongest grounded flashcards first.",
    "sourceFlashcardIds must contain one or more ids from the provided flashcards.",
    "Do not include markdown fences or extra text.",
  ].join(" ");

  const userPrompt = [
    `Company: ${company.name}`,
    `Main goal: ${normalizeText(company.mainGoal) || "n/a"}`,
    "Flashcards:",
    JSON.stringify(cards, null, 2),
  ].join("\n");

  const raw = await callOllamaJson(systemPrompt, userPrompt);
  if (!Array.isArray(raw)) return [];

  const allowedIds = new Set(cards.map((card) => card.id));
  return raw
    .map((item) => ({
      title: truncate(item.title, 160),
      description: truncate(item.description, 600),
      impact: clampInt(item.impact, 5, 1, 10),
      confidence: clampInt(item.confidence, 60),
      ease: clampInt(item.ease, 5, 1, 10),
      sourceFlashcardIds: toArray(item.sourceFlashcardIds).filter((id) => allowedIds.has(id)),
    }))
    .filter((item) => item.title && item.description && item.sourceFlashcardIds.length > 0);
}

async function syncRecommendations(companyId, company, existingNBA) {
  const activeFlashcards = await prisma.flashcard.findMany({
    where: {
      companyId,
      status: "ACTIVE",
      reviewStatus: { not: "DECLINED" },
    },
    orderBy: [
      { confidence: "desc" },
      { weight: "desc" },
      { impact: "desc" },
      { updatedAt: "desc" },
    ],
  });

  let candidates = [];
  try {
    candidates = await generateRecommendationCandidates(company, activeFlashcards);
  } catch (error) {
    console.error(`Recommendation generation failed for ${companyId}: ${error.message}`);
    return { created: 0, updated: 0, degraded: true };
  }
  
  let created = 0;
  let updated = 0;

  for (const rec of candidates) {
    const match = existingNBA.find((item) => similarity(item.title, rec.title) >= 0.7);
    const iceScore = rec.impact * (rec.confidence / 100) * rec.ease * 10;
    
    if (match && normalizeText(match.createdBy) === "local-ai" && match.status === "PENDING") {
      await prisma.nbaItem.update({
        where: { id: match.id },
        data: {
          title: rec.title,
          description: rec.description,
          impact: rec.impact,
          confidence: rec.confidence,
          ease: rec.ease,
          iceScore: iceScore,
          sourceFlashcardIds: rec.sourceFlashcardIds,
          updatedAt: new Date(),
          appVersion: APP_VERSION,
          brainVersion: BRAIN_VERSION,
          generatedAt: new Date(),
          promptVersion: PROMPT_VERSION,
        },
      });
      updated += 1;
      continue;
    }

    if (match) continue;

    await prisma.nbaItem.create({
      data: {
        id: crypto.randomUUID(),
        companyId,
        title: rec.title,
        description: rec.description,
        impact: rec.impact,
        confidence: rec.confidence,
        ease: rec.ease,
        iceScore: iceScore,
        status: "PENDING",
        createdBy: "local-ai",
        createdAt: new Date(),
        updatedAt: new Date(),
        sourceFlashcardIds: rec.sourceFlashcardIds,
        appVersion: APP_VERSION,
        brainVersion: BRAIN_VERSION,
        generatedAt: new Date(),
        promptVersion: PROMPT_VERSION,
      },
    });
    created += 1;
  }

  return { created, updated };
}

async function processCompany(companyId, reason = {}) {
  const previousKnowledge = await loadKnowledge(companyId);
  const data = await getAllData(companyId);
  if (!data?.company) {
    throw new Error(`Company ${companyId} not found`);
  }

  const flashcards = await syncFlashcards(companyId, data.company, data, previousKnowledge);
  const recommendations = await syncRecommendations(companyId, data.company, data.existingNBA);
  const nextData = await getAllData(companyId);
  await saveKnowledge(companyId, {
    snapshot: buildSnapshot(nextData),
    lastTriggeredBy: reason,
    lastRun: {
      flashcards,
      recommendations,
    },
    research: {
      enabled: RESEARCH_ENABLED,
      provider: RESEARCH_ENABLED ? RESEARCH_PROVIDER : null,
      refreshHours: RESEARCH_REFRESH_HOURS,
      lastRunAt: isoTimestamp(),
    },
  });

  await evictProcessedSources(companyId, data);

  return {
    flashcards,
    recommendations,
    dataSynced: {
      products: data.products.length,
      customers: data.customers.length,
      competitors: data.competitors.length,
      uploadedFiles: data.uploadedFiles.length,
      feedback: data.feedback.length,
    },
  };
}

async function enrichOldestItems() {
  console.log("Enrichment Loop: Checking for oldest stale items...");
  const companies = await prisma.company.findMany({ orderBy: { createdAt: "asc" }, select: { id: true } });

  for (const row of companies) {
    const companyId = row.id;
    const data = await getAllData(companyId);
    if (!data.company) continue;

    const flashcard = await prisma.flashcard.findFirst({
      where: { companyId, status: "ACTIVE" },
      orderBy: { updatedAt: "asc" },
    });

    if (flashcard) {
      console.log(`Enriching oldest flashcard: ${flashcard.id} (${flashcard.title})`);
      const fs = await prisma.flashcardSource.findFirst({
        where: { flashcardId: flashcard.id, relationRole: "PRIMARY" },
      });
      if (fs) {
        const source = {
          sourceType: fs.sourceType,
          sourceId: fs.sourceId,
          sourcePublicId: fs.sourcePublicId,
          sourceName: fs.sourceName,
          promptBody: flashcard.generatedBody || flashcard.body,
          fingerprint: flashcard.fingerprint
        };
        const research = await discoverResearch(data.company, source);
        const generated = await generateFlashcardCandidate(data.company, source, research);
        const evidence = buildFlashcardEvidence(source, generated, research);

        await prisma.flashcard.update({
          where: { id: flashcard.id },
          data: {
            generatedTitle: generated.title,
            generatedBody: generated.body,
            confidence: generated.confidence,
            impact: generated.impact,
            weight: generated.weight,
            evidence: evidence,
            kind: generated.kind,
            updatedAt: new Date(),
            refreshedAt: new Date(),
          },
        });
        console.log(`Flashcard ${flashcard.id} enriched.`);
      }
    }

    // 2. Refresh recommendations for the company if any flashcards changed
    await syncRecommendations(companyId, data.company, data.existingNBA);
  }
}

async function parseRequestBody(req) {
  return await new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      resolve(data ? parseBooleanBody(data) : {});
    });
  });
}

async function handleSync(req, res) {
  try {
    if (!(await ensureDbReady())) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: dbBlocker || "database unavailable" }));
      return;
    }
    if (!(await ensureModelReady())) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: modelBlocker || "model unavailable" }));
      return;
    }

    if (req.headers.authorization !== `Bearer ${LOCAL_SYNC_SECRET}`) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const body = await parseRequestBody(req);
    const { companyId, dataType, action } = body;
    if (!companyId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "companyId required" }));
      return;
    }

    const result = await processCompany(companyId, { dataType, action, trigger: "sync" });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, ...result }));
  } catch (error) {
    console.error("Checklist worker sync error:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: error.message }));
  }
}

async function handleForce(req, res) {
  try {
    if (!(await ensureDbReady())) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: dbBlocker || "database unavailable" }));
      return;
    }
    if (!(await ensureModelReady())) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: modelBlocker || "model unavailable" }));
      return;
    }

    const body = await parseRequestBody(req);
    if (!body.companyId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "companyId required" }));
      return;
    }

    const result = await processCompany(body.companyId, { trigger: "force" });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, ...result }));
  } catch (error) {
    console.error("Checklist worker force error:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: error.message }));
  }
}

async function handleHealth(_req, res) {
  await ensureDbReady();
  await ensureModelReady();
  
  const health = {
    status: dbReady && modelReady ? "ok" : "degraded",
    ready: dbReady && modelReady,
    model: OLLAMA_MODEL,
    ollamaHost: OLLAMA_HOST,
    lastSync,
    db: {
      configured: Boolean(currentDbUrl),
      ready: dbReady,
      blocker: dbBlocker,
    },
    ai: {
      ready: modelReady,
      blocker: modelBlocker,
    },
    researchEnabled: RESEARCH_ENABLED,
    appVersion: APP_VERSION,
    brainVersion: BRAIN_VERSION,
    lastPollError,
  };

  res.writeHead(health.ready ? 200 : 503, { "Content-Type": "application/json" });
  res.end(JSON.stringify(health));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === "/sync" && req.method === "POST") {
    await handleSync(req, res);
    return;
  }

  if (url.pathname === "/force" && req.method === "POST") {
    await handleForce(req, res);
    return;
  }

  if (url.pathname === "/health" || url.pathname === "/") {
    await handleHealth(req, res);
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, async () => {
  console.log("--------------------------------------------------");
  console.log(`Checklist worker starting on port ${PORT}`);
  console.log(`AI Configuration: ${OLLAMA_MODEL} @ ${OLLAMA_HOST}`);
  console.log("--------------------------------------------------");
  
  if (!(await ensureDbReady())) {
    console.warn("\x1b[31m%s\x1b[0m", "⚠ DATABASE BLOCKER:");
    console.warn("\x1b[31m%s\x1b[0m", `  ${dbBlocker}`);
  }
  
  if (!(await ensureModelReady())) {
    console.warn("\x1b[31m%s\x1b[0m", "⚠ AI MODEL BLOCKER:");
    console.warn("\x1b[31m%s\x1b[0m", `  ${modelBlocker}`);
  }

  if (dbReady && modelReady) {
    console.log("\x1b[32m%s\x1b[0m", "✓ WORKER IS READY AND POLLING");
  } else {
    console.log("\x1b[33m%s\x1b[0m", "⚠ WORKER IS DEGRADED - check health endpoint for details");
  }
  console.log("--------------------------------------------------");
});

setInterval(async () => {
  try {
    if (!(await ensureDbReady())) {
      console.log(`Checklist worker poll skipped: ${dbBlocker}`);
      return;
    }
    if (!(await ensureModelReady())) {
      console.log(`Checklist worker poll skipped: ${modelBlocker}`);
      return;
    }

    const companies = await prisma.company.findMany({ select: { id: true }, orderBy: { createdAt: "asc" } });
    let anyNew = false;

    if (firstRun) {
      console.log("First run - syncing all company data...");
      for (const row of companies) {
        const data = await getAllData(row.id);
        if (!data?.company) continue;
        const hasAnySource =
          data.products.length > 0 ||
          data.customers.length > 0 ||
          data.competitors.length > 0 ||
          data.uploadedFiles.length > 0;
        if (!hasAnySource) {
          await saveKnowledge(row.id, {
            snapshot: buildSnapshot(data),
            research: {
              enabled: RESEARCH_ENABLED,
              provider: RESEARCH_ENABLED ? RESEARCH_PROVIDER : null,
              refreshHours: RESEARCH_REFRESH_HOURS,
              lastRunAt: isoTimestamp(),
            },
          });
          continue;
        }
        anyNew = true;
        console.log(`Company ${row.id}: full processing run`);
        await processCompany(row.id, { trigger: "poll-first-run" });
      }
      firstRun = false;
    } else {
      console.log(`Polling since ${new Date(lastSync).toISOString()}...`);
      for (const row of companies) {
        const data = await getAllData(row.id);
        const nextSnapshot = buildSnapshot(data);
        const previousKnowledge = await loadKnowledge(row.id);
        const snapshotChanged = hasDataChanged(previousKnowledge.snapshot, nextSnapshot);
        const refreshDue = isResearchRefreshDue(previousKnowledge);
        if (!snapshotChanged && !refreshDue) {
          continue;
        }
        anyNew = true;
        console.log(
          `Company ${row.id}: ${snapshotChanged ? "source or review state changed" : "research refresh due"}`
        );
        await processCompany(row.id, { trigger: snapshotChanged ? "poll-delta" : "poll-research-refresh" });
      }
    }

    if (anyNew) {
      lastSync = Date.now();
      lastPollError = null;
    } else {
      console.log("No new changes detected");
    }
  } catch (error) {
    lastPollError = error.message;
    console.error("Checklist worker poll error:", error.message);
  }
}, POLL_INTERVAL);

// Start enrichment loop
setInterval(() => {
  enrichOldestItems().catch((err) => console.error("Enrichment skip:", err));
}, ENRICHMENT_INTERVAL);

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
