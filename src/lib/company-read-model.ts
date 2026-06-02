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
  webappProjection?: unknown;
};

const EMPTY_COUNTS: CompanyDashboardCounts = {
  sources: 0,
  files: 0,
  topics: 0,
  flashcards: 0,
  goals: 0,
  sales: 0,
  tacticalCount: 0,
  checklistCount: 0,
  reviewCount: 0,
  pipelineJobs: 0,
};

const EMPTY_NAV_COUNTS: CompanyNavCounts = {
  data: 0,
  topics: 0,
  knowmore: 0,
  goals: 0,
  sales: 0,
  review: 0,
  checklist: 0,
  tactical: 0,
  pipeline: 0,
};

const EMPTY_PLANNING_SUMMARY: CompanyPlanningSummary = {
  laneCounts: {
    IDEABANK: 0,
    ROADMAP: 0,
    BACKLOG: 0,
    TODO: 0,
    CHECKLIST: 0,
  },
  tacticalCount: 0,
  checklistCount: 0,
};

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
  const counts = projection?.counts
    ? {
        ...projection.counts,
        tacticalCount: Number(projection.counts.tacticalCount || 0),
        pipelineJobs: Number(projection.counts.pipelineJobs ?? 0),
      }
    : EMPTY_COUNTS;
  const navCounts = projection?.navCounts
    ? {
        ...projection.navCounts,
        checklist: Number(projection.navCounts.checklist ?? 0),
        tactical: Number(projection.navCounts.tactical ?? 0),
        pipeline: Number(projection.navCounts.pipeline ?? counts.pipelineJobs ?? 0),
      }
    : EMPTY_NAV_COUNTS;
  const planningSummary = projection?.planningSummary
    ? {
        ...projection.planningSummary,
        tacticalCount: Number(projection.planningSummary.tacticalCount ?? 0),
        checklistCount: Number(projection.planningSummary.checklistCount ?? 0),
      }
    : EMPTY_PLANNING_SUMMARY;

  return {
    projection,
    projectionFreshness,
    counts: {
      ...counts,
      tacticalCount: Number(counts.tacticalCount ?? 0),
      pipelineJobs: Number(counts.pipelineJobs ?? 0),
    },
    navCounts: {
      ...navCounts,
      checklist: Number(navCounts.checklist ?? 0),
      tactical: Number(navCounts.tactical ?? 0),
      pipeline: Number(navCounts.pipeline ?? counts.pipelineJobs ?? 0),
    },
    planningSummary,
    topTasks: projection?.topTasks ?? [],
  };
}
