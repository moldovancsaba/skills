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

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "deepseek-r1:1.5b";
const FETCH_TIMEOUT_MS = 5000;
const OLLAMA_TIMEOUT_MS = 4000;
const MAX_HTML_BYTES = 500_000;
const MAX_TEXT_LENGTH = 4000;
const PRICE_PATTERN =
  /(?:\$|EUR|USD|GBP)\s?\d[\d,.]*(?:\s*\/\s*(?:mo|month|yr|year|user))?|free\b|trial\b|pricing\b/i;

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

    url.hash = "";
    if (url.pathname === "/") {
      url.pathname = "";
    }

    return url.toString();
  } catch {
    return null;
  }
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

async function callLocalSummarizer(
  kind: "product" | "competitor",
  insights: UrlInsight[],
) {
  const evidence = buildEvidenceText(insights);
  if (!evidence) {
    return null;
  }

  const system =
    kind === "product"
      ? 'Return strict JSON with keys name, summary, pricing, features. "features" must be an array of short strings. Use only evidence from the page.'
      : 'Return strict JSON with keys name, positioning, pricing, strengths, weaknesses. "strengths" and "weaknesses" must be arrays of short strings. Use only evidence from the page.';

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
            content: `Summarize this website evidence for checklist knowledge enrichment.\n\n${evidence}`,
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
  const features = uniqueShortStrings(
    insights.flatMap((insight) => [...insight.headings, ...insight.bullets]),
  );

  return {
    name: firstNonEmpty(insights[0]?.title) ?? deriveNameFromUrl(insights[0]?.finalUrl ?? ""),
    summary,
    pricing: inferPricing(insights),
    features,
  };
}

function fallbackCompetitorSummary(insights: UrlInsight[]) {
  const positioning = firstNonEmpty(
    insights[0]?.description,
    insights[0]?.textSnippet,
    insights[0]?.headings.join(". "),
  );
  const signals = uniqueShortStrings(
    insights.flatMap((insight) => [...insight.headings, ...insight.bullets]),
    6,
  );

  return {
    name: firstNonEmpty(insights[0]?.title) ?? deriveNameFromUrl(insights[0]?.finalUrl ?? ""),
    positioning,
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
  const aiSummary = insights.length > 0 ? await callLocalSummarizer("product", insights) : null;
  const fallback = insights.length > 0 ? fallbackProductSummary(insights) : null;

  return {
    urls,
    name:
      sanitizeEntityName(
        firstNonEmpty(
          typeof aiSummary?.name === "string" ? aiSummary.name : null,
          preferredExistingName,
          fallback?.name,
        ),
      ) ?? sanitizeEntityName(fallbackName),
    description: firstNonEmpty(
      seed.description,
      typeof aiSummary?.summary === "string" ? aiSummary.summary : null,
      fallback?.summary,
    ),
    pricing: firstNonEmpty(
      seed.pricing,
      typeof aiSummary?.pricing === "string" ? aiSummary.pricing : null,
      fallback?.pricing,
    ),
    features: uniqueShortStrings([
      ...(seed.features ?? []),
      ...((Array.isArray(aiSummary?.features) ? aiSummary.features : []) as string[]),
      ...(fallback?.features ?? []),
    ]),
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
  const aiSummary = insights.length > 0 ? await callLocalSummarizer("competitor", insights) : null;
  const fallback = insights.length > 0 ? fallbackCompetitorSummary(insights) : null;

  return {
    urls,
    name:
      sanitizeEntityName(
        firstNonEmpty(
          typeof aiSummary?.name === "string" ? aiSummary.name : null,
          preferredExistingName,
          fallback?.name,
        ),
      ) ?? sanitizeEntityName(fallbackName),
    pricing: firstNonEmpty(
      seed.pricing,
      typeof aiSummary?.pricing === "string" ? aiSummary.pricing : null,
      fallback?.pricing,
    ),
    positioning: firstNonEmpty(
      seed.positioning,
      typeof aiSummary?.positioning === "string" ? aiSummary.positioning : null,
      fallback?.positioning,
    ),
    strengths: uniqueShortStrings([
      ...(seed.strengths ?? []),
      ...((Array.isArray(aiSummary?.strengths) ? aiSummary.strengths : []) as string[]),
      ...(fallback?.strengths ?? []),
    ]),
    weaknesses: uniqueShortStrings([
      ...(seed.weaknesses ?? []),
      ...((Array.isArray(aiSummary?.weaknesses) ? aiSummary.weaknesses : []) as string[]),
      ...(fallback?.weaknesses ?? []),
    ]),
    watchedContent:
      insights.length > 0
        ? {
            fetchedAt: new Date().toISOString(),
            pages: insights,
          }
        : (seed.watchedContent ?? null),
  };
}

export function shouldEnrichProduct(seed: ProductSeed & { updatedAt?: Date }) {
  const hasUrl = (seed.urls ?? []).some(Boolean) || looksLikeUrl(seed.name);
  if (!hasUrl) {
    return false;
  }

  return (
    looksLikeUrl(seed.name) ||
    !collapseWhitespace(seed.description ?? "") ||
    (seed.features ?? []).length === 0
  );
}

export function shouldEnrichCompetitor(seed: CompetitorSeed & { updatedAt?: Date }) {
  const hasUrl = (seed.urls ?? []).some(Boolean) || looksLikeUrl(seed.name);
  if (!hasUrl) {
    return false;
  }

  return (
    looksLikeUrl(seed.name) ||
    !collapseWhitespace(seed.positioning ?? "") ||
    (seed.strengths ?? []).length === 0
  );
}
