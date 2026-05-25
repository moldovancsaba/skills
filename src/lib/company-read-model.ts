import {
  getProjectionFreshness,
  normalizeWebappProjection,
  type ProjectionFreshness,
  type WebappProjection,
  type WebappProjectionTask,
} from "@/lib/webapp-projection";

export type CompanyDashboardCounts = {
  sources: number;
  files: number;
  topics: number;
  flashcards: number;
  goals: number;
  sales: number;
  tacticalCount: number;
  checklistCount: number;
  reviewCount: number;
  pipelineJobs: number;
};

export type CompanyNavCounts = {
  data: number;
  topics: number;
  knowmore: number;
  goals: number;
  sales: number;
  review: number;
  checklist: number;
  tactical: number;
  pipeline: number;
};

export type CompanyPlanningSummary = WebappProjection["planningSummary"];

type SnapshotReadModelFields = {
  dataIngressCount?: number | null;
  topicSynthesisCount?: number | null;
  knowmoreCount?: number | null;
  strategicGoalsCount?: number | null;
  checklistCount?: number | null;
  tacticalBoardCount?: number | null;
  reviewGatewayCount?: number | null;
  observabilitySummary?: unknown;
  webappProjection?: unknown;
};

function readQueueTotal(observabilitySummary: unknown): number | null {
  if (!observabilitySummary || typeof observabilitySummary !== "object") {
    return null;
  }

  const summary = observabilitySummary as Record<string, unknown>;
  if (!summary.queue || typeof summary.queue !== "object") {
    return null;
  }

  const queue = summary.queue as Record<string, unknown>;
  return Number(queue.totalActiveJobs ?? 0);
}

function buildCountsFromSnapshot(snapshot: SnapshotReadModelFields | null | undefined): CompanyDashboardCounts {
  const checklistCount = Number(snapshot?.checklistCount ?? 0);
  return {
    sources: Number(snapshot?.dataIngressCount ?? 0),
    files: 0,
    topics: Number(snapshot?.topicSynthesisCount ?? 0),
    flashcards: Number(snapshot?.knowmoreCount ?? 0),
    goals: Number(snapshot?.strategicGoalsCount ?? 0),
    sales: 0,
    tacticalCount: Math.max(Number(snapshot?.tacticalBoardCount ?? 0), checklistCount),
    checklistCount,
    reviewCount: Number(snapshot?.reviewGatewayCount ?? 0),
    pipelineJobs: Number(readQueueTotal(snapshot?.observabilitySummary) ?? 0),
  };
}

function buildNavCountsFromDashboard(counts: CompanyDashboardCounts): CompanyNavCounts {
  const checklistCount = Number(counts.checklistCount ?? 0);
  return {
    data: Number(counts.sources ?? 0),
    topics: Number(counts.topics ?? 0),
    knowmore: Number(counts.flashcards ?? 0),
    goals: Number(counts.goals ?? 0),
    sales: Number(counts.sales ?? 0),
    review: Number(counts.reviewCount ?? 0),
    checklist: checklistCount,
    tactical: Math.max(Number(counts.tacticalCount ?? 0), checklistCount),
    pipeline: Number(counts.pipelineJobs ?? 0),
  };
}

function buildPlanningSummaryFromSnapshot(snapshot: SnapshotReadModelFields | null | undefined): CompanyPlanningSummary {
  const checklistCount = Number(snapshot?.checklistCount ?? 0);
  return {
    laneCounts: {
      IDEABANK: 0,
      ROADMAP: 0,
      BACKLOG: 0,
      TODO: 0,
      CHECKLIST: checklistCount,
    },
    tacticalCount: Math.max(Number(snapshot?.tacticalBoardCount ?? 0), checklistCount),
    checklistCount,
  };
}

export type CompanyReadModel = {
  projection: WebappProjection | null;
  projectionFreshness: ProjectionFreshness;
  counts: CompanyDashboardCounts;
  navCounts: CompanyNavCounts;
  planningSummary: CompanyPlanningSummary;
  topTasks: WebappProjectionTask[];
};

export function buildCompanyReadModel(snapshot: SnapshotReadModelFields | null | undefined): CompanyReadModel {
  const projection = normalizeWebappProjection(snapshot?.webappProjection);
  const projectionFreshness = getProjectionFreshness(projection?.generatedAt ?? null);
  const queueTotal = readQueueTotal(snapshot?.observabilitySummary);
  const counts = projection?.counts
    ? {
        ...projection.counts,
        tacticalCount: Math.max(projection.counts.tacticalCount, projection.counts.checklistCount),
        pipelineJobs: Number(queueTotal ?? projection.counts.pipelineJobs ?? 0),
      }
    : buildCountsFromSnapshot(snapshot);
  const navCounts = projection?.navCounts
    ? {
        ...projection.navCounts,
        checklist: Number(projection.navCounts.checklist ?? counts.checklistCount ?? 0),
        tactical: Math.max(
          Number(projection.navCounts.tactical ?? counts.tacticalCount ?? 0),
          Number(projection.navCounts.checklist ?? counts.checklistCount ?? 0),
        ),
        pipeline: Number(queueTotal ?? projection.navCounts.pipeline ?? counts.pipelineJobs ?? 0),
      }
    : buildNavCountsFromDashboard(counts);
  const planningSummary = projection?.planningSummary
    ? {
        ...projection.planningSummary,
        tacticalCount: Math.max(
          Number(projection.planningSummary.tacticalCount ?? counts.tacticalCount ?? 0),
          Number(projection.planningSummary.checklistCount ?? counts.checklistCount ?? 0),
        ),
        checklistCount: Number(projection.planningSummary.checklistCount ?? counts.checklistCount ?? 0),
      }
    : buildPlanningSummaryFromSnapshot(snapshot);

  return {
    projection,
    projectionFreshness,
    counts: {
      ...counts,
      tacticalCount: Math.max(Number(counts.tacticalCount ?? 0), Number(counts.checklistCount ?? 0)),
      pipelineJobs: Number(counts.pipelineJobs ?? 0),
    },
    navCounts: {
      ...navCounts,
      checklist: Number(navCounts.checklist ?? counts.checklistCount ?? 0),
      tactical: Math.max(Number(navCounts.tactical ?? 0), Number(navCounts.checklist ?? 0)),
      pipeline: Number(navCounts.pipeline ?? counts.pipelineJobs ?? 0),
    },
    planningSummary,
    topTasks: projection?.topTasks ?? [],
  };
}
