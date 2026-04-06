type UrlInsight = {
  url: string;
  finalUrl: string;
  title: string | null;
  description: string | null;
  headings: string[];
  bullets: string[];
  textSnippet: string | null;
};

type ProductSeed = {
  name?: string | null;
  description?: string | null;
  pricing?: string | null;
  features?: string[];
  urls?: string[];
  watchedContent?: unknown;
};

type CompetitorSeed = {
  name?: string | null;
  pricing?: string | null;
  strengths?: string[];
  weaknesses?: string[];
  positioning?: string | null;
  urls?: string[];
  watchedContent?: unknown;
};

type NewsSignal = {
  title: string;
  source: string | null;
  publishedAt: string | null;
  link: string | null;
};

type SearchSignal = {
  title: string;
  snippet: string | null;
  link: string | null;
};

type StockSignal = {
  ticker: string;
  currency: string | null;
  price: number | null;
  changePercent: number | null;
};

type RawSourceInput = {
  name: string;
  urls: string[];
};

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "deepseek-r1:1.5b";
const FETCH_TIMEOUT_MS = 5000;
const OLLAMA_TIMEOUT_MS = 4000;
const MAX_HTML_BYTES = 500_000;
const MAX_TEXT_LENGTH = 4000;
const MAX_NEWS_ITEMS = 4;
const MAX_SEARCH_ITEMS = 5;
const PRICE_PATTERN =
  /(?:\$|EUR|USD|GBP)\s?\d[\d,.]*(?:\s*\/\s*(?:mo|month|yr|year|user))?|free\b|trial\b|pricing\b/i;
const TICKER_PATTERN = /\b(?:NASDAQ|NYSE|AMEX|LSE|TSX)[:\s]+([A-Z.\-]{1,6})\b/;
const VALID_HOSTNAME_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const GENERIC_NAV_LABELS = new Set([
  "about",
  "about us",
  "home",
  "faq",
  "contact",
  "contact us",
  "services",
  "membership",
  "memberships",
  "membership and services",
  "our methodology",
  "methodology",
  "where are we",
  "why spl",
  "quick links",
  "programs",
  "the movement",
  "our services",
  "about isds",
  "private training 1on1",
  "pricing",
  "login",
  "log in",
  "sign up",
  "sign in",
  "privacy policy",
  "terms",
]);
const LOW_VALUE_FLASHCARD_PHRASES = [
  "compare this competitor's headline claims against our product's proof points",
  "expect messaging and packaging to keep shifting",
  "the competitor is competing in an automation-heavy category",
  "feature velocity matters",
  "pressure-test whether the headline capabilities are differentiated enough",
];
const PLATFORM_HOST_RULES: Array<{
  hostPattern: RegExp;
  platformName: string;
  shellPhrases: string[];
}> = [
  {
    hostPattern: /(^|\.)instagram\.com$/i,
    platformName: "Instagram",
    shellPhrases: ["create an account", "log in to instagram", "share what you're into"],
  },
  {
    hostPattern: /(^|\.)tiktok\.com$/i,
    platformName: "TikTok",
    shellPhrases: ["make your day", "watch, follow, and discover"],
  },
  {
    hostPattern: /(^|\.)facebook\.com$/i,
    platformName: "Facebook",
    shellPhrases: ["log into facebook", "connect with friends"],
  },
];

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripTags(value: string) {
  return collapseWhitespace(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#8211;/gi, "–")
    .replace(/&#8212;/gi, "—")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function textFromMatch(match: RegExpExecArray | null) {
  return match ? collapseWhitespace(decodeHtml(stripTags(match[1] ?? ""))) : null;
}

function collectTagContents(html: string, tagName: string, maxItems = 6) {
  const regex = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  const items: string[] = [];
  let match: RegExpExecArray | null = null;

  while ((match = regex.exec(html)) && items.length < maxItems) {
    const text = textFromMatch(match);
    if (text && !items.includes(text)) {
      items.push(text);
    }
  }

  return items;
}

function extractMetaContent(html: string, key: string) {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:name|property)=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${key}["'][^>]*>`,
      "i",
    ),
  ];

  for (const pattern of patterns) {
    const content = textFromMatch(pattern.exec(html));
    if (content) {
      return content;
    }
  }

  return null;
}

function canonicalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }
    if (!VALID_HOSTNAME_PATTERN.test(url.hostname)) {
      return null;
    }

    url.hash = "";
    if (url.pathname === "/") {
      url.pathname = "";
    }
    url.hostname = url.hostname.toLowerCase();

    return url.toString();
  } catch {
    return null;
  }
}

function normalizeUrlList(values: string[]) {
  return uniqueShortStrings(values.map(canonicalizeUrl), 5);
}

function deriveNameFromUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.replace(/^www\./, "");
    const base = hostname.split(".")[0] || hostname;
    return base
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  } catch {
    return value;
  }
}

function looksLikeUrl(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  return Boolean(canonicalizeUrl(value));
}

export function looksSuspiciousSourceName(value: string | null | undefined) {
  const cleaned = cleanCandidateText(value);
  return (
    !!cleaned &&
    (/^ww\d+$/i.test(cleaned) ||
      cleaned.length <= 3 ||
      /^[a-z0-9]+$/i.test(cleaned))
  );
}

