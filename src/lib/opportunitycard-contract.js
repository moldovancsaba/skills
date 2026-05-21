const { normalizeTaskScores } = require("./scoring-contract");

const OPPORTUNITY_LANE_THRESHOLDS = Object.freeze([
  { minIce: 90, column: "CHECKLIST" },
  { minIce: 75, column: "TODO" },
  { minIce: 60, column: "BACKLOG" },
  { minIce: 45, column: "ROADMAP" },
  { minIce: 0, column: "IDEABANK" },
]);

function normalizeText(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

function normalizeStringArray(values) {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .map((value) => normalizeText(String(value || "").replace(/^#/, "")))
        .filter(Boolean),
    ),
  );
}

function normalizeOpportunityType(value) {
  const candidate = String(value || "PROSPECT").trim().toUpperCase();
  return candidate === "PARTNER" || candidate === "RESELLER" ? candidate : "PROSPECT";
}

function opportunityTypeHashtag(opportunityType) {
  return normalizeOpportunityType(opportunityType).toLowerCase();
}

function deriveOpportunityLane(iceScore) {
  const score = Number(iceScore || 0);
  return OPPORTUNITY_LANE_THRESHOLDS.find((entry) => score >= entry.minIce)?.column || "IDEABANK";
}

function normalizeOpportunityContactInfo(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}

function normalizeOpportunityPayload(input = {}) {
  const title = normalizeText(input.title) || normalizeText(input.companyName) || "Opportunitycard";
  const companyName = normalizeText(input.companyName) || title;
  const coreOffer = normalizeText(input.coreOffer);
  const fitRationale = normalizeText(input.fitRationale);
  const body =
    normalizeText(input.body) ||
    [coreOffer, fitRationale].filter(Boolean).join("\n\n") ||
    "Sales opportunity candidate.";
  const opportunityType = normalizeOpportunityType(input.opportunityType);
  const hashtags = normalizeStringArray([
    opportunityTypeHashtag(opportunityType),
    ...(Array.isArray(input.hashtags) ? input.hashtags : []),
  ]);
  const normalizedScores = normalizeTaskScores({
    title,
    description: body,
    kind: "OPPORTUNITY",
    impact: input.impact ?? 5,
    confidence: input.confidence ?? input.confidenceScore ?? 5,
    confidenceScore: input.confidenceScore ?? input.confidence ?? 5,
    effort: input.weight ?? input.ease ?? 5,
    weight: input.weight ?? input.ease ?? 5,
    hashtags,
    scoreProfile: input.scoreProfile ?? undefined,
  });

  return {
    companyName,
    title,
    body,
    website: normalizeText(input.website),
    linkedinUrl: normalizeText(input.linkedinUrl),
    instagramUrl: normalizeText(input.instagramUrl),
    facebookUrl: normalizeText(input.facebookUrl),
    xUrl: normalizeText(input.xUrl),
    location: normalizeText(input.location),
    coreOffer,
    financialBackground: normalizeText(input.financialBackground),
    fitRationale,
    salesGeographies: normalizeStringArray(input.salesGeographies),
    contactInfo: normalizeOpportunityContactInfo(input.contactInfo),
    opportunityType,
    hashtags,
    confidence: normalizedScores.confidence,
    confidenceScore: normalizedScores.confidenceScore,
    impact: normalizedScores.impact,
    weight: normalizedScores.ease,
    iceScore: normalizedScores.iceScore,
    scoreProfile: normalizedScores.scoreProfile || null,
  };
}

module.exports = {
  OPPORTUNITY_LANE_THRESHOLDS,
  deriveOpportunityLane,
  normalizeOpportunityPayload,
  normalizeOpportunityType,
  normalizeOpportunityContactInfo,
  opportunityTypeHashtag,
};
