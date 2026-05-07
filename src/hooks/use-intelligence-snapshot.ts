import { useState, useEffect, useCallback } from 'react';

/**
 * useIntelligenceSnapshot Hook
 * v0.16.0
 * 
 * Centralized hook for State Snapshot Architecture.
 * Ensures every page reads from the same pre-calculated authority.
 */

export type IntelligenceSnapshot = {
  dataIngressCount: number;
  topicSynthesisCount: number;
  knowmoreCount: number;
  strategicGoalsCount: number;
  checklistCount: number;
  tacticalBoardCount: number;
  reviewGatewayCount: number;
  synthesisYield: number;
  confidenceAvg: number;
  iceScoreAvg: number;
  easeScoreAvg: number;
  engineStatus: string;
  activeContext: string;
  activeTask: string;
  stage: string;
  updatedAt: string;
  analyticsHistory: Array<{
    date: string;
    sources: number;
    topics: number;
    flashcards: number;
    nba: number;
  }>;
};

export function useIntelligenceSnapshot(companyId: string | undefined) {
  const [snapshot, setSnapshot] = useState<IntelligenceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      // We fetch from the unified dashboard API which now serves the snapshot
      const res = await fetch(`/api/companies/${companyId}/dashboard`);
      if (!res.ok) throw new Error("Snapshot synchronization failure");
      const data = await res.json();
      
      // Map the dashboard API structure to our snapshot hook
      setSnapshot({
        dataIngressCount: data.counts.sources,
        topicSynthesisCount: data.counts.topics,
        knowmoreCount: data.counts.flashcards,
        strategicGoalsCount: data.counts.goals,
        checklistCount: data.counts.checklistCount,
        tacticalBoardCount: data.counts.nbaItems,
        reviewGatewayCount: data.counts.reviewCount,
        synthesisYield: data.metrics?.synthesisYield || 0,
        confidenceAvg: data.metrics?.confidenceAvg || 0,
        iceScoreAvg: data.metrics?.iceScoreAvg || 0,
        easeScoreAvg: data.metrics?.easeScoreAvg || 0,
        engineStatus: data.state.engineStatus,
        activeContext: data.state.activeContext,
        activeTask: data.state.activeTask,
        stage: data.state.stage,
        updatedAt: data.state.updatedAt,
        analyticsHistory: data.analytics
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync error");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { snapshot, loading, error, refresh };
}