function getHostRule(url: string) {
  try {
    const hostname = new URL(url).hostname;
    return PLATFORM_HOST_RULES.find((rule) => rule.hostPattern.test(hostname)) ?? null;
  } catch {
    return null;
  }
}

function getUrlHandle(url: string) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const handle = parts[0];
    if (!handle || ["p", "reel", "share", "explore", "accounts"].includes(handle.toLowerCase())) {
      return null;
    }

    return handle.replace(/^@/, "");
  } catch {
    return null;
  }
}

function prettifyHandle(value: string | null) {
  if (!value) {
    return null;
  }

  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

async function fetchUrlInsight(url: string): Promise<UrlInsight | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent":
          "ChecklistLocalAI/1.0 (+https://checklist.messmass.com; source enrichment crawler)",
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") || "";
    if (!/text\/html|text\/plain|application\/xhtml\+xml/i.test(contentType)) {
      return null;
    }

    const rawText = await response.text();
    const html = rawText.slice(0, MAX_HTML_BYTES);
    const title = textFromMatch(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html));
    const description =
      extractMetaContent(html, "description") ||
      extractMetaContent(html, "og:description") ||
      extractMetaContent(html, "twitter:description");
    const headings = [
      ...collectTagContents(html, "h1", 2),
      ...collectTagContents(html, "h2", 4),
      ...collectTagContents(html, "h3", 4),
    ].slice(0, 6);
    const bullets = collectTagContents(html, "li", 6);
    const paragraphs = collectTagContents(html, "p", 8);
    const textSnippet = collapseWhitespace(
      [...headings, ...bullets, ...paragraphs].join(" ").slice(0, MAX_TEXT_LENGTH),
    );

    return {
      url,
      finalUrl: response.url || url,
      title,
      description,
      headings,
      bullets,
      textSnippet: textSnippet || null,
    };
  } catch {
    return null;
  }
}

function buildEvidenceText(insights: UrlInsight[]) {
  return insights
    .map((insight, index) => {
      return [
        `Page ${index + 1}: ${insight.finalUrl}`,
        insight.title ? `Title: ${insight.title}` : null,
        insight.description ? `Description: ${insight.description}` : null,
        insight.headings.length > 0 ? `Headings: ${insight.headings.join(" | ")}` : null,
        insight.bullets.length > 0 ? `Bullets: ${insight.bullets.join(" | ")}` : null,
        insight.textSnippet ? `Text: ${insight.textSnippet}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

function stripCdata(value: string) {
  return collapseWhitespace(value.replace(/<!\[CDATA\[|\]\]>/g, ""));
}

function extractXmlTag(block: string, tagName: string) {
  const match = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i").exec(block);
  return match ? stripCdata(match[1] ?? "") : null;
}

function stripHtmlForXml(value: string | null) {
  if (!value) {
    return null;
  }

  return collapseWhitespace(
    value
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&#39;/g, "'"),
  );
}

function extractDuckDuckGoLink(rawHref: string | null) {
  if (!rawHref) {
    return null;
  }

  const decoded = decodeHtml(rawHref);
  if (decoded.startsWith("//")) {
    return `https:${decoded}`;
  }
  if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
    return decoded;
  }

  try {
    const url = new URL(decoded, "https://html.duckduckgo.com");
    const uddg = url.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : url.toString();
  } catch {
    return null;
  }
}

async function fetchNewsSignals(query: string, siteUrl?: string | null) {
  const queryParts = [query];
  if (siteUrl) {
    try {
      queryParts.push(`site:${new URL(siteUrl).hostname}`);
    } catch {
      // Ignore malformed URLs.
    }
  }

  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(queryParts.join(" "))}`;

  try {
    const response = await fetch(rssUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!response.ok) {
      return [] as NewsSignal[];
    }

    const xml = await response.text();
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];

    return items.slice(0, MAX_NEWS_ITEMS).map((item) => ({
      title: extractXmlTag(item, "title") ?? "Untitled",
      source: stripHtmlForXml(extractXmlTag(item, "description"))?.split("·")[0] ?? null,
      publishedAt: extractXmlTag(item, "pubDate"),
      link: extractXmlTag(item, "link"),
    }));
  } catch {
    return [] as NewsSignal[];
  }
}

async function fetchWebSearchSignals(query: string, siteUrl?: string | null) {
  const searchTerms = [query];
  if (siteUrl) {
    try {
      searchTerms.push(new URL(siteUrl).hostname.replace(/^www\./, ""));
    } catch {
      // Ignore malformed URLs.
    }
  }

  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchTerms.join(" "))}`;

  try {
    const response = await fetch(url, {
      headers: {
        "user-agent":
          "ChecklistLocalAI/1.0 (+https://checklist.messmass.com; source enrichment crawler)",
        accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!response.ok) {
      return [] as SearchSignal[];
    }

    const html = await response.text();
    const matches = Array.from(
      html.matchAll(
        /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>|<div[^>]+class="[^"]*result__snippet[^"]*"[^>]*>)([\s\S]*?)(?:<\/a>|<\/div>)/gi,
      ),
    );

    return matches.slice(0, MAX_SEARCH_ITEMS).map((match) => ({
      title: collapseWhitespace(decodeHtml(stripTags(match[2] ?? ""))) || "Untitled",
      snippet: collapseWhitespace(decodeHtml(stripTags(match[3] ?? ""))) || null,
      link: extractDuckDuckGoLink(match[1] ?? null),
    }));
  } catch {
    return [] as SearchSignal[];
  }
}

function inferTicker(insights: UrlInsight[]) {
  for (const insight of insights) {
    const haystack = [
      insight.title,
      insight.description,
      insight.textSnippet,
      ...insight.headings,
      ...insight.bullets,
    ]
      .filter(Boolean)
      .join(" ");
    const match = haystack.match(TICKER_PATTERN);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

async function fetchStockSignal(ticker: string | null) {
  if (!ticker) {
    return null;
  }

  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=5d&interval=1d`,
      {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const result = data?.chart?.result?.[0];
    const meta = result?.meta;
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    const filtered = closes.filter((value: unknown) => typeof value === "number");

    if (!meta || filtered.length === 0) {
      return null;
    }

    const latest = filtered[filtered.length - 1] as number;
    const previous = filtered.length > 1 ? (filtered[filtered.length - 2] as number) : null;
    const changePercent =
      previous && previous !== 0 ? Number((((latest - previous) / previous) * 100).toFixed(2)) : null;

    return {
      ticker,
      currency: typeof meta.currency === "string" ? meta.currency : null,
      price: Number.isFinite(latest) ? Number(latest.toFixed(2)) : null,
      changePercent,
    } satisfies StockSignal;
  } catch {
    return null;
  }
}

