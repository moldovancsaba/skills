const https = require("https");
const { tokenizeText, unique, truncate, hashValue, similarity } = require("./shared");
const { callOllamaWithFailover } = require("./ai");
const { STAGE_MODELS } = require("./core");

/**
 * SOVEREIGN RESEARCH ENGINE
 * v0.12.0-DURABLE
 * 
 * Aggregates strategic focus areas into actionable search queries and harvests intelligence.
 */

/**
 * Extracts and weights strategic keywords for a company based on its Industry tags and active TopicCards.
 */
async function generateStrategicKeywords(prisma, company) {
  const cid = company.id;
  
  // 1. Industries (from Company model)
  const industries = company.industries || [];
  const primaryIndustry = company.industry ? [company.industry] : [];
  
  // 2. Active Topics
  const topics = await prisma.topic.findMany({
    where: { companyId: cid, active: true },
    select: { label: true, hashtags: true }
  });

  const topicLabels = topics.map(t => t.label);
  const topicHashtags = topics.flatMap(t => t.hashtags || []);

  // 3. Combine and Clean
  const rawPool = [
    ...primaryIndustry,
    ...industries,
    ...topicLabels,
    ...topicHashtags
  ];

  const keywords = unique(rawPool.flatMap(item => {
    if (!item) return [];
    const cleaned = item.replace(/^#/, "");
    return tokenizeText(cleaned);
  }));
  
  return keywords;
}

/**
 * Generates specific, strategic research queries using the AI.
 * Anchors the search to the company industry and the current strategic topic (#111).
 */
async function generateResearchQueries(prisma, company, topic) {
  const industry = company.industry || (company.industries ? company.industries[0] : "General Business");
  const topicLabel = topic ? topic.label : "General Market Intelligence";
  const topicNotes = topic ? (topic.notes || "") : "";

  const systemPrompt = [
    "You are the Checklist RESEARCHER.",
    `Your goal is to generate 3 highly specific search queries for a company in the [${industry}] industry.`,
    topic ? `The queries MUST focus on the strategic topic: [${topicLabel}]. ${topicNotes}` : "Focus on general market trends, competitors, and growth opportunities.",
    "Rules:",
    "1. Queries must be specific (not 'marketing', but 'SaaS competitor pricing trends 2024').",
    "2. Return a JSON array of strings.",
    "3. No preamble. No explanations."
  ].join("\n");

  const userPrompt = `Company: ${company.name}\nIndustry: ${industry}\nTopic: ${topicLabel}\nNotes: ${topicNotes}`;

  try {
    const raw = await callOllamaWithFailover(systemPrompt, userPrompt, STAGE_MODELS.DRAFT);
    if (Array.isArray(raw)) return raw.slice(0, 3);
    if (typeof raw === "object" && raw.queries) return raw.queries.slice(0, 3);
    return [];
  } catch (err) {
    console.error(`[RESEARCH] Query generation failed: ${err.message}`);
    return [];
  }
}

/**
 * Performs a "Sovereign" search using DuckDuckGo HTML scraping.
 * Requires no API keys. Returns a list of result snippets.
 */
function harvestResearch(queries) {
  return Promise.all(queries.map(query => new Promise((resolve) => {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

    https.get(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" }
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        const results = [];
        // Basic scraping for title, link, and snippet
        // Pattern: <a class="result__a" href="...">TITLE</a> ... <a class="result__snippet" ...>SNIPPET</a>
        const resultBlocks = data.split('class="result__body"').slice(1, 4); // Take top 3 results per query

        resultBlocks.forEach(block => {
          const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
          const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
          const urlMatch = block.match(/href="([^"]*)"/);

          if (titleMatch && snippetMatch) {
            results.push({
              title: titleMatch[1].replace(/<[^>]*>/g, "").trim(),
              snippet: snippetMatch[1].replace(/<[^>]*>/g, "").trim(),
              url: urlMatch ? (urlMatch[1].startsWith("http") ? urlMatch[1] : `https:${urlMatch[1]}`) : ""
            });
          }
        });
        resolve(results);
      });
    }).on("error", (err) => {
      console.warn(`[RESEARCH] Search failed for "${query}": ${err.message}`);
      resolve([]);
    });
  }))).then(nested => nested.flat());
}

/**
 * Full Research Harvest Cycle: Query -> Harvest -> Ingest.
 * Returns an array of new Source objects (not yet saved to DB).
 */
async function performResearchHarvest(prisma, company, topic) {
  const queries = await generateResearchQueries(prisma, company, topic);
  if (queries.length === 0) {
    console.log(`[RESEARCH] ${company.name}: No queries generated for topic "${topic?.label || "General"}".`);
    return [];
  }

  console.log(`[RESEARCH] ${company.name}: Harvesting for [${queries.join(" | ")}]...`);
  const results = await harvestResearch(queries);

  if (results.length === 0) {
    return [];
  }

  return results.map(r => {
    // --- SOURCE QUALITY SCORING (#53) ---
    const score = Math.round(similarity(r.snippet + " " + r.title, topic?.label || "") * 10);
    const qualityScore = Math.max(1, Math.min(10, score));

    return {
      companyId: company.id,
      content: `${r.title}\n\n${r.snippet}\n\nSource: ${r.url}`,
      entityTag: "AGENT_FOUND",
      hashtags: topic?.hashtags || [],
      metadata: {
        type: "RESEARCH_HARVEST",
        query: queries[0], 
        harvestedAt: new Date().toISOString(),
        url: r.url,
        qualityScore
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
