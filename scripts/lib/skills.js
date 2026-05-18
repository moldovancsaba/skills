/**
 * checklist MARKETING SKILL LIBRARY
 *
 * Specialized marketing frameworks used by the drafter to categorize and
 * process intelligence across different domains.
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
  },
  COMPETITOR_INTEL: {
    id: "competitor-intel",
    label: "Competitor Intelligence",
    framework: [
      "Gap Analysis: What feature or benefit are they missing?",
      "USP Mapping: Where is our solution objectively superior?",
      "Pricing Model: How does their pricing structure compare?",
      "Market Share: Their estimated dominance in specific segments."
    ].join("\n"),
    triggers: ["competitor", "rival", "alternative", "comparison", "swot"]
  },
  CUSTOMER_SEGMENT: {
    id: "customer-segment",
    label: "Customer Segmentation & ICP",
    framework: [
      "Job-to-be-Done: What is the customer actually trying to achieve?",
      "Pain Points: The specific negative outcomes they fear most.",
      "Firmographics: Company size, industry, revenue, and geography.",
      "Personas: Decision makers, influencers, and end-users."
    ].join("\n"),
    triggers: ["customer", "persona", "icp", "target-audience", "user-research"]
  },
  LEAD_SCORING: {
    id: "lead-scoring",
    label: "Lead Qualification & Scoring",
    framework: [
      "Intent: High-value actions (pricing page visits, demo requests).",
      "Fit: Alignment with our Ideal Customer Profile (ICP).",
      "Urgency: Timeframe for decision making.",
      "Authority: Does the contact have budget and signing power?"
    ].join("\n"),
    triggers: ["lead", "prospect", "pipeline", "qualification", "scoring"]
  },
  TREND_DETECTION: {
    id: "trend-detection",
    label: "Market Trend & Sentiment",
    framework: [
      "Sentiment: Is the market moving towards or away from this topic?",
      "Emerging Tech: New tools or standards disrupting the space.",
      "Regulatory: Changes in law or policy affecting the industry.",
      "Hype vs Reality: Distinguishing short-term noise from long-term shifts."
    ].join("\n"),
    triggers: ["trend", "forecast", "future", "shift", "prediction", "market-report"]
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