function buildNewsText(newsSignals: NewsSignal[]) {
  if (newsSignals.length === 0) {
    return "none";
  }

  return newsSignals
    .map((item, index) => {
      return [
        `News ${index + 1}: ${item.title}`,
        item.source ? `Source: ${item.source}` : null,
        item.publishedAt ? `Published: ${item.publishedAt}` : null,
      ]
        .filter(Boolean)
        .join(" | ");
    })
    .join("\n");
}

function buildSearchText(searchSignals: SearchSignal[]) {
  if (searchSignals.length === 0) {
    return "none";
  }

  return searchSignals
    .map((item, index) => {
      return [
        `Search ${index + 1}: ${item.title}`,
        item.snippet ? `Snippet: ${item.snippet}` : null,
        item.link ? `Link: ${item.link}` : null,
      ]
        .filter(Boolean)
        .join(" | ");
    })
    .join("\n");
}

function buildStockText(stockSignal: StockSignal | null) {
  if (!stockSignal) {
    return "none";
  }

  return [
    `Ticker: ${stockSignal.ticker}`,
    stockSignal.price !== null ? `Price: ${stockSignal.price}` : null,
    stockSignal.currency ? `Currency: ${stockSignal.currency}` : null,
    stockSignal.changePercent !== null ? `Daily change: ${stockSignal.changePercent}%` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

async function callLocalSummarizer(
  kind: "product" | "competitor",
  insights: UrlInsight[],
  newsSignals: NewsSignal[],
  searchSignals: SearchSignal[],
  stockSignal: StockSignal | null,
) {
  const evidence = buildEvidenceText(insights);
  if (!evidence) {
    return null;
  }

  const system =
    kind === "product"
      ? 'Return strict JSON with keys name, pricing, features, conclusions, evaluations, judgments, recommendations, industryNews, researchPlans, forecasts, stockSignal, marketChatter. features/conclusions/evaluations/judgments/recommendations/industryNews/researchPlans/forecasts/marketChatter must be arrays of short strings. Use only evidence and public signals provided. Label uncertain items conservatively.'
      : 'Return strict JSON with keys name, pricing, strengths, weaknesses, conclusions, evaluations, judgments, recommendations, industryNews, researchPlans, forecasts, stockSignal, marketChatter. strengths/weaknesses/conclusions/evaluations/judgments/recommendations/industryNews/researchPlans/forecasts/marketChatter must be arrays of short strings. Use only evidence and public signals provided. Label uncertain items conservatively.';

  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: `Build decision-grade business intelligence from this source evidence.\n\nWebsite evidence:\n${evidence}\n\nPublic news signals:\n${buildNewsText(newsSignals)}\n\nPublic web search signals:\n${buildSearchText(searchSignals)}\n\nStock signal:\n${buildStockText(stockSignal)}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const content = data.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

function uniqueShortStrings(values: Array<string | null | undefined>, maxItems = 5) {
  const result: string[] = [];

  for (const value of values) {
    const normalized = collapseWhitespace(value ?? "");
    if (!normalized || normalized.length > 140 || result.includes(normalized)) {
      continue;
    }

    result.push(normalized);
    if (result.length >= maxItems) {
      break;
    }
  }

  return result;
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = collapseWhitespace(value ?? "");
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function sanitizeEntityName(value: string | null | undefined) {
  const normalized = collapseWhitespace(value ?? "")
    .replace(/[{}[\]]/g, "")
    .replace(/^[()\s]+|[()\s]+$/g, "");
  return normalized || null;
}

function decodeEntities(value: string | null | undefined) {
  return sanitizeEntityName(decodeHtml(value ?? ""));
}

function cleanCandidateText(value: string | null | undefined) {
  const cleaned = decodeEntities(value)
    ?.replace(/\s+[|•·]\s+/g, " | ")
    .replace(/^home\s+[|:-]\s+/i, "")
    .replace(/^welcome to\s+/i, "")
    .trim();
  return cleaned ?? null;
}

function isGenericNavLabel(value: string | null | undefined) {
  const normalized = cleanCandidateText(value)?.toLowerCase();
  if (!normalized) {
    return true;
  }

  return GENERIC_NAV_LABELS.has(normalized);
}

function filterBusinessSignals(values: Array<string | null | undefined>, maxItems = 5) {
  return uniqueShortStrings(values.map(cleanCandidateText), maxItems).filter(
    (value) => !isGenericNavLabel(value),
  );
}

function isPlatformShellInsight(insight: UrlInsight) {
  const rule = getHostRule(insight.finalUrl);
  if (!rule) {
    return false;
  }

  const haystack = [
    insight.title,
    insight.description,
    insight.textSnippet,
    ...insight.headings,
    ...insight.bullets,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return rule.shellPhrases.some((phrase) => haystack.includes(phrase));
}

function chooseEntityName(
  currentName: string | null | undefined,
  urls: string[],
  aiName: string | null | undefined,
  fallbackName: string | null | undefined,
) {
  const isSuspiciousName = (value: string | null | undefined) =>
    !!value &&
    (/^ww\d+$/i.test(value) || value.length <= 3 || /^[a-z0-9]+$/i.test(value));
  const cleanedCurrent = cleanCandidateText(currentName);
  const cleanedAi = cleanCandidateText(aiName);
  const cleanedFallback = cleanCandidateText(fallbackName);
  const primaryUrl = urls[0] ?? null;
  const handleName = prettifyHandle(primaryUrl ? getUrlHandle(primaryUrl) : null);
  const hostRule = primaryUrl ? getHostRule(primaryUrl) : null;
  const hostDerivedName = sanitizeEntityName(deriveNameFromUrl(primaryUrl ?? cleanedCurrent ?? ""));
  const currentLooksSuspicious = isSuspiciousName(cleanedCurrent);

  const currentLooksGenericPlatform =
    !!hostRule &&
    !!cleanedCurrent &&
    cleanedCurrent.toLowerCase().includes(hostRule.platformName.toLowerCase());

  if (
    cleanedCurrent &&
    !looksLikeUrl(cleanedCurrent) &&
    !currentLooksGenericPlatform &&
    !currentLooksSuspicious
  ) {
    return cleanedCurrent;
  }

  if (handleName) {
    return handleName;
  }

  if (
    cleanedAi &&
    !isSuspiciousName(cleanedAi) &&
    (!hostRule || !cleanedAi.toLowerCase().includes(hostRule.platformName.toLowerCase()))
  ) {
    return cleanedAi;
  }

  if (
    cleanedFallback &&
    !isSuspiciousName(cleanedFallback) &&
    (!hostRule || !cleanedFallback.toLowerCase().includes(hostRule.platformName.toLowerCase()))
  ) {
    return cleanedFallback;
  }

  return hostDerivedName;
}

function hasMinimumBusinessEvidence(
  insights: UrlInsight[],
  primarySignals: string[],
  secondarySignals: string[],
) {
  if (insights.length === 0) {
    return false;
  }

  if (insights.every(isPlatformShellInsight)) {
    return false;
  }

  return primarySignals.length + secondarySignals.length >= 2;
}

function filterRelevantNewsSignals(
  newsSignals: NewsSignal[],
  entityName: string | null,
  urls: string[],
  pageTitles: string[] = [],
) {
  const tokens = new Set<string>();
  const addTokens = (value: string | null | undefined) => {
    for (const token of (value ?? "").toLowerCase().split(/[^a-z0-9]+/)) {
      if (token.length >= 4) {
        tokens.add(token);
      }
    }
  };

  addTokens(entityName);
  for (const url of urls) {
    addTokens(prettifyHandle(getUrlHandle(url)));
    try {
      addTokens(new URL(url).hostname.replace(/^www\./, "").split(".")[0]);
    } catch {
      // ignore
    }
  }

  const normalizedPageTitles = pageTitles
    .map((value) => collapseWhitespace(decodeHtml(value)).toLowerCase())
    .filter(Boolean);
  const normalizedEntity = collapseWhitespace(entityName ?? "").toLowerCase();

  return newsSignals.filter((item) => {
    const normalizedTitle = collapseWhitespace(decodeHtml(item.title ?? "")).toLowerCase();
    const haystack = `${normalizedTitle} ${decodeHtml(item.source ?? "").toLowerCase()}`;
    if (!Array.from(tokens).some((token) => haystack.includes(token))) {
      return false;
    }

    if (!normalizedTitle) {
      return false;
    }

    if (normalizedPageTitles.includes(normalizedTitle)) {
      return false;
    }

    if (normalizedEntity && (normalizedTitle === normalizedEntity || normalizedTitle === `${normalizedEntity} - ${normalizedEntity}`)) {
      return false;
    }

    if (
      [
        "privacy policy",
        "contact ",
        "training schedule",
        "private lessons",
        "goalkeeper training",
        "junior academy",
        "game analysis",
        "birthday parties",
      ].some((phrase) => haystack.includes(phrase))
    ) {
      return false;
    }

    return true;
  });
}

function filterRelevantSearchSignals(searchSignals: SearchSignal[], entityName: string | null, urls: string[]) {
  const tokens = new Set<string>();
  const addTokens = (value: string | null | undefined) => {
    for (const token of (value ?? "").toLowerCase().split(/[^a-z0-9]+/)) {
      if (token.length >= 4) {
        tokens.add(token);
      }
    }
  };

  addTokens(entityName);
  for (const url of urls) {
    addTokens(prettifyHandle(getUrlHandle(url)));
    try {
      addTokens(new URL(url).hostname.replace(/^www\./, "").split(".")[0]);
    } catch {
      // Ignore malformed URLs.
    }
  }

  return searchSignals.filter((item) => {
    const haystack = `${item.title} ${item.snippet ?? ""}`.toLowerCase();
    return Array.from(tokens).some((token) => haystack.includes(token));
  });
}

function sentenceize(values: Array<string | null | undefined>, maxItems = 3) {
  return uniqueShortStrings(values, maxItems).map((value) =>
    /[.!?]$/.test(value) ? value : `${value}.`,
  );
}

function buildDecisionBody(sections: Array<[string, Array<string | null | undefined>]>) {
  return sections
    .map(([label, values]) => {
      const items = sentenceize(values);
      if (items.length === 0) {
        return null;
      }

      return `${label}: ${items.join(" ")}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function filterLowValueConclusions(values: Array<string | null | undefined>) {
  return sentenceize(
    values.filter((value) => {
      const normalized = collapseWhitespace(decodeHtml(value ?? "")).toLowerCase();
      if (!normalized) {
        return false;
      }

      if (LOW_VALUE_FLASHCARD_PHRASES.some((phrase) => normalized.includes(phrase))) {
        return false;
      }

      if (normalized.split(/\s+/).length < 5) {
        return false;
      }

      if (/^[^|]+ \| [^|]+$/.test(normalized) || /^[^-]+ - [^-]+$/.test(normalized)) {
        return false;
      }

      return !isGenericNavLabel(normalized);
    }),
    4,
  );
}

function sanitizeIndustryNews(
  values: Array<string | null | undefined>,
  entityName: string | null,
  pageTitles: string[],
) {
  const normalizedPageTitles = pageTitles
    .map((value) => collapseWhitespace(decodeHtml(value)).toLowerCase())
    .filter(Boolean);
  const normalizedEntity = collapseWhitespace(entityName ?? "").toLowerCase();

  return filterLowValueConclusions(values).filter((value) => {
    const normalized = collapseWhitespace(decodeHtml(value)).toLowerCase();
    if (!normalized) {
      return false;
    }

    if (normalizedPageTitles.includes(normalized)) {
      return false;
    }

    if (normalizedEntity && (normalized === normalizedEntity || normalized === `${normalizedEntity} - ${normalizedEntity}`)) {
      return false;
    }

    return true;
  });
}

function containsAny(haystack: string, needles: string[]) {
  return needles.some((needle) => haystack.includes(needle));
}

function hasInvalidStoredUrls(urls: string[] | undefined) {
  return (urls ?? []).some((url) => canonicalizeUrl(url) === null);
}

export function looksLikeLowValueAnalysis(value: string | null | undefined) {
  const normalized = collapseWhitespace(decodeHtml(value ?? "")).toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    containsAny(normalized, [
      "about us why spl",
      "create an account or log in to instagram",
      "tiktok - make your day",
      "loading...",
      "benchmark our offer against the competitor's visible promise around",
      "if this positioning keeps landing, expect the competitor to keep investing around",
      "the competitor appears to lead with",
      "the competitor's clearest visible positioning signal is",
    ]) ||
    normalized.includes("home |") ||
    normalized.includes("conclusions: about us")
  );
}

function inferPricing(insights: UrlInsight[]) {
  for (const insight of insights) {
    const haystacks = [insight.description, insight.textSnippet, ...insight.bullets, ...insight.headings];
    for (const haystack of haystacks) {
      const match = haystack?.match(PRICE_PATTERN);
      if (match?.[0]) {
        return collapseWhitespace(match[0]);
      }
    }
  }

  return null;
}

function fallbackProductSummary(insights: UrlInsight[]) {
  const summary = firstNonEmpty(
    insights[0]?.description,
    insights[0]?.textSnippet,
    insights[0]?.headings.join(". "),
  );
  const features = filterBusinessSignals(
    insights.flatMap((insight) => [...insight.headings, ...insight.bullets]),
  );
  const pricing = inferPricing(insights);

  return {
    name: cleanCandidateText(insights[0]?.title) ?? deriveNameFromUrl(insights[0]?.finalUrl ?? ""),
    conclusions: summary ? [summary] : [],
    evaluations: filterBusinessSignals(insights[0]?.headings ?? [], 2),
    judgments: [],
    recommendations: [],
    industryNews: [],
    researchPlans: [],
    forecasts: [],
    stockSignal: [],
    marketChatter: [],
    pricing,
    features,
  };
}

function fallbackCompetitorSummary(insights: UrlInsight[]) {
  const positioning = firstNonEmpty(
    insights[0]?.description,
    insights[0]?.textSnippet,
    insights[0]?.headings.join(". "),
  );
  const signals = filterBusinessSignals(
    insights.flatMap((insight) => [...insight.headings, ...insight.bullets]),
    6,
  );

  return {
    name: cleanCandidateText(insights[0]?.title) ?? deriveNameFromUrl(insights[0]?.finalUrl ?? ""),
    conclusions: positioning ? [positioning] : [],
    evaluations: signals.slice(0, 2),
    judgments: [],
    recommendations: [],
    industryNews: [],
    researchPlans: [],
    forecasts: [],
    stockSignal: [],
    marketChatter: [],
    pricing: inferPricing(insights),
    strengths: signals.slice(0, 3),
    weaknesses: [] as string[],
  };
}

export function normalizeQuickAddInput(input: string) {
  const normalizedUrl = canonicalizeUrl(input);
  if (!normalizedUrl) {
    return {
      name: input.trim(),
      urls: [] as string[],
      inputWasUrl: false,
    };
  }

  return {
    name: deriveNameFromUrl(normalizedUrl),
    urls: [normalizedUrl],
    inputWasUrl: true,
  };
}

export function prepareRawSourceInput(name: string, urls: string[] = []): RawSourceInput {
  const trimmedName = name.trim();
  const inferredUrl = canonicalizeUrl(trimmedName);
  const normalizedUrls = normalizeUrlList([
    ...urls,
    ...(inferredUrl ? [inferredUrl] : []),
  ]);

  return {
    name: trimmedName,
    urls: normalizedUrls,
  };
}

export function presentRawSourceName(name: string, urls: string[] = []) {
  const cleanedName = cleanCandidateText(name);
  if (looksLikeUrl(cleanedName)) {
    return cleanedName!;
  }

  const firstUrl = normalizeUrlList(urls)[0] ?? null;
  const hostRule = firstUrl ? getHostRule(firstUrl) : null;
  const cleanedUrlHandle = firstUrl ? prettifyHandle(getUrlHandle(firstUrl)) : null;

  if (
    firstUrl &&
    (
      !cleanedName ||
      looksSuspiciousSourceName(cleanedName) ||
      (hostRule && cleanedName.toLowerCase().includes(hostRule.platformName.toLowerCase())) ||
      cleanedName === cleanedUrlHandle ||
      cleanedName?.replace(/\s+/g, "").toLowerCase() === cleanedUrlHandle?.replace(/\s+/g, "").toLowerCase()
    )
  ) {
    return firstUrl;
  }

  return cleanedName ?? firstUrl ?? name;
}

export async function enrichProductSeed(seed: ProductSeed) {
  const urls = uniqueShortStrings(
    [...(seed.urls ?? []), ...(looksLikeUrl(seed.name) ? [seed.name ?? ""] : [])].map(
      canonicalizeUrl,
    ),
    3,
  );
  const fallbackName = firstNonEmpty(seed.name) ?? (urls[0] ? deriveNameFromUrl(urls[0]) : null);
  const preferredExistingName = looksLikeUrl(seed.name) ? null : seed.name;

  if (urls.length === 0) {
    return {
      urls,
      name: sanitizeEntityName(fallbackName),
      description: firstNonEmpty(seed.description),
      pricing: firstNonEmpty(seed.pricing),
      features: uniqueShortStrings(seed.features ?? []),
    };
  }

  const insights = (await Promise.all(urls.map(fetchUrlInsight))).filter(
    (item): item is UrlInsight => Boolean(item),
  );
  const newsSignals =
    insights.length > 0
      ? await fetchNewsSignals(sanitizeEntityName(preferredExistingName) ?? deriveNameFromUrl(urls[0] ?? ""), urls[0])
      : [];
  const searchSignals =
    insights.length > 0
      ? await fetchWebSearchSignals(sanitizeEntityName(preferredExistingName) ?? deriveNameFromUrl(urls[0] ?? ""), urls[0])
      : [];
  const stockSignal = insights.length > 0 ? await fetchStockSignal(inferTicker(insights)) : null;
  const aiSummary =
    insights.length > 0 ? await callLocalSummarizer("product", insights, newsSignals, searchSignals, stockSignal) : null;
  const fallback = insights.length > 0 ? fallbackProductSummary(insights) : null;
  const chosenName = chooseEntityName(seed.name, urls, typeof aiSummary?.name === "string" ? aiSummary.name : null, fallback?.name);
  const pageTitles = insights
    .map((item) => item.title)
    .filter((value): value is string => Boolean(value));
  const relevantNewsSignals = filterRelevantNewsSignals(newsSignals, chosenName, urls, pageTitles);
  const relevantSearchSignals = filterRelevantSearchSignals(searchSignals, chosenName, urls);
  const filteredFeatures = filterBusinessSignals([
    ...(seed.features ?? []),
    ...((Array.isArray(aiSummary?.features) ? aiSummary.features : []) as string[]),
    ...(fallback?.features ?? []),
  ]);
  const primarySignals = filterBusinessSignals([
    typeof aiSummary?.pricing === "string" ? aiSummary.pricing : null,
    fallback?.pricing,
    typeof aiSummary?.conclusions?.[0] === "string" ? aiSummary.conclusions[0] : null,
    ...filteredFeatures,
  ]);
  const secondarySignals = filterBusinessSignals([
    ...(Array.isArray(aiSummary?.evaluations) ? aiSummary.evaluations : []),
    ...(fallback?.evaluations ?? []),
  ]);
  const passedQualityGate = hasMinimumBusinessEvidence(insights, primarySignals, secondarySignals);
  const decisionBody = buildDecisionBody([
    ["Conclusions", passedQualityGate ? filterLowValueConclusions((aiSummary?.conclusions as string[]) ?? fallback?.conclusions ?? []) : []],
    ["Evaluation", passedQualityGate ? filterLowValueConclusions((aiSummary?.evaluations as string[]) ?? fallback?.evaluations ?? []) : []],
    ["Judgment", passedQualityGate ? filterLowValueConclusions((aiSummary?.judgments as string[]) ?? fallback?.judgments ?? []) : []],
    ["Recommendation", passedQualityGate ? filterLowValueConclusions((aiSummary?.recommendations as string[]) ?? fallback?.recommendations ?? []) : []],
    ["Industry news", passedQualityGate ? sanitizeIndustryNews((aiSummary?.industryNews as string[]) ?? relevantNewsSignals.map((item) => item.title), chosenName, pageTitles) : []],
    ["R&D / roadmap", passedQualityGate ? ((aiSummary?.researchPlans as string[]) ?? fallback?.researchPlans ?? []) : []],
    ["Forecast", passedQualityGate ? ((aiSummary?.forecasts as string[]) ?? fallback?.forecasts ?? []) : []],
    [
      "Stock signal",
      passedQualityGate ? ((aiSummary?.stockSignal as string[]) ??
        (stockSignal
          ? [
              `${stockSignal.ticker} at ${stockSignal.price ?? "n/a"} ${stockSignal.currency ?? ""} ${
                stockSignal.changePercent !== null ? `(${stockSignal.changePercent}% daily change)` : ""
              }`.trim(),
            ]
          : [])) : [],
    ],
    [
      "Market chatter (low confidence)",
      passedQualityGate ? ((aiSummary?.marketChatter as string[]) ?? fallback?.marketChatter ?? []) : [],
    ],
  ]);

  return {
    urls,
    name: chosenName ?? sanitizeEntityName(fallbackName),
    description: passedQualityGate
      ? firstNonEmpty(decisionBody, seed.description)
      : null,
    pricing: firstNonEmpty(
      seed.pricing,
      typeof aiSummary?.pricing === "string" ? aiSummary.pricing : null,
      fallback?.pricing,
    ),
    features: passedQualityGate ? filteredFeatures : [],
    watchedContent:
      insights.length > 0
        ? {
            fetchedAt: new Date().toISOString(),
            pages: insights,
            newsSignals: relevantNewsSignals,
            searchSignals: relevantSearchSignals,
            stockSignal,
            analysis: aiSummary,
            qualityGate: {
              passed: passedQualityGate,
              reason: passedQualityGate
                ? "sufficient-business-evidence"
                : "generic-platform-or-navigation-content",
            },
          }
        : (seed.watchedContent ?? null),
  };
}

export async function enrichCompetitorSeed(seed: CompetitorSeed) {
  const urls = uniqueShortStrings(
    [...(seed.urls ?? []), ...(looksLikeUrl(seed.name) ? [seed.name ?? ""] : [])].map(
      canonicalizeUrl,
    ),
    3,
  );
  const fallbackName = firstNonEmpty(seed.name) ?? (urls[0] ? deriveNameFromUrl(urls[0]) : null);
  const preferredExistingName = looksLikeUrl(seed.name) ? null : seed.name;

  if (urls.length === 0) {
    return {
      urls,
      name: sanitizeEntityName(fallbackName),
      pricing: firstNonEmpty(seed.pricing),
      positioning: firstNonEmpty(seed.positioning),
      strengths: uniqueShortStrings(seed.strengths ?? []),
      weaknesses: uniqueShortStrings(seed.weaknesses ?? []),
      watchedContent: seed.watchedContent ?? null,
    };
  }

  const insights = (await Promise.all(urls.map(fetchUrlInsight))).filter(
    (item): item is UrlInsight => Boolean(item),
  );
  const newsSignals =
    insights.length > 0
      ? await fetchNewsSignals(sanitizeEntityName(preferredExistingName) ?? deriveNameFromUrl(urls[0] ?? ""), urls[0])
      : [];
  const searchSignals =
    insights.length > 0
      ? await fetchWebSearchSignals(sanitizeEntityName(preferredExistingName) ?? deriveNameFromUrl(urls[0] ?? ""), urls[0])
      : [];
  const stockSignal = insights.length > 0 ? await fetchStockSignal(inferTicker(insights)) : null;
  const aiSummary =
    insights.length > 0 ? await callLocalSummarizer("competitor", insights, newsSignals, searchSignals, stockSignal) : null;
  const fallback = insights.length > 0 ? fallbackCompetitorSummary(insights) : null;
  const chosenName = chooseEntityName(seed.name, urls, typeof aiSummary?.name === "string" ? aiSummary.name : null, fallback?.name);
  const pageTitles = insights
    .map((item) => item.title)
    .filter((value): value is string => Boolean(value));
  const relevantNewsSignals = filterRelevantNewsSignals(newsSignals, chosenName, urls, pageTitles);
  const relevantSearchSignals = filterRelevantSearchSignals(searchSignals, chosenName, urls);
  const filteredStrengths = filterBusinessSignals([
    ...(seed.strengths ?? []),
    ...((Array.isArray(aiSummary?.strengths) ? aiSummary.strengths : []) as string[]),
    ...(fallback?.strengths ?? []),
  ]);
  const filteredWeaknesses = filterBusinessSignals([
    ...(seed.weaknesses ?? []),
    ...((Array.isArray(aiSummary?.weaknesses) ? aiSummary.weaknesses : []) as string[]),
    ...(fallback?.weaknesses ?? []),
  ]);
  const primarySignals = filterBusinessSignals([
    typeof aiSummary?.pricing === "string" ? aiSummary.pricing : null,
    fallback?.pricing,
    ...filteredStrengths,
    ...filteredWeaknesses,
  ]);
  const secondarySignals = filterBusinessSignals([
    ...(Array.isArray(aiSummary?.evaluations) ? aiSummary.evaluations : []),
    ...(fallback?.evaluations ?? []),
  ]);
  const passedQualityGate = hasMinimumBusinessEvidence(insights, primarySignals, secondarySignals);
  const decisionBody = buildDecisionBody([
    ["Conclusions", passedQualityGate ? filterLowValueConclusions((aiSummary?.conclusions as string[]) ?? fallback?.conclusions ?? []) : []],
    ["Evaluation", passedQualityGate ? filterLowValueConclusions((aiSummary?.evaluations as string[]) ?? fallback?.evaluations ?? []) : []],
    ["Judgment", passedQualityGate ? filterLowValueConclusions((aiSummary?.judgments as string[]) ?? fallback?.judgments ?? []) : []],
    ["Recommendation", passedQualityGate ? filterLowValueConclusions((aiSummary?.recommendations as string[]) ?? fallback?.recommendations ?? []) : []],
    ["Industry news", passedQualityGate ? sanitizeIndustryNews((aiSummary?.industryNews as string[]) ?? relevantNewsSignals.map((item) => item.title), chosenName, pageTitles) : []],
    ["R&D / roadmap", passedQualityGate ? ((aiSummary?.researchPlans as string[]) ?? fallback?.researchPlans ?? []) : []],
    ["Forecast", passedQualityGate ? ((aiSummary?.forecasts as string[]) ?? fallback?.forecasts ?? []) : []],
    [
      "Stock signal",
      passedQualityGate ? ((aiSummary?.stockSignal as string[]) ??
        (stockSignal
          ? [
              `${stockSignal.ticker} at ${stockSignal.price ?? "n/a"} ${stockSignal.currency ?? ""} ${
                stockSignal.changePercent !== null ? `(${stockSignal.changePercent}% daily change)` : ""
              }`.trim(),
            ]
          : [])) : [],
    ],
    [
      "Market chatter (low confidence)",
      passedQualityGate ? ((aiSummary?.marketChatter as string[]) ?? fallback?.marketChatter ?? []) : [],
    ],
  ]);

  return {
    urls,
    name: chosenName ?? sanitizeEntityName(fallbackName),
    pricing: firstNonEmpty(
      seed.pricing,
      typeof aiSummary?.pricing === "string" ? aiSummary.pricing : null,
      fallback?.pricing,
    ),
    positioning: passedQualityGate ? firstNonEmpty(decisionBody, seed.positioning) : null,
    strengths: passedQualityGate ? filteredStrengths : [],
    weaknesses: passedQualityGate ? filteredWeaknesses : [],
    watchedContent:
      insights.length > 0
        ? {
            fetchedAt: new Date().toISOString(),
            pages: insights,
            newsSignals: relevantNewsSignals,
            searchSignals: relevantSearchSignals,
            stockSignal,
            analysis: aiSummary,
            qualityGate: {
              passed: passedQualityGate,
              reason: passedQualityGate
                ? "sufficient-business-evidence"
                : "generic-platform-or-navigation-content",
            },
          }
        : (seed.watchedContent ?? null),
  };
}

export function shouldEnrichProduct(seed: ProductSeed & { updatedAt?: Date }) {
  const hasUrl = (seed.urls ?? []).some(Boolean) || looksLikeUrl(seed.name);
  if (!hasUrl) {
    return false;
  }

  const missingAnalyticalStructure = !collapseWhitespace(seed.description ?? "").includes("Conclusions:");
  const lowValueDescription = looksLikeLowValueAnalysis(seed.description);
  const lowValueFeatures = filterBusinessSignals(seed.features ?? []).length === 0;

  return (
    looksLikeUrl(seed.name) ||
    missingAnalyticalStructure ||
    lowValueDescription ||
    lowValueFeatures ||
    hasInvalidStoredUrls(seed.urls) ||
    !collapseWhitespace(seed.description ?? "") ||
    (seed.features ?? []).length === 0
  );
}

export function shouldEnrichCompetitor(seed: CompetitorSeed & { updatedAt?: Date }) {
  const hasUrl = (seed.urls ?? []).some(Boolean) || looksLikeUrl(seed.name);
  if (!hasUrl) {
    return false;
  }

  const missingAnalyticalStructure = !collapseWhitespace(seed.positioning ?? "").includes("Conclusions:");
  const lowValuePositioning = looksLikeLowValueAnalysis(seed.positioning);
  const qualityGatePassed = typeof seed.watchedContent === "object" &&
    seed.watchedContent !== null &&
    "qualityGate" in seed.watchedContent;

  return (
    looksLikeUrl(seed.name) ||
    missingAnalyticalStructure ||
    lowValuePositioning ||
    hasInvalidStoredUrls(seed.urls) ||
    !qualityGatePassed ||
    !collapseWhitespace(seed.positioning ?? "") ||
    (seed.strengths ?? []).length === 0
  );
}
