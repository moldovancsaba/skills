import { calculateICEScore, clampMetric } from "@/lib/nba-scoring";

export type NBAKanbanColumn = "IDEABANK" | "ROADMAP" | "BACKLOG" | "TODO" | "CHECKLIST";

const COLUMN_INDEX: Record<NBAKanbanColumn, number> = {
  IDEABANK: 0,
  ROADMAP: 1,
  BACKLOG: 2,
  TODO: 3,
  CHECKLIST: 4,
};

export function getPlanningColumnDistance(from: NBAKanbanColumn, to: NBAKanbanColumn) {
  return Math.abs(COLUMN_INDEX[to] - COLUMN_INDEX[from]);
}

export function getPlanningColumnDirection(from: NBAKanbanColumn, to: NBAKanbanColumn) {
  return Math.sign(COLUMN_INDEX[to] - COLUMN_INDEX[from]);
}

export function derivePlanningHitlScoreAdjustment(from: NBAKanbanColumn, to: NBAKanbanColumn) {
  const distance = getPlanningColumnDistance(from, to);
  const direction = getPlanningColumnDirection(from, to);

  if (distance < 2 || direction === 0) {
    return {
      triggered: false,
      distance,
      direction,
      confidenceDelta: 0,
      impactDelta: 0,
    };
  }

  return {
    triggered: true,
    distance,
    direction,
    confidenceDelta: direction > 0 ? 2 : -2,
    impactDelta: direction > 0 ? 1 : -1,
  };
}

export function applyPlanningHitlScoreAdjustment(
  scores: {
    impact?: number | null;
    confidence?: number | null;
    ease?: number | null;
  },
  from: NBAKanbanColumn,
  to: NBAKanbanColumn,
) {
  const adjustment = derivePlanningHitlScoreAdjustment(from, to);
  const impact = clampMetric((scores.impact ?? 1) + adjustment.impactDelta);
  const confidence = clampMetric((scores.confidence ?? 1) + adjustment.confidenceDelta);
  const ease = clampMetric(scores.ease ?? 1);

  return {
    ...adjustment,
    impact,
    confidence,
    ease,
    iceScore: calculateICEScore({ impact, confidence, ease }),
  };
}
