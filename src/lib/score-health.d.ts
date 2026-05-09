export type ScoreHealthBand = "HEALTHY" | "WARNING" | "CRITICAL";

export type DominantScoreTuple = {
  label: string;
  count: number;
  share: number;
};

export type ScoreHealthMetrics = {
  count: number;
  uniqueIceScores: number;
  uniqueTriples: number;
  diversityRatio: number;
  dominantIceScore: number | null;
  dominantIceShare: number;
  dominantTuple: DominantScoreTuple | null;
};

export type CompanyScoreHealth = {
  companyId: string;
  generatedAt: string;
  taskcards: ScoreHealthMetrics;
  knowledge: ScoreHealthMetrics;
  overallBand: ScoreHealthBand;
  dominantSurface: "TASK" | "KNOWLEDGE" | "BALANCED";
};

export function computeCompanyScoreHealth(companyId: string, prismaClient?: unknown): Promise<CompanyScoreHealth>;
