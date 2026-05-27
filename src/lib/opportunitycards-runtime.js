const crypto = require("crypto");
const { computePriorityCohortProfiles } = require("./scoring-contract");
const {
  PLANNER_LANE_ORDER,
  PLANNER_LANE_TARGETS,
  canMoveTaskToLane,
  getLaneRank,
  getManualLaneFloorColumn,
  normalizeLane,
} = require("./planner-contract");
const {
  deriveOpportunityLane,
  normalizeOpportunityPayload,
  normalizeOpportunityType,
  opportunityTypeHashtag,
} = require("./opportunitycard-contract");
const { fetchUrlContent } = require("../../scripts/lib/fetcher");

const SALES_DEPARTMENT_KEY = "SALES";
const OPPORTUNITY_TYPE_OPTIONS = Object.freeze(["PROSPECT", "PARTNER", "RESELLER"]);
const ACTIVE_OPPORTUNITY_STATES = Object.freeze(["ACTIVE", "STALE", "EXPIRED"]);
const ACTIVE_OPPORTUNITY_STATUSES = Object.freeze(["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED", "REVIEW"]);
const OPPORTUNITY_PUBLIC_ID_SCOPE = "opportunity";
const TRANSACTION_SETTINGS = Object.freeze({
  maxWait: 10_000,
  timeout: 120_000,
});
const OPPORTUNITY_ACTIVE_STATUSES = Object.freeze(["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED", "REVIEW"]);

