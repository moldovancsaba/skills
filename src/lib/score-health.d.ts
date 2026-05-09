export type ScoreHealthSeverity = "HEALTHY" | "WARNING" | "SUSPICIOUS" | "CRITICAL";

export type ScoreHealthAlert = {
  scope: "TASK" | "KNOWLEDGE";
  metric: "dominantIceScore" | "dominantTuple" | "uniqueTupleRatio";
  severity: ScoreHealthSeverity;
  actualShare: number;
  thresholdShare: number;
  detail: string;
};

export type ScoreHealthSurface = {
  count: number;
  uniqueIceScores: number;
  uniqueTriples: number;
  diversityRatio: number;
  dominantIceScore: number | null;
  dominantIceShare: number;
  dominantTuple: {
    label: string;
    count: number;
    share: number;
  } | null;
  dominantIceSeverity: ScoreHealthSeverity;
  dominantTupleSeverity: ScoreHealthSeverity;
  diversitySeverity: ScoreHealthSeverity;
  overallSeverity: ScoreHealthSeverity;
  alerts: ScoreHealthAlert[];
};

export type ScoreHealthThresholds = {
  exactScoreShare: {
    healthyMax: number;
    warningMin: number;
    suspiciousMin: number;
    criticalMin: number;
  };
  exactTupleShare: {
    healthyMax: number;
    warningMin: number;
    suspiciousMin: number;
    criticalMin: number;
  };
  uniqueTupleRatio: {
    healthyMin: number;
    warningMax: number;
    suspiciousMax: number;
    criticalMax: number;
  };
};

export type CompanyScoreHealth = {
  companyId: string;
  generatedAt: string;
  overallBand: ScoreHealthSeverity;
  dominantSurface: "TASK" | "KNOWLEDGE" | "BALANCED";
  taskcards: ScoreHealthSurface;
  knowledge: ScoreHealthSurface;
  thresholds: ScoreHealthThresholds;
  alerts: ScoreHealthAlert[];
};

export const SCORE_HEALTH_THRESHOLDS: ScoreHealthThresholds;
export function computeCompanyScoreHealth(companyId: string, prismaClient?: unknown): Promise<CompanyScoreHealth>;
export const defaultPrisma: unknown;
