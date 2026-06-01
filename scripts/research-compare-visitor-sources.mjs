import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env", override: false });

const require = createRequire(import.meta.url);
const { harvestResearch } = require("./lib/research");
const { callOllamaWithFailover } = require("./lib/ai");
const { STAGE_MODELS } = require("./lib/core");

const prisma = new PrismaClient();

const DEFAULT_COMPANY_ID = "54234212-b01d-49b6-8dcd-3bd825b66912";
const DEFAULT_DESTINATION_INSTANCE_ID = "9e6ef3f1-3516-4666-90a0-d550297cca78";

const RELEVANT_TERMS = [
  "shooting",
  "range",
  "pistol",
  "rifle",
  "shotgun",
  "sport shooting",
  "hunting",
  "hunter",
  "competition",
  "club",
  "loter",
  "lőtér",
  "lovesz",
  "lövész",
  "vadasz",
  "vadász",
  "fegyver",
];

const BLOCKED_TERMS = [
  "birthday",
  "kids",
  "children",
  "camp",
  "play",
  "dance",
  "museum",
  "zoo",
  "library",
  "nomadicmatt",
  "travel guide",
];

const OFFICIAL_SOURCE_FRONTIER = [
  {
    title: "BTKSE official shooting range",
    snippet: "Official Hungarian sport shooting club and shooting range source.",
    url: "https://btkse.hu/",
  },
  {
    title: "B-Pro Shooting Range official page",
    snippet: "Official B-Pro shooting range information page in Hungary.",
    url: "https://bpro.solutions/en/about-us-bpro/shooting-range/",
  },
  {
    title: "Shooting Range Budapest official page",
    snippet: "Official Budapest shooting range visitor source.",
    url: "https://www.shootingrangebudapest.hu/en/",
  },
  {
    title: "Academy Golf Budapest Shooting Range official page",
    snippet: "Official shooting range page in Budapest.",
    url: "https://academygolfbudapest.hu/en/shooting-range/",
  },
  {
    title: "Poligon Shooting Range official page",
    snippet: "Official Hungarian shooting range source.",
    url: "https://poligonloter.hu/",
  },
  {
    title: "Magnum Shooting Range official page",
    snippet: "Official Hungarian shooting range source.",
    url: "https://magnumloter.hu/",
  },
  {
    title: "Dorogi Sportloter official page",
    snippet: "Official Dorog sport shooting range source.",
    url: "https://www.dorogloter.hu/",
  },
  {
    title: "Gyori Polgari Lovesz Sportegyesulet official page",
    snippet: "Official Gyor sport shooting association and range source.",
    url: "https://gyoriple.hu/",
  },
  {
    title: "Parabellum Loter official page",
    snippet: "Official Budapest shooting range source.",
    url: "https://parabellumse.hu/",
  },
  {
    title: "Globus Sportloter official page",
    snippet: "Official Budapest shooting range source.",
    url: "https://globusloter.hu/",
  },
  {
    title: "Stag Shooting official page",
    snippet: "Official Budapest indoor shooting range source.",
    url: "https://stagshooting.eu/",
  },
  {
    title: "Capital Shooting official page",
    snippet: "Official Budapest indoor shooting range source.",
    url: "https://capitalshooting.eu/",
  },
  {
    title: "Torok Istvan Sportegyesulet official page",
    snippet: "Official Hungarian sport shooting association source.",
    url: "https://ti-se.hu/",
  },
  {
    title: "MSSZ official federation page",
    snippet: "Official Hungarian sport shooting federation source.",
    url: "https://www.mssz.hu/",
  },
  {
    title: "MDLSZ official federation page",
    snippet: "Official Hungarian dynamic shooting federation source.",
    url: "https://www.mdlsz.hu/",
  },
  {
    title: "IPSC Hungary official page",
    snippet: "Official Hungarian IPSC practical shooting source.",
    url: "https://www.ipschungary.hu/",
  },
];

const ALLOWED_CATEGORIES = new Set(["Classes", "Camps", "Competitions", "Drop-In Activities"]);