function normalizeText(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

function buildOpportunityFingerprint(input = {}) {
  const website = String(input.website || "").trim().toLowerCase();
  const companyName = String(input.companyName || "").trim().toLowerCase();
  const opportunityType = String(input.opportunityType || "PROSPECT").trim().toUpperCase();
  return crypto.createHash("sha1").update(`${website}|${companyName}|${opportunityType}`).digest("hex");
}

function mapOpportunityCandidateState(item) {
  const status = String(item?.processingStatus || "").toUpperCase();
  if (status === "ACCEPTED" || status === "VERIFIED") return "EVALUATED";
  if (status === "CHECKED" || status === "REVIEW") return "REFINED";
  return "GENERATED";
}

function compareOpportunityPromotionPriority(left, right) {
  const leftScore = Number(left?._priorityProfile?.score || 0);
  const rightScore = Number(right?._priorityProfile?.score || 0);
  if (rightScore !== leftScore) return rightScore - leftScore;
  if (Number(right?.iceScore || 0) !== Number(left?.iceScore || 0)) {
    return Number(right?.iceScore || 0) - Number(left?.iceScore || 0);
  }
  if (Number(right?.confidenceScore ?? right?.confidence ?? 0) !== Number(left?.confidenceScore ?? left?.confidence ?? 0)) {
    return Number(right?.confidenceScore ?? right?.confidence ?? 0) - Number(left?.confidenceScore ?? left?.confidence ?? 0);
  }
  return String(left?.title || "").localeCompare(String(right?.title || ""), "en", {
    sensitivity: "base",
    numeric: true,
  });
}

function assignOpportunityLanes(items, now = new Date()) {
  const assignments = new Map();
  const ranked = [...items].sort(compareOpportunityPromotionPriority);
  const laneCounts = Object.fromEntries(PLANNER_LANE_ORDER.map((lane) => [lane, 0]));

  for (const item of ranked) {
    const floorColumn = getManualLaneFloorColumn(item, now);
    if (floorColumn) {
      assignments.set(item.id, floorColumn);
      laneCounts[floorColumn] += 1;
      continue;
    }

    let assignedLane = "IDEABANK";
    for (const lane of PLANNER_LANE_ORDER) {
      if (!canMoveTaskToLane(item, lane, now)) continue;
      if (laneCounts[lane] < Number(PLANNER_LANE_TARGETS[lane] || 0)) {
        assignedLane = lane;
        break;
      }
    }

    assignments.set(item.id, assignedLane);
    laneCounts[assignedLane] += 1;
  }

  return assignments;
}

async function rebalanceOpportunitycardBoard(prisma, companyId) {
  const items = await prisma.opportunitycard.findMany({
    where: {
      companyId,
      departmentKey: SALES_DEPARTMENT_KEY,
      activityState: { in: ACTIVE_OPPORTUNITY_STATES },
      processingStatus: { in: OPPORTUNITY_ACTIVE_STATUSES },
    },
    orderBy: [{ updatedAt: "asc" }, { createdAt: "asc" }],
  });

  if (items.length === 0) {
    return { total: 0, updated: 0 };
  }

  const scoredProfiles = computePriorityCohortProfiles(
    items.map((item) => ({
      ...item,
      candidateState: mapOpportunityCandidateState(item),
    })),
  );
  const scoredItems = items.map((item, index) => ({
    ...item,
    _priorityProfile: scoredProfiles[index],
  }));
  const assignments = assignOpportunityLanes(scoredItems);
  const laneBuckets = new Map(PLANNER_LANE_ORDER.map((lane) => [lane, []]));

  for (const item of scoredItems) {
    const lane = normalizeLane(assignments.get(item.id) || item.kanbanColumn || "IDEABANK");
    laneBuckets.get(lane).push(item);
  }

  let updated = 0;
  for (const lane of PLANNER_LANE_ORDER) {
    const laneItems = laneBuckets.get(lane).slice().sort((left, right) => {
      const leftManual = Number(left.sortOrder || 0) < 0;
      const rightManual = Number(right.sortOrder || 0) < 0;
      if (leftManual && rightManual && Number(left.sortOrder || 0) !== Number(right.sortOrder || 0)) {
        return Number(left.sortOrder || 0) - Number(right.sortOrder || 0);
      }
      if (leftManual !== rightManual) return leftManual ? -1 : 1;
      return compareOpportunityPromotionPriority(left, right);
    });

    for (const [index, item] of laneItems.entries()) {
      const nextSortOrder = Number(item.sortOrder || 0) < 0 ? Number(item.sortOrder) : index + 1;
      if (item.kanbanColumn === lane && Number(item.sortOrder || 0) === Number(nextSortOrder)) continue;
      await prisma.opportunitycard.update({
        where: { id: item.id },
        data: {
          kanbanColumn: lane,
          sortOrder: nextSortOrder,
        },
      });
      updated += 1;
    }
  }

  return { total: items.length, updated };
}

function domainFromUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value).startsWith("http") ? String(value) : `https://${value}`);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function titleCaseHost(host) {
  if (!host) return null;
  return host
    .split(".")[0]
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function canonicalizeCandidateName(value) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  let cleaned = normalized
    .replace(/^@+/, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  if (!/\s/.test(cleaned) && /^[a-z0-9]+$/i.test(cleaned)) {
    cleaned = segmentCompactCompanySlug(cleaned);
  }
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const COMPACT_COMPANY_SUFFIX_TOKENS = Object.freeze([
  "academy",
  "training",
  "consulting",
  "solutions",
  "services",
  "partners",
  "marketing",
  "technical",
  "software",
  "football",
  "private",
  "digital",
  "soccer",
  "coaching",
  "camp",
  "camps",
  "school",
  "studio",
  "skills",
  "group",
  "agency",
  "club",
  "labs",
  "tech",
]);

function segmentCompactCompanySlug(value) {
  const compact = String(value || "").trim().toLowerCase();
  if (!compact || compact.length < 6) return value;

  const parts = [];
  let remaining = compact;
  const tokens = [...COMPACT_COMPANY_SUFFIX_TOKENS].sort((left, right) => right.length - left.length);

  while (remaining.length >= 4) {
    const match = tokens.find((token) => remaining.endsWith(token) && remaining.length > token.length + 1);
    if (!match) break;
    parts.unshift(match);
    remaining = remaining.slice(0, -match.length);
  }

  if (parts.length === 0) {
    return value;
  }

  if (remaining.length >= 2) {
    parts.unshift(remaining);
  }

  return parts.join(" ");
}

const GENERIC_COMPANY_NAME_RE = /\b(?:top\s+\d+|best\s+\d+|job|jobs|career|careers|profile|people|person|list|directory|roundup|guide|playbook|template|comparison|compare|alternatives|competitors?|market|news|blog|article|post|research|report|brief)\b/i;
const COMPANY_NAME_SUFFIX_RE = /\b(?:inc|llc|ltd|gmbh|sarl|oy|bv|corp|co|company|group|labs|systems|software|solutions|technologies|tech|platform|partners|services|agency|studio|ventures)\b/i;
const GENERIC_HOST_LABEL_RE = /^(?:www|app|docs|blog|news|help|support|learn|resources|developers?)$/i;
const SOCIAL_PLATFORM_HOSTS = new Set([
  "instagram.com",
  "linkedin.com",
  "linkedin.cn",
  "facebook.com",
  "x.com",
  "twitter.com",
  "tiktok.com",
  "youtube.com",
]);
const GENERIC_SOURCE_HOSTS = new Set([
  "wikipedia.org",
  "en.wikipedia.org",
  "investopedia.com",
  "forbes.com",
  "coursera.org",
  "bbc.co.uk",
  "bbc.com",
  "index.hr",
  "jutarnji.hr",
  "24sata.hr",
  "net.hr",
  "educationnews.co.ke",
]);
const SERVICE_BRAND_NAMES = new Set([
  "instagram",
  "linkedin",
  "facebook",
  "x",
  "twitter",
  "tiktok",
  "youtube",
]);
const PRODUCT_BRAND_NAMES = new Set([
  "chatgpt",
  "copilot",
  "gemini",
  "grok",
]);

function looksCompanyLikeName(value) {
  const normalized = canonicalizeCandidateName(value);
  if (!normalized) return false;
  if (normalized.length < 2 || normalized.length > 80) return false;
  if (/[|:]/.test(normalized)) return false;
  if (GENERIC_COMPANY_NAME_RE.test(normalized)) return false;
  if (SERVICE_BRAND_NAMES.has(normalized.toLowerCase())) return false;
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length > 6 && !COMPANY_NAME_SUFFIX_RE.test(normalized)) return false;
  return true;
}

function parseUrl(value) {
  if (!value) return null;
  try {
    return new URL(String(value).startsWith("http") ? String(value) : `https://${value}`);
  } catch {
    return null;
  }
}

function deriveCompanyNameFromHost(host) {
  if (!host) return null;
  const firstLabel = host.split(".")[0] || "";
  if (!firstLabel || GENERIC_HOST_LABEL_RE.test(firstLabel)) return null;
  const title = titleCaseHost(firstLabel);
  return looksCompanyLikeName(title) ? title : null;
}

function deriveCompanyNameFromSocialProfile(urlValue) {
  const url = parseUrl(urlValue);
  if (!url) return null;
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (!SOCIAL_PLATFORM_HOSTS.has(host)) return null;
  const profileSegment = url.pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .find((segment) => !segment.startsWith("@"));
  if (!profileSegment) return null;
  const title = canonicalizeCandidateName(profileSegment);
  return looksCompanyLikeName(title) ? title : null;
}

function resolveCandidateCompanyName(record, host, website) {
  const candidates = [
    record?.companyName,
    record?.entityTag,
    record?.title,
    record?.sourceName,
    deriveCompanyNameFromSocialProfile(website),
    deriveCompanyNameFromHost(host),
  ];

  for (const candidate of candidates) {
    const normalized = canonicalizeCandidateName(candidate);
    if (!looksCompanyLikeName(normalized)) continue;
    return normalized;
  }

  return null;
}

function normalizeEvidenceRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function buildOpportunityEvidence(record) {
  const metadata = normalizeEvidenceRecord(record?.metadata);
  const query = normalizeText(metadata?.query);
  const searchDomain = domainFromUrl(metadata?.searchDomain) || domainFromUrl(record?.website) || domainFromUrl(record?.provenance);
  const sourceUrl = normalizeText(metadata?.url) || normalizeText(record?.provenance);
  const harvestedAt = normalizeText(metadata?.harvestedAt);
  if (!query && !searchDomain && !sourceUrl && !record?.sourceId && !record?.flashcardId) {
    return null;
  }
  return {
    sourceId: record?.sourceId || null,
    flashcardId: record?.flashcardId || null,
    query,
    searchDomain,
    sourceUrl,
    harvestedAt,
  };
}

function extractUrls(text) {
  const matches = String(text || "").match(/https?:\/\/[^\s)]+/g) || [];
  return Array.from(new Set(matches));
}

