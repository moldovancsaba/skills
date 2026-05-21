import { ChecklistKanbanColumn, OpportunityType, Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { sanitizeOptionalUserFacingText } from "@/lib/ui-utils";
import {
  deriveOpportunityLane as deriveOpportunityLaneContract,
  normalizeOpportunityContactInfo as normalizeOpportunityContactInfoContract,
  normalizeOpportunityPayload as normalizeOpportunityPayloadContract,
  normalizeOpportunityType as normalizeOpportunityTypeContract,
  opportunityTypeHashtag as opportunityTypeHashtagContract,
} from "@/lib/opportunitycard-contract";

export const SALES_DEPARTMENT_KEY = "SALES";

export const OPPORTUNITY_TYPE_OPTIONS: OpportunityType[] = [
  "PROSPECT",
  "PARTNER",
  "RESELLER",
];

function normalizeText(value: string | null | undefined) {
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

export function opportunityTypeHashtag(opportunityType: OpportunityType) {
  return opportunityTypeHashtagContract(opportunityType) as Lowercase<OpportunityType>;
}

export function deriveOpportunityLane(iceScore: number): ChecklistKanbanColumn {
  return deriveOpportunityLaneContract(iceScore) as ChecklistKanbanColumn;
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
  scoreProfile?: Prisma.InputJsonValue | Prisma.JsonValue | null;
  salesGeographies?: string[] | null;
  contactInfo?: Prisma.InputJsonValue | Prisma.JsonValue | null;
}) {
  const normalized = normalizeOpportunityPayloadContract({
    ...input,
    opportunityType: OPPORTUNITY_TYPE_OPTIONS.includes(input.opportunityType || "PROSPECT")
      ? (input.opportunityType as OpportunityType)
      : normalizeOpportunityTypeContract(input.opportunityType),
    contactInfo: normalizeOpportunityContactInfoContract(input.contactInfo),
  });

  return {
    ...normalized,
    hashtags: Array.isArray(normalized.hashtags)
      ? normalized.hashtags.filter((tag): tag is string => typeof tag === "string" && tag.length > 0)
      : [],
    opportunityType: normalized.opportunityType as OpportunityType,
    salesGeographies: normalized.salesGeographies as string[],
    contactInfo: normalized.contactInfo as Prisma.InputJsonValue | null,
    scoreProfile: normalized.scoreProfile as Prisma.InputJsonValue | null,
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
