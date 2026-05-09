export const SCORE_MIN: number;
export const SCORE_MAX: number;
export const KNOWLEDGE_ICE_DIVISOR: number;

export type CanonicalTripletInput = {
  impact?: number | null;
  confidence?: number | null;
  confidenceScore?: number | null;
  effort?: number | null;
  weight?: number | null;
  ease?: number | null;
  title?: string | null;
  description?: string | null;
  body?: string | null;
  kind?: string | null;
  evidence?: unknown;
  hashtags?: string[] | null;
};

export function clampMetric(value: number | null | undefined, min?: number, max?: number): number;
export function normalizeScoreTriplet(
  input?: CanonicalTripletInput,
  aliases?: CanonicalTripletInput,
): { impact: number; confidence: number; effort: number };
export function calculateTaskIceScore(input?: CanonicalTripletInput): number;
export function calculateKnowledgeIceScore(input?: CanonicalTripletInput): number;
export function normalizeTaskScores(input?: CanonicalTripletInput): {
  impact: number;
  confidence: number;
  confidenceScore: number;
  ease: number;
  iceScore: number;
};
export function normalizeKnowledgeScores(input?: CanonicalTripletInput): {
  impact: number;
  confidence: number;
  confidenceScore: number;
  weight: number;
  iceScore: number;
};
export function normalizeGoalScores(input?: CanonicalTripletInput): {
  impact: number;
  confidence: number;
  confidenceScore: number;
  weight: number;
  iceScore: number;
};
export function deriveSpecificitySignal(title?: string | null, description?: string | null): number;
export function deriveUrgencySignal(kind?: string | null, title?: string | null, description?: string | null): number;
export function deriveComplexitySignal(title?: string | null, description?: string | null): number;
export function deriveEvidenceStrengthSignal(input?: CanonicalTripletInput): number;
export function deriveKnowledgeKindSignal(kind?: string | null): number;
export function groundKnowledgeScores(input?: CanonicalTripletInput & {
  sourceImpact?: number | null;
  sourceConfidence?: number | null;
  sourceWeight?: number | null;
  topicImpact?: number | null;
  topicConfidence?: number | null;
  topicWeight?: number | null;
}): {
  impact: number;
  confidence: number;
  effort: number;
};
export function groundTaskScores(input?: CanonicalTripletInput & {
  sourceImpact?: number | null;
  sourceConfidence?: number | null;
  sourceWeight?: number | null;
  sourceIceScore?: number | null;
  flashcardImpact?: number | null;
  flashcardConfidence?: number | null;
  flashcardWeight?: number | null;
}): { impact: number; confidence: number; effort: number };
export function enrichTaskDraftScores(input?: CanonicalTripletInput & {
  sourceImpact?: number | null;
  sourceConfidence?: number | null;
  sourceWeight?: number | null;
  flashcardImpact?: number | null;
  flashcardConfidence?: number | null;
  flashcardWeight?: number | null;
}): { impact: number; confidence: number; effort: number };