function extractEmails(text) {
  const matches = String(text || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return Array.from(new Set(matches.map((value) => value.trim().toLowerCase())));
}

function extractPhones(text) {
  const matches = String(text || "").match(/(?:\+?\d[\d\s().-]{6,}\d)/g) || [];
  return Array.from(new Set(matches.map((value) => normalizeText(value)).filter(Boolean)));
}

function extractAddressCandidate(text) {
  const lines = String(text || "")
    .split(/[\n|]/g)
    .map((line) => normalizeText(line))
    .filter(Boolean);
  return lines.find((line) => /\b(?:street|st\.?|road|rd\.?|avenue|ave\.?|boulevard|blvd\.?|lane|ln\.?|drive|dr\.?|suite|unit|floor|building)\b/i.test(line)) || null;
}

function extractLocationCandidate(text) {
  const normalized = String(text || " ");
  const cityStateMatch = normalized.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/);
  if (cityStateMatch?.[1]) {
    return normalizeText(cityStateMatch[1]);
  }
  const locationMatch = normalized.match(/\b(usa|united states|uk|united kingdom|hungary|romania|germany|france|spain|italy|canada|australia|florida|miami|new york|texas|california)\b/i);
  return normalizeText(locationMatch?.[1] || null);
}

function looksWeakOpportunityBody(value) {
  const normalized = normalizeText(value);
  if (!normalized) return true;
  if (normalized.length < 40) return true;
  if (/^https?:\/\/\S+\s+[A-Z][a-z]+$/i.test(normalized)) return true;
  if (/instagram|linkedin|facebook|twitter|tiktok|youtube/i.test(normalized) && normalized.includes("http")) return true;
  return false;
}

