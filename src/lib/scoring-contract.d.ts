export const SCORE_MIN: number;
export const SCORE_MAX: number;
export const KNOWLEDGE_ICE_DIVISOR: number;
export const PRIORITY_SCORE_MAX: number;
export const PRIORITY_WEIGHTS: Readonly<{
  ice: number;
  quality: number;
  urgency: number;
  freshness: number;
  human: number;
  risk: number;
}>;
export const PRIORITY_STATE_MULTIPLIERS: Readonly<Record<string, number>>;

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
  iceScore?: number | null;
  qualityScore?: number | null;
  urgencyScore?: number | null;
  freshnessScore?: number | null;
  feedbackScore?: number | null;
  candidateState?: string | null;
  activityState?: string | null;
  processingStatus?: string | null;
  sortOrder?: number | null;
  controlMode?: string | null;
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
  rottenAt?: Date | string | null;
  freshnessWindowDays?: number | null;
  memoryMultiplier?: number | null;
  _memoryMultiplier?: number | null;
  priorityIceMax?: number | null;
  scoreProfile?: unknown;
};

export type ScoreTriplet = {
  impact: number;
  confidence: number;
  effort: number;
};

export type ScoreFactorSignal = {
  label: string;
  signal: number;
};

export type ScoreFactorBucket = Record<string, ScoreFactorSignal>;

export type ScoreFactorCollection = {
  impact: ScoreFactorBucket;
  confidence: ScoreFactorBucket;
  effort: ScoreFactorBucket;
};

export type ScoreProfile = {
  version: number;
  scoreKind: string;
  agentWeight: number;
  agent: ScoreTriplet;
  calibrated: ScoreTriplet;
  final: ScoreTriplet & { iceScore: number };
  factors?: {
    agent: ScoreFactorCollection;
    calibrated: ScoreFactorCollection;
    final: {
      impact: {
        blendedScore: number;
        agentScore: number;
        calibratedScore: number;
        dominantSignals: Array<{ key: string; label: string; signal: number }>;
      };
      confidence: {
        blendedScore: number;
        agentScore: number;
        calibratedScore: number;
        dominantSignals: Array<{ key: string; label: string; signal: number }>;
      };
      effort: {
        blendedScore: number;
        agentScore: number;
        calibratedScore: number;
        dominantSignals: Array<{ key: string; label: string; signal: number }>;
      };
    };
  };
  rationale: Record<string, unknown> | null;
  generatedAt: string;
};

export function clampMetric(value: number | null | undefined, min?: number, max?: number): number;
export function roundMetricToInt(value: number | null | undefined, min?: number, max?: number): number;
export function clampUnit(value: number | null | undefined, fallback?: number): number;
export function normalizeScoreTriplet(
  input?: CanonicalTripletInput,
  aliases?: CanonicalTripletInput,
): ScoreTriplet;
export function calculateTaskIceScore(input?: CanonicalTripletInput): number;
export function calculateKnowledgeIceScore(input?: CanonicalTripletInput): number;
export function normalizeIceSignal(iceScore?: number | null, maxScore?: number): number;
export function computeImpliedFreshnessSignal(input?: CanonicalTripletInput): number;
export function computeHumanPrioritySignal(input?: CanonicalTripletInput): number;
export function computeRiskPrioritySignal(input?: CanonicalTripletInput): number;
export function blendScoreTriplets(
  agentInput?: CanonicalTripletInput,
  calibratedInput?: CanonicalTripletInput,
  agentWeight?: number,
): {
  agent: ScoreTriplet;
  calibrated: ScoreTriplet;
  final: ScoreTriplet;
};
export function buildScoreProfile(input?: {
  scoreKind?: string | null;
  agent?: CanonicalTripletInput;
  calibrated?: CanonicalTripletInput;
  agentFactors?: Partial<ScoreFactorCollection> | null;
  calibratedFactors?: Partial<ScoreFactorCollection> | null;
  agentWeight?: number | null;
  rationale?: Record<string, unknown> | null;
}): ScoreProfile;
export function scoreProfileTriplet(
  profile?: ScoreProfile | Record<string, unknown> | null,
  fallbacks?: CanonicalTripletInput,
): ScoreTriplet;
export function computeBlendedPriorityProfile(input?: CanonicalTripletInput): {
  score: number;
  baseScore?: number;
  manualAnchor: boolean;
  stateMultiplier: number;
  memoryMultiplier: number;
  components: {
    ice: number;
    quality: number;
    urgency: number;
    freshness: number;
    human: number;
    risk: number;
  };
  weights: typeof PRIORITY_WEIGHTS;
  reasons: string[];
  cohort?: {
    rank: number;
    total: number;
    percentile: number;
    bucket: number;
    bucketCount: number;
    spreadBoost: number;
    rankBlend: number;
    densityPenalty: number;
  };
};
export function computePriorityCohortProfiles(
  inputs?: CanonicalTripletInput[],
  options?: { bucketSize?: number | null },
): Array<ReturnType<typeof computeBlendedPriorityProfile>>;
export function persistTaskScoresFromProfile(profile?: ScoreProfile | Record<string, unknown> | null): {
  impact: number;
  confidence: number;
  confidenceScore: number;
  ease: number;
  iceScore: number;
};
export function persistKnowledgeScoresFromProfile(profile?: ScoreProfile | Record<string, unknown> | null): {
  impact: number;
  confidence: number;
  confidenceScore: number;
  weight: number;
  iceScore: number;
};
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
export function deriveDependencyLoadSignal(title?: string | null, description?: string | null): number;
export function deriveCoordinationBurdenSignal(title?: string | null, description?: string | null): number;
export function deriveExpertiseRequirementSignal(title?: string | null, description?: string | null): number;
export function deriveTimeToValueDifficultySignal(title?: string | null, description?: string | null): number;
export function deriveEvidenceStrengthSignal(input?: CanonicalTripletInput): number;
export function deriveKnowledgeKindSignal(kind?: string | null): number;
export function groundKnowledgeScores(input?: CanonicalTripletInput & {
  sourceImpact?: number | null;
  sourceConfidence?: number | null;
  sourceWeight?: number | null;
  topicImpact?: number | null;
  topicConfidence?: number | null;
  topicWeight?: number | null;
  historyImpact?: number | null;
  historyConfidence?: number | null;
  historySupport?: number | null;
}): {
  impact: number;
  confidence: number;
  effort: number;
  factors: ScoreFactorCollection;
};
export function groundTaskScores(input?: CanonicalTripletInput & {
  sourceImpact?: number | null;
  sourceConfidence?: number | null;
  sourceWeight?: number | null;
  sourceIceScore?: number | null;
  flashcardImpact?: number | null;
  flashcardConfidence?: number | null;
  flashcardWeight?: number | null;
  historyImpact?: number | null;
  historyConfidence?: number | null;
  historySupport?: number | null;
  historyEase?: number | null;
  historyDifficulty?: number | null;
}): { impact: number; confidence: number; effort: number; factors: ScoreFactorCollection };
export function enrichTaskDraftScores(input?: CanonicalTripletInput & {
  sourceImpact?: number | null;
  sourceConfidence?: number | null;
  sourceWeight?: number | null;
  flashcardImpact?: number | null;
  flashcardConfidence?: number | null;
  flashcardWeight?: number | null;
  historyImpact?: number | null;
  historyConfidence?: number | null;
  historySupport?: number | null;
  historyEase?: number | null;
  historyDifficulty?: number | null;
}): { impact: number; confidence: number; effort: number; factors: ScoreFactorCollection };
