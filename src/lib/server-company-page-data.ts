import "server-only";

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { APP_SESSION_COOKIE, readAppSessionToken } from "@/lib/auth";
import { getProjectionFreshness, normalizeWebappProjection, type ProjectionFreshness, type WebappProjectionTask } from "@/lib/webapp-projection";

type DataType = "source" | "file";

type DashboardCounts = {
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

function buildCountsFromProjection(projection: ReturnType<typeof normalizeWebappProjection>): DashboardCounts {
  const counts = projection?.counts;
  return {
    sources: counts?.sources ?? 0,
    files: counts?.files ?? 0,
    topics: counts?.topics ?? 0,
    flashcards: counts?.flashcards ?? 0,
    goals: counts?.goals ?? 0,
    tacticalCount: counts?.tacticalCount ?? 0,
    checklistCount: counts?.checklistCount ?? 0,
    reviewCount: counts?.reviewCount ?? 0,
    pipelineJobs: counts?.pipelineJobs ?? 0,
  };
}

export type DashboardInitialData = {
  company: any;
  members: any[];
  counts: DashboardCounts;
  topTasks: any[];
  analytics: any[];
  scoreHealth: any;
  isOwner: boolean;
  projectionFreshness: ProjectionFreshness;
};

export type DataPageInitialData = {
  company: any;
  items: Array<{
    id: string;
    publicId: number | null;
    name: string;
    body?: string;
    type: DataType;
    hashtags: string[];
    aiClusters?: string[];
    entityTag?: string | null;
    intelligenceType?: "INTERNAL" | "COMPETITOR";
    createdAt: string;
    updatedAt: string;
    iceScore?: number;
  }>;
  sourceItems: any[];
  sourceTotal: number;
  sourceHasMore: boolean;
  fileCount: number;
  pendingTaskCount: number;
  isOwner: boolean;
  members: any[];
};

async function getSessionAndMembership(companyId: string) {
  const cookieStore = await cookies();
  const session = readAppSessionToken(cookieStore.get(APP_SESSION_COOKIE)?.value);
  if (!session) return null;

  const membership = await prisma.user.findFirst({
    where: {
      email: session.email.trim().toLowerCase(),
      companyId,
    },
  });

  if (!membership) return null;
  return { session, membership };
}

function fileSizeLabel(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return "Unknown size";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function stripUtf8Bom(value: string) {
  return value.replace(/^\uFEFF/, "");
}

function looksBinary(bytes: Uint8Array) {
  const sample = bytes.subarray(0, Math.min(bytes.length, 512));
  for (const byte of sample) {
    if (byte === 0) return true;
  }
  return false;
}

function isMarkdownLikeFile(name: string, mimeType: string) {
  const normalizedName = String(name || "").toLowerCase();
  const normalizedMime = String(mimeType || "").toLowerCase();
  return (
    normalizedMime === "text/markdown" ||
    normalizedMime === "text/x-markdown" ||
    normalizedName.endsWith(".md") ||
    normalizedName.endsWith(".markdown")
  );
}

function isPlainTextLikeFile(name: string, mimeType: string) {
  const normalizedName = String(name || "").toLowerCase();
  const normalizedMime = String(mimeType || "").toLowerCase();
  return (
    normalizedMime.startsWith("text/") ||
    normalizedName.endsWith(".txt") ||
    normalizedName.endsWith(".log") ||
    normalizedName.endsWith(".csv") ||
    normalizedName.endsWith(".tsv") ||
    normalizedName.endsWith(".json") ||
    normalizedName.endsWith(".yaml") ||
    normalizedName.endsWith(".yml") ||
    normalizedName.endsWith(".xml")
  );
}

function decodeUploadedFileBody(file: {
  name: string;
  mimeType: string;
  sizeBytes: number;
  content: Uint8Array | Buffer | null;
}) {
  if (!file.content || file.content.length === 0) {
    return `${file.mimeType || "file"} • ${fileSizeLabel(file.sizeBytes)}`;
  }

  if (!isMarkdownLikeFile(file.name, file.mimeType) && !isPlainTextLikeFile(file.name, file.mimeType)) {
    return `${file.mimeType || "file"} • ${fileSizeLabel(file.sizeBytes)}`;
  }

  const bytes = file.content instanceof Uint8Array ? file.content : new Uint8Array(file.content);
  if (looksBinary(bytes)) {
    return `${file.mimeType || "file"} • ${fileSizeLabel(file.sizeBytes)}`;
  }

  const decoded = stripUtf8Bom(Buffer.from(bytes).toString("utf8")).trim();
  return decoded || `${file.mimeType || "file"} • ${fileSizeLabel(file.sizeBytes)}`;
}

export async function getDashboardInitialData(companyId: string): Promise<DashboardInitialData | null> {
  const auth = await getSessionAndMembership(companyId);
  if (!auth) return null;

  const [company, members, snapshot] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId } }),
    prisma.user.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } }),
    prisma.intelligenceSnapshot.findUnique({ where: { companyId } }),
  ]);

  if (!company) return null;

  const projection = normalizeWebappProjection(snapshot?.webappProjection);
  let topTasks: WebappProjectionTask[] = projection?.topTasks ?? [];
  let counts = buildCountsFromProjection(projection);
  if (!projection) {
    const now = new Date();
    const [
      liveSourceCount,
      liveFileCount,
      liveTopicCount,
      liveFlashcardCount,
      liveGoalCount,
      liveTacticalCount,
      liveChecklistCount,
      liveReviewCount,
      liveTopTasks,
    ] = await Promise.all([
      prisma.source.count({ where: { companyId } }),
      prisma.uploadedSourceFile.count({ where: { companyId } }),
      prisma.topic.count({ where: { companyId } }),
      prisma.flashcard.count({
        where: { companyId, activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] } },
      }),
      prisma.goalcard.count({
        where: { companyId, activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] } },
      }),
      prisma.checklistTask.count({
        where: { companyId, activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] } },
      }),
      prisma.checklistTask.count({
        where: {
          companyId,
          kanbanColumn: "CHECKLIST",
          activityState: { in: ["ACTIVE", "STALE"] },
          processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED"] },
          OR: [{ scheduledDate: null }, { scheduledDate: { lte: now } }],
        },
      }),
      prisma.checklistTask.count({
        where: {
          companyId,
          processingStatus: "REVIEW",
          activityState: { in: ["ACTIVE", "STALE"] },
        },
      }),
      prisma.checklistTask.findMany({
        where: {
          companyId,
          kanbanColumn: "CHECKLIST",
          activityState: { in: ["ACTIVE", "STALE"] },
          processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED"] },
          OR: [{ scheduledDate: null }, { scheduledDate: { lte: now } }],
        },
        orderBy: { iceScore: "desc" },
        take: 3,
      }),
    ]);
    const checklistCount = Math.max(liveChecklistCount, liveTopTasks.length);
    counts = {
      sources: liveSourceCount + liveFileCount,
      files: liveFileCount,
      topics: liveTopicCount,
      flashcards: liveFlashcardCount,
      goals: liveGoalCount,
      tacticalCount: Math.max(liveTacticalCount, checklistCount),
      checklistCount,
      reviewCount: liveReviewCount,
      pipelineJobs: 0,
    };
    topTasks = liveTopTasks.map((task) => ({
      id: task.id,
      publicId: task.publicId,
      title: task.title,
      description: task.description,
      impact: task.impact,
      confidenceScore: task.confidenceScore,
      ease: task.ease,
      iceScore: task.iceScore,
      processingStatus: task.processingStatus,
      activityState: task.activityState,
      kanbanColumn: task.kanbanColumn,
      scheduledDate: task.scheduledDate ? task.scheduledDate.toISOString() : null,
      userAnnotation: task.userAnnotation ?? null,
      hashtags: task.hashtags ?? [],
      createdAt: task.createdAt ? task.createdAt.toISOString() : null,
      updatedAt: task.updatedAt ? task.updatedAt.toISOString() : null,
      generatedAt: task.generatedAt ? task.generatedAt.toISOString() : null,
    }));
  }

  const observabilitySummary =
    snapshot?.observabilitySummary && typeof snapshot.observabilitySummary === "object"
      ? snapshot.observabilitySummary as Record<string, unknown>
      : {};
  const queue = observabilitySummary.queue && typeof observabilitySummary.queue === "object"
    ? observabilitySummary.queue as Record<string, unknown>
    : {};

  return {
    company,
    members,
    counts: {
      ...counts,
      pipelineJobs: Number(queue.totalActiveJobs ?? counts.pipelineJobs ?? 0),
      tacticalCount: Math.max(counts.tacticalCount, counts.checklistCount),
    },
    topTasks,
    analytics: Array.isArray(snapshot?.analyticsHistory) ? snapshot.analyticsHistory : [],
    scoreHealth: snapshot?.scoreHealth && typeof snapshot.scoreHealth === "object" ? snapshot.scoreHealth : null,
    isOwner: ["OWNER", "SUPERADMIN"].includes(auth.membership.role),
    projectionFreshness: getProjectionFreshness(projection?.generatedAt ?? null),
  };
}