function looksWeakOpportunityFit(value) {
  const normalized = normalizeText(value);
  if (!normalized) return true;
  if (/observed location: .*offers/i.test(normalized)) return true;
  return /^(?:relevant to|possible fit for)\s+#?[a-z0-9_-]+$/i.test(normalized);
}

function looksWeakOpportunityLocation(value) {
  const normalized = normalizeText(value);
  if (!normalized) return true;
  if (normalized.length > 80) return true;
  if (/https?:\/\//i.test(normalized)) return true;
  if (/\boffers\b/i.test(normalized)) return true;
  return false;
}

function normalizeOpportunityContactRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const email = normalizeText(value.email)?.toLowerCase() || null;
  const phone = normalizeText(value.phone) || null;
  const address = normalizeText(value.address) || null;
  return Object.fromEntries(
    Object.entries({
      ...value,
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
      ...(address ? { address } : {}),
    }).filter(([, entry]) => entry !== null && entry !== undefined && entry !== ""),
  );
}

function normalizeMeaningfulBusinessContext(value) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (/^#?[a-z0-9_-]+$/i.test(normalized) && /industry|targetmarket|market|segment|audience/i.test(normalized)) {
    return null;
  }
  if (/^(?:unknown|n\/a|na|none)$/i.test(normalized)) {
    return null;
  }
  if (normalized.length > 80) {
    return null;
  }
  if (/\boffers\b/i.test(normalized) || /https?:\/\//i.test(normalized)) {
    return null;
  }
  return normalized;
}

function buildOpportunityRefreshFocus(item) {
  const contactInfo = normalizeOpportunityContactRecord(item?.contactInfo);
  const missing = [];
  const weak = [];

  if (looksWeakOpportunityBody(item?.body)) missing.push("description");
  if (!normalizeText(item?.coreOffer)) missing.push("coreOffer");
  if (looksWeakOpportunityFit(item?.fitRationale)) missing.push("fitRationale");
  if (!normalizeText(item?.location)) missing.push("location");
  if (!contactInfo.email) missing.push("email");
  if (!contactInfo.phone) missing.push("phone");
  if (!contactInfo.address) missing.push("address");

  if (normalizeText(item?.companyName) && !/\s/.test(String(item.companyName)) && /(?:academy|training|soccer|football|consulting|solutions|services|partners|studio|marketing|school|club|coaching)$/i.test(String(item.companyName))) {
    weak.push("companyName");
  }
  if (looksWeakOpportunityBody(item?.coreOffer)) weak.push("coreOffer");
  if (looksWeakOpportunityFit(item?.fitRationale)) weak.push("fitRationale");

  return {
    missing,
    weak,
  };
}

function deriveOpportunitySocialUrls(website) {
  const url = parseUrl(website);
  if (!url) return {};
  const href = url.href;
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "instagram.com") return { instagramUrl: href };
  if (host === "linkedin.com" || host === "linkedin.cn") return { linkedinUrl: href };
  if (host === "facebook.com") return { facebookUrl: href };
  if (host === "x.com" || host === "twitter.com") return { xUrl: href };
  return {};
}