function parseArgs(argv) {
  const args = {
    companyId: DEFAULT_COMPANY_ID,
    destinationInstanceId: DEFAULT_DESTINATION_INSTANCE_ID,
    visitorKey: "compare",
    limit: 3,
    publish: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--companyId") {
      args.companyId = String(argv[index + 1] || "").trim();
      index += 1;
    } else if (token === "--destinationInstanceId") {
      args.destinationInstanceId = String(argv[index + 1] || "").trim();
      index += 1;
    } else if (token === "--visitorKey") {
      args.visitorKey = String(argv[index + 1] || "").trim() || "compare";
      index += 1;
    } else if (token === "--limit") {
      const raw = Number(argv[index + 1]);
      if (Number.isFinite(raw)) args.limit = Math.max(1, Math.min(50, Math.trunc(raw)));
      index += 1;
    } else if (token === "--publish") {
      args.publish = true;
    }
  }
  return args;
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value) {
  return Array.isArray(value) ? value.map(asString).filter(Boolean) : [];
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeUrl(value) {
  const raw = asString(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.hash = "";
    url.search = "";
    return url.toString();
  } catch {
    return raw;
  }
}

function hostOf(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function slugify(value) {
  return asString(value)
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function normalizeCategory(value) {
  const raw = asString(value);
  if (ALLOWED_CATEGORIES.has(raw)) return raw;
  const lower = raw.toLowerCase();
  if (lower.includes("competition")) return "Competitions";
  if (lower.includes("camp")) return "Camps";
  if (lower.includes("class") || lower.includes("course") || lower.includes("training")) return "Classes";
  return "Drop-In Activities";
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(value, baseUrl) {
  const raw = asString(value);
  if (!raw || raw.startsWith("data:")) return "";
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return "";
  }
}

function extractImageCandidates(html, baseUrl) {
  const candidates = [];
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/gi,
    /<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["'][^>]*>/gi,
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const url = absoluteUrl(match[1], baseUrl);
      if (!url) continue;
      const lower = url.toLowerCase();
      if (/(logo|icon|sprite|placeholder|facebook|emoji|svg)/.test(lower)) continue;
      if (!/\.(jpg|jpeg|png|webp)(?:\?|$)/i.test(lower)) continue;
      candidates.push(url);
    }
  }
  return [...new Set(candidates)].slice(0, 8);
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 checklist-local-ai-researcher",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!response.ok) throw new Error(`fetch failed ${response.status}`);
  return response.text();
}

async function uploadOfficialImage(imageUrl) {
  const baseUrl = String(process.env.COMPARE_BASE_URL || "").replace(/\/$/, "");
  const ingestKey = String(process.env.COMPARE_INGEST_API_KEY || "").trim();
  if (!baseUrl || !ingestKey) throw new Error("COMPARE_BASE_URL and COMPARE_INGEST_API_KEY are required.");

  const imageResponse = await fetch(imageUrl, {
    headers: { "User-Agent": "Mozilla/5.0 checklist-local-ai-image-fetcher" },
  });
  if (!imageResponse.ok) throw new Error(`image fetch failed ${imageResponse.status}`);
  const blob = await imageResponse.blob();
  if (blob.size < 8_000) throw new Error("image candidate is too small");

  const form = new FormData();
  const extension = imageUrl.match(/\.(jpg|jpeg|png|webp)(?:\?|$)/i)?.[1] || "jpg";
  form.set("file", blob, `compare-source.${extension}`);
  const upload = await fetch(`${baseUrl}/api/ingest/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ingestKey}` },
    body: form,
  });
  const data = await upload.json().catch(() => ({}));
  if (!upload.ok || !data.url) {
    throw new Error(`image upload failed ${upload.status}: ${JSON.stringify(data)}`);
  }
  return String(data.url);
}

async function listLiveCompareUrls() {
  const baseUrl = String(process.env.COMPARE_BASE_URL || "").replace(/\/$/, "");
  if (!baseUrl) return new Set();
  const response = await fetch(`${baseUrl}/api/public/providers`).catch(() => null);
  if (!response?.ok) return new Set();
  const providers = await response.json().catch(() => []);
  return new Set((Array.isArray(providers) ? providers : []).map((provider) => normalizeUrl(provider.website)).filter(Boolean));
}

async function buildQueries(existingHosts) {
  const systemPrompt = [
    "You are CHECK Local, the research brain for the Compare visitor miniapp.",
    "Generate search queries for official Hungarian sport shooting, shooting range, sport shooting club, shooting course, hunting association, and competition sources.",
    "Avoid already-live hosts. Return strict JSON: {\"queries\":[\"...\"]}.",
  ].join(" ");
  const userPrompt = JSON.stringify({
    country: "Hungary",
    visitorKey: "compare",
    alreadyLiveHosts: [...existingHosts],
    required: "official source pages with usable official image assets",
  });
  try {
    const result = await callOllamaWithFailover(systemPrompt, userPrompt, STAGE_MODELS.DRAFT, { timeoutMs: 120_000 });
    const queries = asStringArray(result.queries).slice(0, 8);
    if (queries.length > 0) return queries;
  } catch (error) {
    console.warn(`[compare-research] Local AI query generation failed, using seed queries: ${error.message}`);
  }
  return [
    "Hungary shooting range official Budapest loter",
    "site:.hu lőtér Budapest sportlövészet hivatalos",
    "Hungary sport shooting club official lőtér",
    "Hungary hunting association official shooting competition",
  ];
}