export async function getDataPageInitialData(companyId: string, pageSize = 12): Promise<DataPageInitialData | null> {
  const auth = await getSessionAndMembership(companyId);
  if (!auth) return null;

  const [company, members, snapshot, sourceItems, sourceTotal, files] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId } }),
    prisma.user.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } }),
    prisma.intelligenceSnapshot.findUnique({ where: { companyId } }),
    prisma.source.findMany({
      where: { companyId },
      orderBy: [{ publicId: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        publicId: true,
        content: true,
        hashtags: true,
        aiClusters: true,
        entityTag: true,
        createdAt: true,
        updatedAt: true,
        processingStatus: true,
        intelligenceType: true,
      },
      take: pageSize,
    }),
    prisma.source.count({ where: { companyId } }),
    prisma.uploadedSourceFile.findMany({
      where: { companyId },
      orderBy: [{ publicId: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        publicId: true,
        companyId: true,
        name: true,
        confidence: true,
        confidenceScore: true,
        impact: true,
        weight: true,
        iceScore: true,
        hashtags: true,
        entityTag: true,
        mimeType: true,
        sizeBytes: true,
        content: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  if (!company) return null;
  const projection = normalizeWebappProjection(snapshot?.webappProjection);

  const items = [
    ...sourceItems.map((item) => ({
      ...item,
      name: item.content,
      type: "source" as const,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    ...files.map((file) => ({
      ...file,
      body: decodeUploadedFileBody(file),
      type: "file" as const,
      createdAt: file.createdAt.toISOString(),
      updatedAt: file.updatedAt.toISOString(),
    })),
  ];

  return {
    company,
    items,
    sourceItems: sourceItems.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    sourceTotal,
    sourceHasMore: sourceItems.length < sourceTotal,
    fileCount: projection?.counts.files ?? files.length,
    pendingTaskCount: projection?.counts.checklistCount ?? 0,
    isOwner: ["OWNER", "SUPERADMIN"].includes(auth.membership.role),
    members,
  };
}
