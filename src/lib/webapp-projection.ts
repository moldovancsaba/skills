type ProjectionCounts = {
  sources: number;
  files: number;
  topics: number;
  flashcards: number;
  goals: number;
  tacticalCount: number;
  checklistCount: number;
  reviewCount: number;
  pipelineJobs: number;
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
  navCounts: {
    data: number;
    topics: number;
    knowmore: number;
    goals: number;
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
  tacticalCount: 0,
  checklistCount: 0,
  reviewCount: 0,
  pipelineJobs: 0,
};

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
    tacticalCount: Number(countsValue.tacticalCount || 0),
    checklistCount: Number(countsValue.checklistCount || 0),
    reviewCount: Number(countsValue.reviewCount || 0),
    pipelineJobs: Number(countsValue.pipelineJobs || 0),
  };
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
    navCounts: {
      data: resolvedCounts.sources,
      topics: resolvedCounts.topics,
      knowmore: resolvedCounts.flashcards,
      goals: resolvedCounts.goals,
      review: resolvedCounts.reviewCount,
      checklist: resolvedCounts.checklistCount,
      tactical: resolvedCounts.tacticalCount,
      pipeline: resolvedCounts.pipelineJobs,
    },
    topTasks,
  };
}
