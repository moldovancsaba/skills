type ProjectionCounts = {
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

export const WEBAPP_SUMMARY_REFRESH_MS = 60 * 60 * 1000;

type PlanningLaneCounts = {
  IDEABANK: number;
  ROADMAP: number;
  BACKLOG: number;
  TODO: number;
  CHECKLIST: number;
};

export type ProjectionFreshness = {
  status: "FRESH" | "AGING" | "STALE" | "MISSING";
  generatedAt: string | null;
  ageMinutes: number | null;
};

export type WebappProjectionTask = {
  id: string;
  publicId: number | null;
  title: string;
  description: string | null;
  impact: number;
  confidenceScore: number;
  ease: number;
  iceScore: number;
  processingStatus: string;
  activityState: string;
  kanbanColumn: string;
  scheduledDate: string | null;
  userAnnotation: string | null;
  hashtags: string[];
  createdAt: string | null;
  updatedAt: string | null;
  generatedAt: string | null;
};

export type WebappProjection = {
  version: number;
  generatedAt: string;
  counts: ProjectionCounts;
  homeCharts: {
    data: Array<{ date: string; value: number }>;
    topics: Array<{ date: string; value: number }>;
    goals: Array<{ date: string; value: number }>;
    review: Array<{ date: string; value: number }>;
    knowmore: Array<{ date: string; value: number }>;
    tactical: Array<{ date: string; value: number }>;
    checklist: Array<{ date: string; value: number }>;
  };
  planningSummary: {
    laneCounts: PlanningLaneCounts;
    tacticalCount: number;
    checklistCount: number;
  };
  navCounts: {
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
  topTasks: WebappProjectionTask[];
};

const EMPTY_COUNTS: ProjectionCounts = {
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

const EMPTY_LANE_COUNTS: PlanningLaneCounts = {
  IDEABANK: 0,
  ROADMAP: 0,
  BACKLOG: 0,
  TODO: 0,
  CHECKLIST: 0,
};

const EMPTY_HOME_CHARTS: WebappProjection["homeCharts"] = {
  data: [],
  topics: [],
  goals: [],
  review: [],
  knowmore: [],
  tactical: [],
  checklist: [],
};

export function getProjectionFreshness(generatedAt: string | null | undefined, now = new Date()): ProjectionFreshness {
  if (!generatedAt) {
    return {
      status: "MISSING",
      generatedAt: null,
      ageMinutes: null,
    };
  }

  const generatedMs = new Date(generatedAt).getTime();
  if (!Number.isFinite(generatedMs)) {
    return {
      status: "MISSING",
      generatedAt: null,
      ageMinutes: null,
    };
  }

  const ageMinutes = Math.max(0, Math.round((now.getTime() - generatedMs) / 60000));
  return {
    status: ageMinutes <= 60 ? "FRESH" : ageMinutes <= 120 ? "AGING" : "STALE",
    generatedAt,
    ageMinutes,
  };
}

export function normalizeWebappProjection(value: unknown): WebappProjection | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const countsValue = candidate.counts && typeof candidate.counts === "object"
    ? candidate.counts as Record<string, unknown>
    : {};
  const counts: ProjectionCounts = {
    sources: Number(countsValue.sources || 0),
    files: Number(countsValue.files || 0),
    topics: Number(countsValue.topics || 0),
    flashcards: Number(countsValue.flashcards || 0),
    goals: Number(countsValue.goals || 0),
    sales: Number(countsValue.sales || 0),
    tacticalCount: Number(countsValue.tacticalCount || 0),
    checklistCount: Number(countsValue.checklistCount || 0),
    reviewCount: Number(countsValue.reviewCount || 0),
    pipelineJobs: Number(countsValue.pipelineJobs || 0),
  };
  const planningSummaryValue = candidate.planningSummary && typeof candidate.planningSummary === "object"
    ? candidate.planningSummary as Record<string, unknown>
    : {};
  const laneCountsValue = planningSummaryValue.laneCounts && typeof planningSummaryValue.laneCounts === "object"
    ? planningSummaryValue.laneCounts as Record<string, unknown>
    : {};
  const homeChartsValue = candidate.homeCharts && typeof candidate.homeCharts === "object"
    ? candidate.homeCharts as Record<string, unknown>
    : {};
  const normalizeChart = (entry: unknown) =>
    Array.isArray(entry)
      ? entry
          .filter((point) => point && typeof point === "object")
          .map((point) => {
            const value = point as Record<string, unknown>;
            return {
              date: String(value.date || ""),
              value: Number(value.value || 0),
            };
          })
          .filter((point) => point.date)
      : [];
  const topTasks = Array.isArray(candidate.topTasks)
    ? candidate.topTasks
        .filter((task) => task && typeof task === "object")
        .map((task) => {
          const entry = task as Record<string, unknown>;
          return {
            id: String(entry.id || ""),
            publicId: typeof entry.publicId === "number" ? entry.publicId : null,
            title: String(entry.title || ""),
            description: String(entry.description || ""),
            impact: Number(entry.impact || 0),
            confidenceScore: Number(entry.confidenceScore || 0),
            ease: Number(entry.ease || 0),
            iceScore: Number(entry.iceScore || 0),
            processingStatus: String(entry.processingStatus || "DRAFT"),
            activityState: String(entry.activityState || "ACTIVE"),
            kanbanColumn: String(entry.kanbanColumn || "CHECKLIST"),
            scheduledDate: entry.scheduledDate ? String(entry.scheduledDate) : null,
            userAnnotation: entry.userAnnotation ? String(entry.userAnnotation) : null,
            hashtags: Array.isArray(entry.hashtags) ? entry.hashtags.map((tag) => String(tag)) : [],
            createdAt: entry.createdAt ? String(entry.createdAt) : null,
            updatedAt: entry.updatedAt ? String(entry.updatedAt) : null,
            generatedAt: entry.generatedAt ? String(entry.generatedAt) : null,
          };
        })
        .filter((task) => task.id && task.title)
    : [];
  const resolvedCounts = {
    ...EMPTY_COUNTS,
    ...counts,
    tacticalCount: Math.max(counts.tacticalCount, counts.checklistCount),
  };

  return {
    version: Number(candidate.version || 1),
    generatedAt: String(candidate.generatedAt || ""),
    counts: resolvedCounts,
    homeCharts: {
      ...EMPTY_HOME_CHARTS,
      data: normalizeChart(homeChartsValue.data),
      topics: normalizeChart(homeChartsValue.topics),
      goals: normalizeChart(homeChartsValue.goals),
      review: normalizeChart(homeChartsValue.review),
      knowmore: normalizeChart(homeChartsValue.knowmore),
      tactical: normalizeChart(homeChartsValue.tactical),
      checklist: normalizeChart(homeChartsValue.checklist),
    },
    planningSummary: {
      laneCounts: {
        IDEABANK: Number(laneCountsValue.IDEABANK || 0),
        ROADMAP: Number(laneCountsValue.ROADMAP || 0),
        BACKLOG: Number(laneCountsValue.BACKLOG || 0),
        TODO: Number(laneCountsValue.TODO || 0),
        CHECKLIST: Number(laneCountsValue.CHECKLIST || 0),
      },
      tacticalCount: Math.max(
        Number(planningSummaryValue.tacticalCount || resolvedCounts.tacticalCount),
        Number(planningSummaryValue.checklistCount || resolvedCounts.checklistCount),
      ),
      checklistCount: Number(planningSummaryValue.checklistCount || resolvedCounts.checklistCount),
    },
    navCounts: {
      data: resolvedCounts.sources,
      topics: resolvedCounts.topics,
      knowmore: resolvedCounts.flashcards,
      goals: resolvedCounts.goals,
      sales: resolvedCounts.sales,
      review: resolvedCounts.reviewCount,
      checklist: resolvedCounts.checklistCount,
      tactical: resolvedCounts.tacticalCount,
      pipeline: resolvedCounts.pipelineJobs,
    },
    topTasks,
  };
}
