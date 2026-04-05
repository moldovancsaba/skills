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

type NewsSignal = {
  title: string;
  source: string | null;
  publishedAt: string | null;
  link: string | null;
};

type StockSignal = {
  ticker: string;
  currency: string | null;
  price: number | null;
  changePercent: number | null;
};

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "deepseek-r1:1.5b";
const FETCH_TIMEOUT_MS = 5000;
const OLLAMA_TIMEOUT_MS = 4000;
const MAX_HTML_BYTES = 500_000;
const MAX_TEXT_LENGTH = 4000;
const MAX_NEWS_ITEMS = 4;
const PRICE_PATTERN =
  /(?:\$|EUR|USD|GBP)\s?\d[\d,.]*(?:\s*\/\s*(?:mo|month|yr|year|user))?|free\b|trial\b|pricing\b/i;
const TICKER_PATTERN = /\b(?:NASDAQ|NYSE|AMEX|LSE|TSX)[:\s]+([A-Z.\-]{1,6})\b/;

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
            content: `Build decision-grade business intelligence from this source evidence.\n\nWebsite evidence:\n${evidence}\n\nPublic news signals:\n${buildNewsText(newsSignals)}\n\nStock signal:\n${buildStockText(stockSignal)}`,
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

function combinedInsightText(insights: UrlInsight[]) {
  return collapseWhitespace(
    insights
      .flatMap((insight) => [
        insight.title,
        insight.description,
        insight.textSnippet,
        ...insight.headings,
        ...insight.bullets,
      ])
      .filter(Boolean)
      .join(" "),
  ).toLowerCase();
}

function containsAny(haystack: string, needles: string[]) {
  return needles.some((needle) => haystack.includes(needle));
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
  const insightText = combinedInsightText(insights);
  const summary = firstNonEmpty(
    insights[0]?.description,
    insights[0]?.textSnippet,
    insights[0]?.headings.join(". "),
  );
  const features = uniqueShortStrings(
    insights.flatMap((insight) => [...insight.headings, ...insight.bullets]),
  );
  const pricing = inferPricing(insights);
  const judgments: string[] = [];
  const recommendations: string[] = [];
  const forecasts: string[] = [];

  if (containsAny(insightText, ["privacy", "regulated", "compliance", "local-first", "local first"])) {
    judgments.push("The offer is positioned around privacy-sensitive and regulated-data use cases.");
    forecasts.push("Near-term traction is most likely in teams that cannot move sensitive data into generic hosted AI tools.");
  }

  if (containsAny(insightText, ["enterprise", "teams", "platform"])) {
    judgments.push("The messaging suggests a B2B platform sale rather than a consumer motion.");
  }

  if (pricing && /free|trial/i.test(pricing)) {
    recommendations.push("Track whether the free entry point converts into a paid or services-backed revenue path.");
  }

  if (features.length > 0) {
    recommendations.push("Pressure-test whether the headline capabilities are differentiated enough against standard AI copilots.");
  }

  return {
    name: firstNonEmpty(insights[0]?.title) ?? deriveNameFromUrl(insights[0]?.finalUrl ?? ""),
    conclusions: summary ? [summary] : [],
    evaluations: uniqueShortStrings(insights[0]?.headings ?? [], 2),
    judgments,
    recommendations,
    industryNews: [],
    researchPlans: [],
    forecasts,
    stockSignal: [],
    marketChatter: [],
    pricing,
    features,
  };
}

