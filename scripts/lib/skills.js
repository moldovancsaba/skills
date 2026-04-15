/**
 * SOVEREIGN MARKETING SKILL LIBRARY
 * v0.11.4-STABLE
 * 
 * Defines specialized marketing frameworks used by the Drafter to categorize 
 * and process intelligence across different domains.
 */

const MARKETING_SKILLS = {
  PAGE_CRO: {
    id: "page-cro",
    label: "Conversion Rate Optimization (Page)",
    framework: [
      "AIDA: Attention (Hook), Interest (Features), Desire (Benefits), Action (CTA).",
      "Clarity: Is the value proposition clear in 5 seconds?",
      "Trust: Social proof, testimonials, and authority signals.",
      "Friction: Identifying and removing barriers to conversion."
    ].join("\n"),
    triggers: ["landing-page", "homepage", "sales-page", "pricing"]
  },
  SEO_AUDIT: {
    id: "seo-audit",
    label: "SEO Presence & Discovery",
    framework: [
      "Metadata: Title tags and descriptions for search intent.",
      "Hierarchy: Proper H1-H3 structure and semantic HTML.",
      "Discoverability: Ease of crawling and indexability.",
      "Keywords: Matching page content to high-intent search terms."
    ].join("\n"),
    triggers: ["blog-post", "article", "documentation", "guide"]
  },
  STRATEGY_PAS: {
    id: "strategy-pas",
    label: "Strategic Messaging (PAS)",
    framework: [
      "Problem: Explicitly define the core pain point.",
      "Agitation: Make the cost of inaction visible and emotional.",
      "Solution: Present the product as the inevitable relief.",
      "Difference: How this solution departs from status-quo alternatives."
    ].join("\n"),
    triggers: ["pitch-deck", "whitepaper", "competitor-analysis", "company-description"]
  }
};

/**
 * Identifies and returns a relevant marketing skill framework based on content triggers.
 * Analyzes raw content strings, entity tags, and source metadata.
 * 
 * @param {object} source - Raw source/datacard record
 * @returns {object|null} Matched skill object or null
 */
function getSkillForSource(source) {
  const content = (source.content || "").toLowerCase();
  const tag = (source.entityTag || "").toLowerCase();
  const metadata = source.metadata || {};
  const origin = (metadata.origin || "").toLowerCase();

  for (const key in MARKETING_SKILLS) {
    const skill = MARKETING_SKILLS[key];
    const isMatched = skill.triggers.some(t => 
      content.includes(t) || 
      tag.includes(t) || 
      origin.includes(t)
    );
    if (isMatched) return skill;
  }

  return null;
}

module.exports = {
  MARKETING_SKILLS,
  getSkillForSource
};
