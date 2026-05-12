export type UpstreamScoreProfile = {
  impact: number;
  confidence: number;
  weight: number;
  iceScore: number;
  scoreProfile?: Record<string, unknown> | null;
};

export function deriveDataCardScoreProfile(source?: Record<string, unknown>): UpstreamScoreProfile;
export function deriveTopicCardScoreProfile(topic?: Record<string, unknown>): UpstreamScoreProfile;
export function computeTopicRelevanceForSource(source?: Record<string, unknown>, topic?: Record<string, unknown>): number;
export function deriveFlashcardSourceSupport(source?: Record<string, unknown>, topics?: Record<string, unknown>[]): {
  sourceProfile: UpstreamScoreProfile;
  topicProfile: UpstreamScoreProfile | null;
  matchedTopics?: Array<{
    id: string;
    label: string;
    relevance: number;
    iceScore: number;
  }>;
  supportSignals: {
    sourceImpact: number;
    sourceConfidence: number;
    sourceWeight: number;
    topicImpact?: number;
    topicConfidence?: number;
    topicWeight?: number;
  };
};
