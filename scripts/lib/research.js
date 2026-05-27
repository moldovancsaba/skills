const https = require("https");
const { tokenizeText, unique, truncate, hashValue, similarity } = require("./shared");
const { callOllamaWithFailover } = require("./ai");
const { STAGE_MODELS } = require("./core");

const DEFAULT_HEADERS = Object.freeze({
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
});
const MAX_SEARCH_REDIRECTS = 4;

/**
 * checklist RESEARCH ENGINE
 * v2.0.0 — Ground Truth Hardening
 */

async function generateStrategicKeywords(prisma, company) {
  const industries = company.industries || [];
  const rawPool = [company.industry, ...industries].filter(Boolean);
  
  const keywords = unique(rawPool.flatMap(item => tokenizeText(item.replace(/^#/, ""))));
  return keywords;
}

async function generateResearchQueries(prisma, company, topic) {
  const industry = company.industry || "General Business";
  const topicLabel = topic ? topic.label : "General Market Intelligence";

  const systemPrompt = `You are the checklist RESEARCHER. Generate 3 specific search queries for a company in ${industry}. Focus: ${topicLabel}. Rules: JSON array of strings only. No preamble.`;
  const userPrompt = `Company: ${company.name}\nTopic: ${topicLabel}`;

  try {
    const raw = await callOllamaWithFailover(systemPrompt, userPrompt, STAGE_MODELS.DRAFT);
    if (Array.isArray(raw)) return raw.slice(0, 3);
    return [];
  } catch (err) {
    return [];
  }
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function stripTags(value) {
  return decodeHtmlEntities(String(value || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function fetchText(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: DEFAULT_HEADERS }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirectCount >= MAX_SEARCH_REDIRECTS) {
          res.resume();
          reject(new Error(`Too many redirects for ${url}`));
          return;
        }
        const nextUrl = new URL(res.headers.location, url).toString();
        res.resume();
        resolve(fetchText(nextUrl, redirectCount + 1));
        return;
      }

      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        resolve({
          statusCode: Number(res.statusCode || 0),
          body: data,
          finalUrl: url,
          headers: res.headers,
        });
      });
    }).on("error", reject);
  });
}

function parseDuckDuckGoLiteResults(query, html) {
  if (!html || /bots use DuckDuckGo too|anomaly-modal|challenge-form/i.test(html)) {
    return [];
  }

  const rows = html.split('class="result-link"').slice(1, 7);
  const results = [];
  for (const row of rows) {
    const titleMatch = row.match(/>([^<]+)<\/a>/);
    const urlMatch = row.match(/href="([^"]+)"/);
    const snippetMatch = row.match(/class="result-snippet">([\s\S]*?)<\/td>/);
    if (!titleMatch || !urlMatch) continue;
    results.push({
      title: stripTags(titleMatch[1]),
      snippet: stripTags(snippetMatch?.[1] || "") || "Click to view full intelligence source.",
      url: decodeHtmlEntities(urlMatch[1]),
      query,
    });
  }
  return results;
}

function parseBingRssResults(query, xml) {
  const items = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
  return items.slice(0, 8).map((item) => {
    const title = item.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "";
    const url = item.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || "";
    const snippet = item.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || "";
    return {
      title: stripTags(title),
      snippet: stripTags(snippet) || "Click to view full intelligence source.",
      url: decodeHtmlEntities(url).trim(),
      query,
    };
  }).filter((item) => item.title && item.url);
}

function parseYahooResults(query, html) {
  const blocks = html.match(/<li[^>]*>\s*<div class="dd[\s\S]*?<\/li>/gi) || [];
  const results = [];
  for (const block of blocks) {
    const title = block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || "";
    const url = block.match(/href="(https:\/\/r\.search\.yahoo\.com\/[^"]+)"/i)?.[1] || "";
    const snippet = block.match(/<p class="fc-dustygray[\s\S]*?>([\s\S]*?)<\/p>/i)?.[1] || "";
    if (!title || !url) continue;
    results.push({
      title: stripTags(title),
      snippet: stripTags(snippet) || "Click to view full intelligence source.",
      url: decodeHtmlEntities(url),
      query,
    });
    if (results.length >= 8) break;
  }
  return results;
}

async function harvestSingleQuery(query) {
  const encodedQuery = encodeURIComponent(query);
  const sources = [
    {
      name: "duckduckgo-lite",
      url: `https://duckduckgo.com/lite/?q=${encodedQuery}`,
      parse: parseDuckDuckGoLiteResults,
    },
    {
      name: "bing-rss",
      url: `https://www.bing.com/search?format=rss&q=${encodedQuery}`,
      parse: parseBingRssResults,
    },
    {
      name: "yahoo-html",
      url: `https://search.yahoo.com/search?p=${encodedQuery}`,
      parse: parseYahooResults,
    },
  ];

  for (const source of sources) {
    try {
      const response = await fetchText(source.url);
      const parsed = source.parse(query, response.body);
      if (parsed.length > 0) {
        return parsed.map((item) => ({
          ...item,
          provider: source.name,
        }));
      }
    } catch {
      // Fallback to the next provider.
    }
  }

  return [];
}

/**
 * Robust Research Harvest (v2.1.0)
 * Uses redirect-aware provider fallback so unattended worker search survives
 * anti-bot challenges or provider layout changes.
 */
function harvestResearch(queries) {
  return Promise.all(queries.map((query) => harvestSingleQuery(query))).then((nested) => nested.flat());
}

async function performResearchHarvest(prisma, company, topic) {
  const queries = await generateResearchQueries(prisma, company, topic);
  if (queries.length === 0) return [];

  console.log(`[RESEARCH] ${company.name}: Pulling intelligence for [${queries.join(" | ")}]...`);
  const results = await harvestResearch(queries);

  return results.map(r => {
    const score = Math.round(similarity(r.snippet + " " + r.title, topic?.label || "") * 10);
    return {
      companyId: company.id,
      content: `${r.title}\n\n${r.snippet}\n\nSource: ${r.url}`,
      entityTag: "AGENT_FOUND",
      hashtags: topic?.hashtags || [],
      metadata: {
        type: "RESEARCH_HARVEST",
        harvestedAt: new Date().toISOString(),
        url: r.url,
        qualityScore: Math.max(1, Math.min(10, score))
      }
    };
  });
}

module.exports = {
  generateStrategicKeywords,
  generateResearchQueries,
  harvestResearch,
  performResearchHarvest
};