function buildOpportunityFieldEvidence(item, fetchedPage, refreshFocus, companyName) {
  const textParts = [
    fetchedPage?.title,
    fetchedPage?.content,
    item?.body,
    item?.coreOffer,
    item?.fitRationale,
  ].filter(Boolean);
  const sourceText = textParts.join("\n");
  const emails = extractEmails(sourceText);
  const phones = extractPhones(sourceText);
  const address = extractAddressCandidate(sourceText);
  const location = extractLocationCandidate(sourceText);
  const hashtagTerms = Array.isArray(item?.hashtags)
    ? item.hashtags.map((value) => normalizeText(String(value).replace(/^#/, ""))).filter(Boolean)
    : [];
  const hashtagLocation = hashtagTerms.find((term) =>
    /^(?:usa|united states|uk|united kingdom|hungary|romania|germany|france|spain|italy|canada|australia|florida|miami|new york|texas|california)$/i.test(term),
  ) || null;
  const normalizedFetchTitle = normalizeText(fetchedPage?.title);
  const isWeakFetchTitle = normalizedFetchTitle && SERVICE_BRAND_NAMES.has(normalizedFetchTitle.toLowerCase());
  const fallbackOffer =
    hashtagTerms.length > 0
      ? `${companyName} offers ${hashtagTerms.slice(0, 4).join(", ")} services.`
      : `${companyName} operates through a company-owned social profile and needs deeper qualification.`;
  const coreOfferCandidate = normalizeText(
    normalizedFetchTitle && companyName && !isWeakFetchTitle
      ? `${companyName}: ${normalizedFetchTitle}`
      : fallbackOffer,
  );
  const descriptionCandidate = normalizeText(fetchedPage?.content)?.slice(0, 1400) || null;

  return {
    descriptionCandidate,
    coreOfferCandidate,
    emails,
    phones,
    address,
    location: location || hashtagLocation,
    refreshFocus,
  };
}

function inferOpportunityType(text) {
  const normalized = String(text || "").toLowerCase();
  if (/\breseller|distributor|affiliate\b/.test(normalized)) return "RESELLER";
  if (/\bpartner|integration partner|channel partner|alliance\b/.test(normalized)) return "PARTNER";
  return "PROSPECT";
}

function buildOpportunitySeedFromRecord(record, company) {
  const urls = [
    ...extractUrls(record?.body),
    ...extractUrls(record?.provenance),
    ...(record?.website ? [record.website] : []),
  ];
  const website = urls[0] || record?.website || null;
  const host = domainFromUrl(website);
  const ownDomain = domainFromUrl(company?.website);
  if (host && ownDomain && host === ownDomain) {
    return null;
  }
  if (host && (GENERIC_SOURCE_HOSTS.has(host) || /\.(?:gov|edu)(?:\.[a-z]{2})?$/i.test(host))) {
    return null;
  }

  const sourceText = [record?.title, record?.body, record?.sourceName, record?.provenance].filter(Boolean).join("\n");
  const normalizedTitle = normalizeText(record?.title || "");
  if (/^(?:what is|what are|learn|guide|news|sport|sports|e-commerce|artificial intelligence)\b/i.test(normalizedTitle)) {
    return null;
  }
  if (GENERIC_COMPANY_NAME_RE.test(normalizedTitle)) {
    return null;
  }
  if (website) {
    const url = parseUrl(website);
    const pathname = normalizeText(url?.pathname || "");
    if (/^\/(?:wiki|blog|news|sport|sports|articles?|learn|guide|category|search)(?:\/|$)/i.test(pathname)) {
      return null;
    }
  }
  const companyName = resolveCandidateCompanyName(record, host, website);
  if (!companyName || normalizeText(companyName)?.toLowerCase() === normalizeText(company?.name)?.toLowerCase()) {
    return null;
  }
  if (PRODUCT_BRAND_NAMES.has(companyName.toLowerCase())) {
    return null;
  }

  if (!website && !looksCompanyLikeName(companyName)) {
    return null;
  }

  const opportunityType = normalizeOpportunityType(inferOpportunityType(sourceText));
  const fitSignals = [
    company?.industry ? `Relevant to ${company.industry}` : null,
    company?.targetMarket ? `Possible fit for ${company.targetMarket}` : null,
    opportunityType === "PARTNER" ? "Potential partner relationship" : null,
    opportunityType === "RESELLER" ? "Potential reseller channel" : null,
  ].filter(Boolean);
  const fitRationale = fitSignals.length > 0
    ? fitSignals.join(" · ")
    : "Possible company lead based on current research signals.";
  const impact = company?.targetMarket && sourceText.toLowerCase().includes(String(company.targetMarket).toLowerCase()) ? 8 : 6;
  const confidence = website ? 7 : 5;
  const weight = urls.length > 1 ? 7 : 5;

  if (!website && confidence < 6) {
    return null;
  }

  return {
    ...normalizeOpportunityPayload({
    title: companyName,
    body: sourceText.slice(0, 1400) || fitRationale,
    companyName,
    website,
    location: record?.location || null,
    coreOffer: sourceText.slice(0, 280),
    fitRationale,
    opportunityType,
    hashtags: record?.hashtags || [],
    impact,
    confidence,
    confidenceScore: confidence,
    weight,
    }),
    evidence: buildOpportunityEvidence(record),
  };
}

async function reservePublicIds(tx, scope, count) {
  if (count <= 0) return [];

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

async function nextOpportunityPublicId(tx) {
  const [publicId] = await reservePublicIds(tx, OPPORTUNITY_PUBLIC_ID_SCOPE, 1);
  return publicId;
}

async function mineOpportunitycards(prisma, companyId) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      industry: true,
      targetMarket: true,
      website: true,
    },
  });

  if (!company) {
    return { created: 0, updated: 0, discovered: 0 };
  }

  const [sources, flashcards] = await Promise.all([
    prisma.source.findMany({
      where: {
        companyId,
        OR: [
          { departmentKey: SALES_DEPARTMENT_KEY },
          { intelligenceType: "COMPETITOR" },
        ],
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 50,
      select: {
        id: true,
        content: true,
        provenance: true,
        hashtags: true,
        entityTag: true,
        metadata: true,
        departmentKey: true,
        updatedAt: true,
      },
    }),
    prisma.flashcard.findMany({
      where: {
        companyId,
        activityState: { in: ["ACTIVE", "STALE"] },
        OR: [
          { departmentKey: SALES_DEPARTMENT_KEY },
          { intelligenceType: "COMPETITOR" },
        ],
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 50,
      include: {
        sources: {
          orderBy: [{ createdAt: "asc" }],
        },
      },
    }),
  ]);

  const seeds = [
    ...sources.map((source) =>
      buildOpportunitySeedFromRecord(
        {
          title: source.entityTag,
          body: source.content,
          provenance: source.provenance,
          sourceName: source.provenance,
          sourceId: source.id,
          metadata: source.metadata,
          hashtags: source.hashtags,
        },
        company,
      ),
    ),
    ...flashcards.map((flashcard) =>
      buildOpportunitySeedFromRecord(
        {
          title: flashcard.title,
          body: flashcard.body,
          provenance: flashcard.sources[0]?.sourceName || null,
          sourceName: flashcard.title,
          flashcardId: flashcard.id,
          website: null,
          hashtags: flashcard.hashtags,
        },
        company,
      ),
    ),
  ].filter(Boolean);

  const uniqueSeeds = Array.from(
    new Map(
      seeds.map((seed) => {
        const fingerprint = buildOpportunityFingerprint({
          website: seed.website,
          companyName: seed.companyName,
          opportunityType: seed.opportunityType,
        });
        return [fingerprint, { ...seed, fingerprint }];
      }),
    ).values(),
  );

  let created = 0;
  let updated = 0;
  const createdByQuery = {};
  const updatedByQuery = {};

  await prisma.$transaction(async (tx) => {
    for (const seed of uniqueSeeds) {
      const existing = await tx.opportunitycard.findFirst({
        where: {
          companyId,
          fingerprint: seed.fingerprint,
        },
      });

      if (existing) {
        const query = normalizeText(seed.evidence?.query);
        await tx.opportunitycard.update({
          where: { id: existing.id },
          data: {
            companyName: seed.companyName,
            title: seed.title,
            body: seed.body,
            website: existing.website || seed.website,
            location: existing.location || seed.location,
            coreOffer: existing.coreOffer || seed.coreOffer,
            financialBackground: existing.financialBackground || seed.financialBackground,
            fitRationale: existing.fitRationale || seed.fitRationale,
            opportunityType: seed.opportunityType,
            confidence: seed.confidence,
            confidenceScore: seed.confidenceScore,
            impact: seed.impact,
            weight: seed.weight,
            iceScore: seed.iceScore,
            scoreProfile: seed.scoreProfile,
            evidence: {
              ...(normalizeEvidenceRecord(existing.evidence) || {}),
              ...(seed.evidence ? { leadDiscovery: seed.evidence } : {}),
            },
            hashtags: Array.from(new Set([...(existing.hashtags || []), ...(seed.hashtags || [])])),
            departmentKey: SALES_DEPARTMENT_KEY,
            refreshedAt: new Date(),
            processingStatus: existing.processingStatus === "DECLINED" ? existing.processingStatus : "CHECKED",
            kanbanColumn: existing.manualLaneOverrideAt ? existing.kanbanColumn : existing.kanbanColumn,
          },
        });
        updated += 1;
        if (query) {
          updatedByQuery[query] = Number(updatedByQuery[query] || 0) + 1;
        }
        continue;
      }

      const publicId = await nextOpportunityPublicId(tx);
      const query = normalizeText(seed.evidence?.query);
      await tx.opportunitycard.create({
        data: {
          publicId,
          companyId,
          companyName: seed.companyName,
          title: seed.title,
          body: seed.body,
          website: seed.website,
          linkedinUrl: seed.linkedinUrl,
          instagramUrl: seed.instagramUrl,
          facebookUrl: seed.facebookUrl,
          xUrl: seed.xUrl,
          location: seed.location,
          coreOffer: seed.coreOffer,
          financialBackground: seed.financialBackground,
          fitRationale: seed.fitRationale,
          opportunityType: seed.opportunityType,
          departmentKey: SALES_DEPARTMENT_KEY,
          confidence: seed.confidence,
          confidenceScore: seed.confidenceScore,
          impact: seed.impact,
          weight: seed.weight,
          iceScore: seed.iceScore,
          hashtags: seed.hashtags,
          salesGeographies: seed.salesGeographies,
          contactInfo: seed.contactInfo,
          scoreProfile: seed.scoreProfile,
          evidence: {
            minedAt: new Date().toISOString(),
            strategy: "heuristic-opportunity-miner",
            ...(seed.evidence ? { leadDiscovery: seed.evidence } : {}),
          },
          fingerprint: seed.fingerprint,
          kanbanColumn: "IDEABANK",
          processingStatus: "DRAFT",
          activityState: "STALE",
          generatedAt: new Date(),
          refreshedAt: new Date(),
        },
      });
      created += 1;
      if (query) {
        createdByQuery[query] = Number(createdByQuery[query] || 0) + 1;
      }
    }
  }, TRANSACTION_SETTINGS);

  await rebalanceOpportunitycardBoard(prisma, companyId);
  return { created, updated, discovered: uniqueSeeds.length, createdByQuery, updatedByQuery };
}

function resolveOpportunityMaintenanceTake(executionOptions = {}) {
  const override = executionOptions?.countOverrides?.opportunitycards;
  if (Number.isFinite(override)) {
    return Math.max(1, Math.min(3, Number(override)));
  }
  return 2;
}

async function refreshOldestOpportunitycards(prisma, company = null, refreshedAt = new Date(), executionOptions = {}) {
  const take = resolveOpportunityMaintenanceTake(executionOptions);
  const skip = Number.isFinite(executionOptions?.selectionOffset)
    ? Math.max(0, Number(executionOptions.selectionOffset))
    : 0;

  const items = await prisma.opportunitycard.findMany({
    where: {
      ...(company?.id ? { companyId: company.id } : {}),
      departmentKey: SALES_DEPARTMENT_KEY,
      activityState: { in: ACTIVE_OPPORTUNITY_STATES },
      processingStatus: { in: ACTIVE_OPPORTUNITY_STATUSES },
    },
    orderBy: [
      { updatedAt: "asc" },
      { createdAt: "asc" },
    ],
    skip,
    take,
  });

  const touchedCompanyIds = new Set();
  for (const item of items) {
    await refreshOpportunitycard(prisma, item, company, refreshedAt);
    touchedCompanyIds.add(item.companyId);
  }

  for (const companyId of touchedCompanyIds) {
    await rebalanceOpportunitycardBoard(prisma, companyId);
  }

  return items;
}

async function refreshOpportunitycard(prisma, item, company = null, refreshedAt = new Date()) {
  const refreshFocus = buildOpportunityRefreshFocus(item);
  const website = normalizeText(item.website);
  const fetchedPage =
    website && /^https?:\/\//i.test(website)
      ? await fetchUrlContent(website).catch(() => null)
      : null;
  const fieldEvidence = buildOpportunityFieldEvidence(
    item,
    fetchedPage?.status === 200 ? fetchedPage : null,
    refreshFocus,
    canonicalizeCandidateName(item.companyName) || item.companyName,
  );
  const contactInfo = normalizeOpportunityContactRecord(item.contactInfo);
  const refinedContactInfo = normalizeOpportunityContactRecord({
    ...contactInfo,
    ...(contactInfo.email ? {} : { email: fieldEvidence.emails[0] || null }),
    ...(contactInfo.phone ? {} : { phone: fieldEvidence.phones[0] || null }),
    ...(contactInfo.address ? {} : { address: fieldEvidence.address || null }),
  });
  const socialUrls = deriveOpportunitySocialUrls(website);
  const refreshedBody =
    looksWeakOpportunityBody(item.body) && fieldEvidence.descriptionCandidate
      ? fieldEvidence.descriptionCandidate
      : item.body;
  const refreshedCoreOffer =
    (!normalizeText(item.coreOffer) || looksWeakOpportunityBody(item.coreOffer)) && fieldEvidence.coreOfferCandidate
      ? fieldEvidence.coreOfferCandidate
      : item.coreOffer;
  const refreshedFit =
    looksWeakOpportunityFit(item.fitRationale)
      ? [
          normalizeMeaningfulBusinessContext(company?.industry) ? `Relevant to ${normalizeMeaningfulBusinessContext(company?.industry)}` : null,
          normalizeMeaningfulBusinessContext(company?.targetMarket) ? `Possible fit for ${normalizeMeaningfulBusinessContext(company?.targetMarket)}` : null,
          normalizeText(fieldEvidence.location) ? `Observed location: ${fieldEvidence.location}` : null,
          !normalizeMeaningfulBusinessContext(company?.industry) && !normalizeMeaningfulBusinessContext(company?.targetMarket)
            ? "Discovered from a company-owned profile and requires qualification against target market."
            : null,
        ].filter(Boolean).join(" · ") || item.fitRationale
      : item.fitRationale;
  const refreshedLocation =
    !looksWeakOpportunityLocation(item.location)
      ? normalizeText(item.location)
      : fieldEvidence.location || null;
  const refreshedCompanyName = canonicalizeCandidateName(item.companyName) || item.companyName;
  const refreshedTitle = canonicalizeCandidateName(item.title) || refreshedCompanyName || item.title;
  const normalized = normalizeOpportunityPayload({
    companyName: refreshedCompanyName,
    title: refreshedTitle,
    body: refreshedBody,
    website: item.website,
    linkedinUrl: item.linkedinUrl || socialUrls.linkedinUrl,
    instagramUrl: item.instagramUrl || socialUrls.instagramUrl,
    facebookUrl: item.facebookUrl || socialUrls.facebookUrl,
    xUrl: item.xUrl || socialUrls.xUrl,
    location: refreshedLocation,
    coreOffer: refreshedCoreOffer,
    financialBackground: item.financialBackground,
    fitRationale: refreshedFit,
    opportunityType: item.opportunityType,
    hashtags: item.hashtags,
    salesGeographies: item.salesGeographies,
    contactInfo: refinedContactInfo,
    impact: item.impact,
    confidence: item.confidenceScore ?? item.confidence,
    confidenceScore: item.confidenceScore ?? item.confidence,
    weight: item.weight,
  });

  await prisma.opportunitycard.update({
    where: { id: item.id },
    data: {
      companyName: normalized.companyName,
      title: normalized.title,
      body: normalized.body,
      website: normalized.website,
      linkedinUrl: normalized.linkedinUrl,
      instagramUrl: normalized.instagramUrl,
      facebookUrl: normalized.facebookUrl,
      xUrl: normalized.xUrl,
      location: normalized.location,
      coreOffer: normalized.coreOffer,
      financialBackground: normalized.financialBackground,
      fitRationale: normalized.fitRationale,
      opportunityType: normalized.opportunityType,
      confidence: normalized.confidence,
      confidenceScore: normalized.confidenceScore,
      impact: normalized.impact,
      weight: normalized.weight,
      iceScore: normalized.iceScore,
      hashtags: normalized.hashtags,
      salesGeographies: normalized.salesGeographies,
      contactInfo: normalized.contactInfo,
      departmentKey: SALES_DEPARTMENT_KEY,
      scoreProfile: normalized.scoreProfile,
      evidence: {
        ...(normalizeEvidenceRecord(item.evidence) || {}),
        maintenanceFocus: {
          refreshedAt: refreshedAt.toISOString(),
          missing: refreshFocus.missing,
          weak: refreshFocus.weak,
          fetchedStatus: fetchedPage?.status || null,
          fetchedTitle: normalizeText(fetchedPage?.title) || null,
          enrichedFields: {
            companyName: refreshedCompanyName !== item.companyName,
            title: refreshedTitle !== item.title,
            description: normalized.body !== item.body,
            coreOffer: normalized.coreOffer !== item.coreOffer,
            fitRationale: normalized.fitRationale !== item.fitRationale,
            location: normalized.location !== item.location,
            email: normalizeText(normalized.contactInfo?.email) !== normalizeText(item.contactInfo?.email),
            phone: normalizeText(normalized.contactInfo?.phone) !== normalizeText(item.contactInfo?.phone),
            address: normalizeText(normalized.contactInfo?.address) !== normalizeText(item.contactInfo?.address),
          },
        },
      },
      refreshedAt,
      kanbanColumn: item.manualLaneOverrideAt ? item.kanbanColumn : item.kanbanColumn,
    },
  });
}

module.exports = {
  SALES_DEPARTMENT_KEY,
  OPPORTUNITY_TYPE_OPTIONS,
  ACTIVE_OPPORTUNITY_STATES,
  ACTIVE_OPPORTUNITY_STATUSES,
  buildOpportunityFingerprint,
  looksCompanyLikeName,
  opportunityTypeHashtag,
  deriveOpportunityLane,
  normalizeOpportunityPayload,
  rebalanceOpportunitycardBoard,
  buildOpportunitySeedFromRecord,
  mineOpportunitycards,
  refreshOpportunitycard,
  refreshOldestOpportunitycards,
};
