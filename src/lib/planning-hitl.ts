import { calculateChecklistIceScore, clampMetric } from "@/lib/checklist-scoring";

export type ChecklistKanbanColumn = "IDEABANK" | "ROADMAP" | "BACKLOG" | "TODO" | "CHECKLIST";

const COLUMN_INDEX: Record<ChecklistKanbanColumn, number> = {
  IDEABANK: 0,
  ROADMAP: 1,
  BACKLOG: 2,
  TODO: 3,
  CHECKLIST: 4,
};

export function getPlanningColumnDistance(from: ChecklistKanbanColumn, to: ChecklistKanbanColumn) {
  return Math.abs(COLUMN_INDEX[to] - COLUMN_INDEX[from]);
}

export function getPlanningColumnDirection(from: ChecklistKanbanColumn, to: ChecklistKanbanColumn) {
  return Math.sign(COLUMN_INDEX[to] - COLUMN_INDEX[from]);
}

export function derivePlanningHitlScoreAdjustment(from: ChecklistKanbanColumn, to: ChecklistKanbanColumn) {
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
  from: ChecklistKanbanColumn,
  to: ChecklistKanbanColumn,
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
    iceScore: calculateChecklistIceScore({ impact, confidence, ease }),
  };
}