function fallbackCompetitorSummary(insights: UrlInsight[]) {
  const insightText = combinedInsightText(insights);
  const positioning = firstNonEmpty(
    insights[0]?.description,
    insights[0]?.textSnippet,
    insights[0]?.headings.join(". "),
  );
  const signals = uniqueShortStrings(
    insights.flatMap((insight) => [...insight.headings, ...insight.bullets]),
    6,
  );
  const judgments: string[] = [];
  const recommendations: string[] = [];
  const forecasts: string[] = [];

  if (containsAny(insightText, ["ai", "automation", "agent"])) {
    judgments.push("The competitor is competing in an automation-heavy category where feature velocity matters.");
  }

  if (containsAny(insightText, ["enterprise", "security", "privacy", "regulated"])) {
    judgments.push("The positioning points toward higher-trust enterprise buyers rather than low-friction SMB acquisition.");
  }

  if (signals.length > 0) {
    recommendations.push("Compare this competitor's headline claims against our product's proof points, not just feature names.");
  }

  forecasts.push("Expect messaging and packaging to keep shifting as the category matures and buyer education improves.");

  return {
    name: firstNonEmpty(insights[0]?.title) ?? deriveNameFromUrl(insights[0]?.finalUrl ?? ""),
    conclusions: positioning ? [positioning] : [],
    evaluations: signals.slice(0, 2),
    judgments,
    recommendations,
    industryNews: [],
    researchPlans: [],
    forecasts,
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
  const stockSignal = insights.length > 0 ? await fetchStockSignal(inferTicker(insights)) : null;
  const aiSummary =
    insights.length > 0 ? await callLocalSummarizer("product", insights, newsSignals, stockSignal) : null;
  const fallback = insights.length > 0 ? fallbackProductSummary(insights) : null;
  const decisionBody = buildDecisionBody([
    ["Conclusions", (aiSummary?.conclusions as string[]) ?? fallback?.conclusions ?? []],
    ["Evaluation", (aiSummary?.evaluations as string[]) ?? fallback?.evaluations ?? []],
    ["Judgment", (aiSummary?.judgments as string[]) ?? fallback?.judgments ?? []],
    ["Recommendation", (aiSummary?.recommendations as string[]) ?? fallback?.recommendations ?? []],
    ["Industry news", (aiSummary?.industryNews as string[]) ?? newsSignals.map((item) => item.title)],
    ["R&D / roadmap", (aiSummary?.researchPlans as string[]) ?? fallback?.researchPlans ?? []],
    ["Forecast", (aiSummary?.forecasts as string[]) ?? fallback?.forecasts ?? []],
    [
      "Stock signal",
      (aiSummary?.stockSignal as string[]) ??
        (stockSignal
          ? [
              `${stockSignal.ticker} at ${stockSignal.price ?? "n/a"} ${stockSignal.currency ?? ""} ${
                stockSignal.changePercent !== null ? `(${stockSignal.changePercent}% daily change)` : ""
              }`.trim(),
            ]
          : []),
    ],
    [
      "Market chatter (low confidence)",
      (aiSummary?.marketChatter as string[]) ?? fallback?.marketChatter ?? [],
    ],
  ]);

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
      decisionBody,
      seed.description,
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
  const newsSignals =
    insights.length > 0
      ? await fetchNewsSignals(sanitizeEntityName(preferredExistingName) ?? deriveNameFromUrl(urls[0] ?? ""), urls[0])
      : [];
  const stockSignal = insights.length > 0 ? await fetchStockSignal(inferTicker(insights)) : null;
  const aiSummary =
    insights.length > 0 ? await callLocalSummarizer("competitor", insights, newsSignals, stockSignal) : null;
  const fallback = insights.length > 0 ? fallbackCompetitorSummary(insights) : null;
  const decisionBody = buildDecisionBody([
    ["Conclusions", (aiSummary?.conclusions as string[]) ?? fallback?.conclusions ?? []],
    ["Evaluation", (aiSummary?.evaluations as string[]) ?? fallback?.evaluations ?? []],
    ["Judgment", (aiSummary?.judgments as string[]) ?? fallback?.judgments ?? []],
    ["Recommendation", (aiSummary?.recommendations as string[]) ?? fallback?.recommendations ?? []],
    ["Industry news", (aiSummary?.industryNews as string[]) ?? newsSignals.map((item) => item.title)],
    ["R&D / roadmap", (aiSummary?.researchPlans as string[]) ?? fallback?.researchPlans ?? []],
    ["Forecast", (aiSummary?.forecasts as string[]) ?? fallback?.forecasts ?? []],
    [
      "Stock signal",
      (aiSummary?.stockSignal as string[]) ??
        (stockSignal
          ? [
              `${stockSignal.ticker} at ${stockSignal.price ?? "n/a"} ${stockSignal.currency ?? ""} ${
                stockSignal.changePercent !== null ? `(${stockSignal.changePercent}% daily change)` : ""
              }`.trim(),
            ]
          : []),
    ],
    [
      "Market chatter (low confidence)",
      (aiSummary?.marketChatter as string[]) ?? fallback?.marketChatter ?? [],
    ],
  ]);

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
      decisionBody,
      seed.positioning,
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
            newsSignals,
            stockSignal,
            analysis: aiSummary,
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

  return (
    looksLikeUrl(seed.name) ||
    missingAnalyticalStructure ||
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

  return (
    looksLikeUrl(seed.name) ||
    missingAnalyticalStructure ||
    !collapseWhitespace(seed.positioning ?? "") ||
    (seed.strengths ?? []).length === 0
  );
}