function candidateLooksRelevant(item) {
  const text = `${item.title || ""} ${item.snippet || ""} ${item.url || ""}`.toLowerCase();
  if (BLOCKED_TERMS.some((term) => text.includes(term))) return false;
  return RELEVANT_TERMS.some((term) => text.includes(term));
}

function pageLooksRelevant(text) {
  const lower = String(text || "").toLowerCase();
  if (BLOCKED_TERMS.some((term) => lower.includes(term))) return false;
  return RELEVANT_TERMS.some((term) => lower.includes(term));
}

function mergeCandidates(searchResults, liveUrls) {
  const candidates = [
    ...OFFICIAL_SOURCE_FRONTIER.map((item) => ({ ...item, provider: "official-source-frontier" })),
    ...searchResults,
  ];
  const uniqueResults = [];
  const seenHosts = new Set();
  for (const candidate of candidates) {
    const url = normalizeUrl(candidate.url);
    const host = hostOf(url);
    if (!url || !host || liveUrls.has(url) || seenHosts.has(host)) continue;
    uniqueResults.push({ ...candidate, url });
    seenHosts.add(host);
  }
  return uniqueResults;
}

async function extractPublicDraftWithLocalAi(input) {
  const systemPrompt = [
    "You are CHECK Local's Compare visitor researcher.",
    "Extract one public-ready Compare provider draft from an official source page.",
    "Use only evidence in the provided page text and source URL.",
    "Do not invent prices, addresses, phones, emails, hours, programs, or categories.",
    "Return strict JSON with keys: relevant(boolean), confidence(number), name, category, address, neighborhood, activityTypes(array), ageRanges(array), dayTimeTags(array), shortDescription, longDescription, email, phone, evidence.",
    "Allowed category examples: Drop-In Activities, Classes.",
    "Allowed ageRanges: Beginner, Licensed Adult, Hunter Prep.",
    "Allowed dayTimeTags: Weekday, Weekend, Morning, Afternoon, Evening, After-school, Seasonal.",
  ].join(" ");
  const userPrompt = JSON.stringify({
    sourceUrl: input.sourceUrl,
    title: input.title,
    pageText: input.pageText.slice(0, 9000),
  });
  return callOllamaWithFailover(systemPrompt, userPrompt, STAGE_MODELS.WRITE, { timeoutMs: 180_000 });
}

function buildPayloadFromExtraction(extraction, sourceUrl, uploadedImageUrl) {
  const name = asString(extraction.name);
  const category = normalizeCategory(extraction.category);
  const shortDescription = asString(extraction.shortDescription);
  const longDescription = asString(extraction.longDescription);
  if (!name || shortDescription.length < 50 || longDescription.length < 120) {
    throw new Error("Local AI extraction did not produce enough public copy.");
  }
  const activityTypes = asStringArray(extraction.activityTypes).slice(0, 6);
  const ageRanges = asStringArray(extraction.ageRanges).slice(0, 4);
  const dayTimeTags = asStringArray(extraction.dayTimeTags).slice(0, 7);
  return {
    catalogProject: "compare",
    id: `prov-${slugify(name)}`,
    name,
    category,
    borough: "Hungary",
    neighborhood: asString(extraction.neighborhood) || "Hungary",
    address: asString(extraction.address).length >= 8 ? asString(extraction.address) : "Hungary, official source",
    activityTypes: activityTypes.length ? activityTypes : ["Range Training"],
    ageRanges: ageRanges.length ? ageRanges : ["Licensed Adult"],
    dayTimeTags: dayTimeTags.length ? dayTimeTags : ["Weekday"],
    pricePerClass: 0,
    shortDescription,
    longDescription,
    rating: 0,
    reviewCount: 0,
    badges: [],
    image: uploadedImageUrl,
    galleryImages: [],
    email: asString(extraction.email),
    website: sourceUrl,
    phone: asString(extraction.phone),
    bookingEnabled: false,
    publishedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    localized: {
      en: {
        announcementBadge: "Verified",
        shortDescription,
        longDescription,
      },
      hu: {
        announcementBadge: "Ellenorzott",
        shortDescription,
        longDescription,
      },
      it: {
        announcementBadge: "Verificato",
        shortDescription,
        longDescription,
      },
    },
  };
}

