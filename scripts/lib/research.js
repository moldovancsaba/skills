const https = require("https");
const { tokenizeText, unique, truncate, hashValue, similarity } = require("./shared");
const { callOllamaWithFailover } = require("./ai");
const { STAGE_MODELS } = require("./core");

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

/**
 * Robust Research Harvest (v2.0.0)
 * Switched to DuckDuckGo Lite for better bot resilience and simplified parsing.
 */
function harvestResearch(queries) {
  return Promise.all(queries.map(query => new Promise((resolve) => {
    const encodedQuery = encodeURIComponent(query);
    // Use DuckDuckGo Lite which is more stable for scraping
    const url = `https://duckduckgo.com/lite/?q=${encodedQuery}`;

    const options = {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5"
      }
    };

    https.get(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", async () => {
        const results = [];
        // DDG Lite uses table-based layout
        const resultBlocks = data.split('class="result-link"').slice(1, 6);

        for (const block of resultBlocks) {
          const titleMatch = block.match(/>([^<]+)<\/a>/);
          const urlMatch = block.match(/href="([^"]+)"/);
          // Snippet is usually in the next row or sibling
          const snippetMatch = data.split(block)[1]?.match(/class="result-snippet">([\s\S]*?)<\/td>/);

          if (titleMatch && urlMatch) {
            const rawUrl = urlMatch[1];
            const title = titleMatch[1].trim();
            const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, "").trim() : "";
            
            results.push({
              title,
              snippet: snippet || "Click to view full intelligence source.",
              url: rawUrl,
              query,
            });
          }
        }
        resolve(results);
      });
    }).on("error", () => resolve([]));
  }))).then(nested => nested.flat());
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
