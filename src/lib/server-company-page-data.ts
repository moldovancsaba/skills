import "server-only";

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { APP_SESSION_COOKIE, readAppSessionToken } from "@/lib/auth";
import { type UnitWebappProfile, resolveUnitCapabilities } from "@/lib/intelligence-unit-capabilities";
import { type ProjectionFreshness } from "@/lib/webapp-projection";
import { buildCompanyReadModel, type CompanyDashboardCounts } from "@/lib/company-read-model";
import { resolveEffectiveUnitCapabilities } from "@/lib/check-foundation";

type DataType = "source" | "file";

export type DashboardInitialData = {
  company: any;
  counts: CompanyDashboardCounts;
  topTasks: any[];
  analytics: any[];
  scoreHealth: any;
  isOwner: boolean;
  projectionFreshness: ProjectionFreshness;
  webappProfile: UnitWebappProfile;
  unitModules: Record<string, boolean>;
  enabledBlocks: string[];
  enabledModules: string[];
  enabledMiniapps: string[];
  capabilitySource: string;
  capabilityWarnings: string[];
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
    departmentKey?: string | null;
    createdAt: string;
    updatedAt: string;
    iceScore?: number;
  }>;
  sourceItems: any[];
  sourceTotal: number;
  sourceHasMore: boolean;
  fileItems: any[];
  fileTotal: number;
  fileHasMore: boolean;
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

  const [company, snapshot, classScoutInstance, compareInstance] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId } }),
    prisma.intelligenceSnapshot.findUnique({ where: { companyId } }),
    prisma.destinationInstance.findFirst({
      where: {
        companyId,
        destinationKey: "classscout",
        isActive: true,
      },
      select: { id: true },
    }),
    prisma.destinationInstance.findFirst({
      where: {
        companyId,
        destinationKey: "compare",
        isActive: true,
      },
      select: { id: true },
    }),
  ]);

  if (!company) return null;

  const readModel = buildCompanyReadModel(snapshot);
  const capabilities = resolveUnitCapabilities({
    workerConfig: company?.workerConfig,
    hasClassScoutDestination: Boolean(classScoutInstance),
    hasCompareDestination: Boolean(compareInstance),
  });
  const effectiveCapabilities = resolveEffectiveUnitCapabilities({
    workerConfig: company?.workerConfig,
    hasClassScoutDestination: Boolean(classScoutInstance),
    hasCompareDestination: Boolean(compareInstance),
  });

  return {
    company,
    counts: readModel.counts,
    topTasks: readModel.topTasks,
    analytics: Array.isArray(snapshot?.analyticsHistory) ? snapshot.analyticsHistory : [],
    scoreHealth: snapshot?.scoreHealth && typeof snapshot.scoreHealth === "object" ? snapshot.scoreHealth : null,
    isOwner: ["OWNER", "SUPERADMIN"].includes(auth.membership.role),
    projectionFreshness: readModel.projectionFreshness,
    webappProfile: capabilities.profile,
    unitModules: capabilities.modules,
    enabledBlocks: effectiveCapabilities.enabledBlocks,
    enabledModules: effectiveCapabilities.enabledModules,
    enabledMiniapps: effectiveCapabilities.enabledMiniapps,
    capabilitySource: effectiveCapabilities.source,
    capabilityWarnings: effectiveCapabilities.warnings,
  };
}

export async function getDataPageInitialData(companyId: string, pageSize = 12): Promise<DataPageInitialData | null> {
  const auth = await getSessionAndMembership(companyId);
  if (!auth) return null;

  const [company, members, snapshot, sourceItems, sourceTotal, files, fileTotal] = await Promise.all([
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
        departmentKey: true,
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
      take: pageSize,
    }),
    prisma.uploadedSourceFile.count({ where: { companyId } }),
  ]);

  if (!company) return null;
  const readModel = buildCompanyReadModel(snapshot);

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
    fileItems: files.map((file) => ({
      ...file,
      body: decodeUploadedFileBody(file),
      createdAt: file.createdAt.toISOString(),
      updatedAt: file.updatedAt.toISOString(),
    })),
    fileTotal,
    fileHasMore: files.length < fileTotal,
    fileCount: readModel.counts.files || fileTotal,
    pendingTaskCount: readModel.counts.checklistCount,
    isOwner: ["OWNER", "SUPERADMIN"].includes(auth.membership.role),
    members,
  };
}