async function persistDatacard(args, input) {
  const now = new Date().toISOString();
  const contentHash = hash(`${input.sourceUrl}\n${input.rawText}`);
  const datacard = {
    sourceId: `compare-${slugify(input.payload.name)}`,
    visitorKey: args.visitorKey,
    datacardType: "trusted_source_datacard",
    url: input.sourceUrl,
    canonicalUrl: input.sourceUrl,
    sourceKind: "official_site",
    trustTier: "trusted",
    sourceTitle: input.title || input.payload.name,
    entityKind: "provider",
    knownContentTypes: ["range"],
    industryRelevance: 1,
    locationRelevance: 1,
    extractionHints: [
      "Created by CHECK Local AI Compare source researcher.",
      `Official image source: ${input.officialImageUrl}`,
    ],
    extractedFacts: {
      title: input.payload.name,
      provider: input.payload.name,
      location: input.payload.address || input.payload.neighborhood,
      evidence: input.evidence,
    },
    publicDraftPayload: input.payload,
    autoPublishEligible: true,
    refreshCadenceDays: 14,
    lastCheckedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  const existing = await prisma.destinationSourceDocument.findFirst({
    where: {
      companyId: args.companyId,
      destinationInstanceId: args.destinationInstanceId,
      sourceType: "visitor_datacard",
      sourceUrl: input.sourceUrl,
    },
  });
  const data = {
    companyId: args.companyId,
    destinationInstanceId: args.destinationInstanceId,
    sourceType: "visitor_datacard",
    sourceUrl: input.sourceUrl,
    contentHash,
    rawText: input.rawText,
    metadata: { visitorSourceDatacard: datacard },
    fetchedAt: new Date(),
  };
  const row = existing
    ? await prisma.destinationSourceDocument.update({ where: { id: existing.id }, data })
    : await prisma.destinationSourceDocument.create({ data });
  return { row, datacard };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const liveUrls = await listLiveCompareUrls();
  const existingHosts = new Set([...liveUrls].map(hostOf));
  const queries = await buildQueries(existingHosts);
  const searchResults = (await harvestResearch(queries))
    .filter((item) => {
      const url = normalizeUrl(item.url);
      if (!url || liveUrls.has(url)) return false;
      const host = hostOf(url);
      return host && !existingHosts.has(host);
    });
  const uniqueResults = mergeCandidates(searchResults, liveUrls);

  const created = [];
  const skipped = [];
  for (const result of uniqueResults) {
    if (created.length >= args.limit) break;
    try {
      const html = await fetchHtml(result.url);
      const pageText = stripHtml(html);
      if (!candidateLooksRelevant(result) && !pageLooksRelevant(pageText)) {
        skipped.push({ url: result.url, reason: "page_missing_relevant_terms" });
        continue;
      }
      const imageCandidates = extractImageCandidates(html, result.url);
      if (imageCandidates.length === 0) {
        skipped.push({ url: result.url, reason: "no_official_image_candidate" });
        continue;
      }
      const extraction = await extractPublicDraftWithLocalAi({
        sourceUrl: result.url,
        title: result.title,
        pageText,
      });
      if (extraction.relevant !== true || Number(extraction.confidence || 0) < 0.65) {
        skipped.push({ url: result.url, reason: "local_ai_rejected", extraction });
        continue;
      }
      let uploadedImageUrl = "";
      let officialImageUrl = "";
      for (const imageUrl of imageCandidates) {
        try {
          uploadedImageUrl = await uploadOfficialImage(imageUrl);
          officialImageUrl = imageUrl;
          break;
        } catch {
          // Try the next official image candidate.
        }
      }
      if (!uploadedImageUrl) {
        skipped.push({ url: result.url, reason: "image_upload_failed" });
        continue;
      }
      const payload = buildPayloadFromExtraction(extraction, result.url, uploadedImageUrl);
      const persisted = await persistDatacard(args, {
        sourceUrl: result.url,
        title: result.title,
        rawText: pageText.slice(0, 20_000),
        evidence: asString(extraction.evidence) || result.snippet,
        officialImageUrl,
        payload,
      });
      created.push({
        sourceDocumentId: persisted.row.id,
        sourceUrl: result.url,
        name: payload.name,
        uploadedImageUrl,
      });
    } catch (error) {
      skipped.push({ url: result.url, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  console.log(JSON.stringify({
    ok: true,
    visitorKey: args.visitorKey,
    queryCount: queries.length,
    searchResultCount: searchResults.length,
    candidateCount: uniqueResults.length,
    createdCount: created.length,
    created,
    skipped: skipped.slice(0, 20),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(`[compare-research] failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
