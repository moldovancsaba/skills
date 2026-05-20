import { ChecklistKanbanColumn, OpportunityType, Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { normalizeTaskScores } from "@/lib/scoring-contract";
import { sanitizeOptionalUserFacingText } from "@/lib/ui-utils";

export const SALES_DEPARTMENT_KEY = "SALES";

export const OPPORTUNITY_TYPE_OPTIONS: OpportunityType[] = [
  "PROSPECT",
  "PARTNER",
  "RESELLER",
];

const OPPORTUNITY_LANE_THRESHOLDS: Array<{ minIce: number; column: ChecklistKanbanColumn }> = [
  { minIce: 80, column: "CHECKLIST" },
  { minIce: 60, column: "TODO" },
  { minIce: 40, column: "BACKLOG" },
  { minIce: 20, column: "ROADMAP" },
  { minIce: 0, column: "IDEABANK" },
];

function normalizeText(value: string | null | undefined) {
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

export function opportunityTypeHashtag(opportunityType: OpportunityType) {
  return opportunityType.toLowerCase();
}

export function deriveOpportunityLane(iceScore: number): ChecklistKanbanColumn {
  const numericIce = Number(iceScore || 0);
  return OPPORTUNITY_LANE_THRESHOLDS.find((entry) => numericIce >= entry.minIce)?.column || "IDEABANK";
}

export function buildOpportunityFingerprint(input: {
  website?: string | null;
  companyName?: string | null;
  opportunityType?: OpportunityType | null;
}) {
  const website = normalizeText(input.website)?.toLowerCase() || "";
  const companyName = normalizeText(input.companyName)?.toLowerCase() || "";
  const opportunityType = String(input.opportunityType || "PROSPECT").toUpperCase();
  return createHash("sha1").update(`${website}|${companyName}|${opportunityType}`).digest("hex");
}

export function normalizeOpportunityPayload(input: {
  title?: string | null;
  body?: string | null;
  companyName?: string | null;
  website?: string | null;
  linkedinUrl?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  xUrl?: string | null;
  location?: string | null;
  coreOffer?: string | null;
  financialBackground?: string | null;
  fitRationale?: string | null;
  opportunityType?: OpportunityType | null;
  hashtags?: string[] | null;
  confidence?: number | null;
  confidenceScore?: number | null;
  impact?: number | null;
  weight?: number | null;
  scoreProfile?: Prisma.JsonValue | null;
  salesGeographies?: string[] | null;
  contactInfo?: Prisma.JsonValue | null;
}) {
  const companyName = normalizeText(input.companyName) || normalizeText(input.title) || "Untitled Company";
  const coreOffer = normalizeText(input.coreOffer);
  const fitRationale = normalizeText(input.fitRationale);
  const body =
    normalizeText(input.body) ||
    [coreOffer, fitRationale].filter(Boolean).join("\n\n") ||
    "Sales opportunity candidate.";
  const title = normalizeText(input.title) || companyName;
  const opportunityType = OPPORTUNITY_TYPE_OPTIONS.includes(input.opportunityType || "PROSPECT")
    ? (input.opportunityType as OpportunityType)
    : "PROSPECT";
  const scored = normalizeTaskScores({
    title,
    description: body,
    impact: input.impact ?? 5,
    confidence: input.confidence ?? input.confidenceScore ?? 5,
    confidenceScore: input.confidenceScore ?? input.confidence ?? 5,
    effort: input.weight ?? 5,
    weight: input.weight ?? 5,
    hashtags: input.hashtags ?? [],
    scoreProfile: input.scoreProfile ?? undefined,
    kind: "OPPORTUNITY",
  });
  const baseHashtags = Array.isArray(input.hashtags) ? input.hashtags.filter(Boolean).map((tag) => String(tag).trim().toLowerCase()) : [];
  const hashtags = Array.from(new Set([opportunityTypeHashtag(opportunityType), ...baseHashtags]));

  return {
    title,
    body,
    companyName,
    website: normalizeText(input.website),
    linkedinUrl: normalizeText(input.linkedinUrl),
    instagramUrl: normalizeText(input.instagramUrl),
    facebookUrl: normalizeText(input.facebookUrl),
    xUrl: normalizeText(input.xUrl),
    location: normalizeText(input.location),
    coreOffer,
    financialBackground: normalizeText(input.financialBackground),
    fitRationale,
    opportunityType,
    hashtags,
    salesGeographies: Array.isArray(input.salesGeographies)
      ? Array.from(new Set(input.salesGeographies.map((entry) => String(entry).trim()).filter(Boolean)))
      : [],
    contactInfo: input.contactInfo ?? {},
    confidence: scored.confidence,
    confidenceScore: scored.confidenceScore,
    impact: scored.impact,
    weight: scored.ease,
    iceScore: scored.iceScore,
    scoreProfile: scored.scoreProfile,
  };
}

export function buildOpportunityLearningAnnotation(input: {
  declineReason?: string | null;
  annotation?: string | null;
}) {
  const parts = [
    normalizeText(input.declineReason),
    sanitizeOptionalUserFacingText(input.annotation),
  ].filter(Boolean);
  return parts.join(" · ") || null;
}
