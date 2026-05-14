import { prisma } from "@/lib/db";

export type SharedCardEntityType = "DATA" | "TOPIC" | "KNOWLEDGE" | "GOAL" | "TASK";
export type SharedCardTone = "ingress" | "synthesis" | "knowmore" | "strategy" | "checklist";

export type SharedCardPayload = {
  id: string;
  companyId: string;
  entityType: SharedCardEntityType;
  title: string;
  body: string;
  statusLabel: string;
  subtypeLabel?: string | null;
  tone: SharedCardTone;
  iceScore: number;
  hashtags: string[];
  createdAt: Date | string | null;
  updatedAt: Date | string | null;
  publicId: number | null;
};

function fileSizeLabel(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "Unknown size";
  }
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function stripUtf8Bom(value: string) {
  return value.replace(/^\uFEFF/, "");
}

function looksBinary(bytes: Uint8Array) {
  const sample = bytes.subarray(0, Math.min(bytes.length, 512));
  for (const byte of sample) {
    if (byte === 0) {
      return true;
    }
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

function decodeUploadedFileBody(card: {
  name: string;
  mimeType: string;
  sizeBytes: number;
  content: Uint8Array | Buffer | null;
}) {
  if (!card.content || card.content.length === 0) {
    return `${card.mimeType || "file"} • ${fileSizeLabel(card.sizeBytes)}`;
  }

  if (!isMarkdownLikeFile(card.name, card.mimeType) && !isPlainTextLikeFile(card.name, card.mimeType)) {
    return `${card.mimeType || "file"} • ${fileSizeLabel(card.sizeBytes)}`;
  }

  const bytes = card.content instanceof Uint8Array ? card.content : new Uint8Array(card.content);
  if (looksBinary(bytes)) {
    return `${card.mimeType || "file"} • ${fileSizeLabel(card.sizeBytes)}`;
  }

  const decoded = stripUtf8Bom(Buffer.from(bytes).toString("utf8")).trim();
  return decoded || `${card.mimeType || "file"} • ${fileSizeLabel(card.sizeBytes)}`;
}

function normalizeSourcePayload(card: {
  id: string;
  companyId: string;
  publicId: number | null;
  content: string;
  hashtags: string[];
  createdAt: Date;
  updatedAt: Date;
  intelligenceType?: "INTERNAL" | "COMPETITOR";
  iceScore?: number;
}): SharedCardPayload {
  const [firstLine, ...rest] = String(card.content || "").split("\n");
  const body = rest.join("\n").trim() || firstLine.trim();

  return {
    id: card.id,
    companyId: card.companyId,
    entityType: "DATA",
    title: firstLine.trim() || "Datacard",
    body,
    statusLabel: "DATACARD",
    subtypeLabel: card.intelligenceType === "COMPETITOR" ? "MARKET" : "INTERNAL",
    tone: "ingress",
    iceScore: card.iceScore ?? 0,
    hashtags: Array.isArray(card.hashtags) ? card.hashtags : [],
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
    publicId: card.publicId ?? null,
  };
}

function normalizeFilePayload(card: {
  id: string;
  companyId: string;
  publicId: number | null;
  name: string;
  mimeType: string;
  sizeBytes: number;
  content: Uint8Array | Buffer | null;
  iceScore?: number;
  hashtags: string[];
  createdAt: Date;
  updatedAt: Date;
}): SharedCardPayload {
  return {
    id: card.id,
    companyId: card.companyId,
    entityType: "DATA",
    title: card.name || "Uploaded file",
    body: decodeUploadedFileBody(card),
    statusLabel: "DATACARD",
    subtypeLabel: "FILE",
    tone: "ingress",
    iceScore: card.iceScore ?? 0,
    hashtags: Array.isArray(card.hashtags) ? card.hashtags : [],
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
    publicId: card.publicId ?? null,
  };
}

function normalizeTopicPayload(card: {
  id: string;
  companyId: string;
  label: string;
  notes: string | null;
  active: boolean;
  hashtags: string[];
  iceScore?: number;
  createdAt: Date;
  updatedAt: Date;
}): SharedCardPayload {
  return {
    id: card.id,
    companyId: card.companyId,
    entityType: "TOPIC",
    title: card.label,
    body: card.notes?.trim() || "Strategic focus topic for recurring AI research and synthesis.",
    statusLabel: "TOPIC",
    subtypeLabel: card.active ? "ACTIVE" : "PAUSED",
    tone: "synthesis",
    iceScore: card.iceScore ?? 0,
    hashtags: Array.isArray(card.hashtags) ? card.hashtags : [],
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
    publicId: null,
  };
}

function normalizeTaskPayload(card: {
  id: string;
  companyId: string;
  publicId: number | null;
  title: string;
  description: string | null;
  processingStatus: string;
  iceScore: number;
  hashtags: string[];
  createdAt: Date;
  updatedAt: Date;
}): SharedCardPayload {
  return {
    id: card.id,
    companyId: card.companyId,
    entityType: "TASK",
    title: card.title,
    body: card.description ?? "",
    statusLabel: "TASK",
    subtypeLabel: card.processingStatus,
    tone: "checklist",
    iceScore: card.iceScore ?? 0,
    hashtags: Array.isArray(card.hashtags) ? card.hashtags : [],
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
    publicId: card.publicId ?? null,
  };
}

function normalizeGoalPayload(card: {
  id: string;
  companyId: string;
  publicId: number | null;
  title: string;
  body: string;
  processingStatus: string;
  iceScore: number;
  hashtags: string[];
  createdAt: Date;
  updatedAt: Date;
}): SharedCardPayload {
  return {
    id: card.id,
    companyId: card.companyId,
    entityType: "GOAL",
    title: card.title,
    body: card.body,
    statusLabel: "GOAL",
    subtypeLabel: card.processingStatus,
    tone: "strategy",
    iceScore: card.iceScore ?? 0,
    hashtags: Array.isArray(card.hashtags) ? card.hashtags : [],
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
    publicId: card.publicId ?? null,
  };
}

function normalizeKnowledgePayload(card: {
  id: string;
  companyId: string;
  publicId: number | null;
  title: string;
  body: string;
  processingStatus: string;
  iceScore: number;
  hashtags: string[];
  createdAt: Date;
  updatedAt: Date;
}): SharedCardPayload {
  return {
    id: card.id,
    companyId: card.companyId,
    entityType: "KNOWLEDGE",
    title: card.title,
    body: card.body,
    statusLabel: "KNOWLEDGE",
    subtypeLabel: card.processingStatus,
    tone: "knowmore",
    iceScore: card.iceScore ?? 0,
    hashtags: Array.isArray(card.hashtags) ? card.hashtags : [],
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
    publicId: card.publicId ?? null,
  };
}

export async function resolveSharedCardById(cardId: string): Promise<SharedCardPayload | null> {
  const [task, goal, knowledge, source, file, topic] = await Promise.all([
    prisma.checklistTask.findUnique({
      where: { id: cardId },
      select: {
        id: true,
        companyId: true,
        publicId: true,
        title: true,
        description: true,
        processingStatus: true,
        iceScore: true,
        hashtags: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.goalcard.findUnique({
      where: { id: cardId },
      select: {
        id: true,
        companyId: true,
        publicId: true,
        title: true,
        body: true,
        processingStatus: true,
        iceScore: true,
        hashtags: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.flashcard.findUnique({
      where: { id: cardId },
      select: {
        id: true,
        companyId: true,
        publicId: true,
        title: true,
        body: true,
        processingStatus: true,
        iceScore: true,
        hashtags: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.source.findUnique({
      where: { id: cardId },
      select: {
        id: true,
        companyId: true,
        publicId: true,
        content: true,
        hashtags: true,
        createdAt: true,
        updatedAt: true,
        intelligenceType: true,
        iceScore: true,
      },
    }),
    prisma.uploadedSourceFile.findUnique({
      where: { id: cardId },
      select: {
        id: true,
        companyId: true,
        publicId: true,
        name: true,
        mimeType: true,
        sizeBytes: true,
        content: true,
        hashtags: true,
        createdAt: true,
        updatedAt: true,
        iceScore: true,
      },
    }),
    prisma.topic.findUnique({
      where: { id: cardId },
      select: {
        id: true,
        companyId: true,
        label: true,
        notes: true,
        active: true,
        hashtags: true,
        createdAt: true,
        updatedAt: true,
        iceScore: true,
      },
    }),
  ]);

  if (task) return normalizeTaskPayload(task);
  if (goal) return normalizeGoalPayload(goal);
  if (knowledge) return normalizeKnowledgePayload(knowledge);
  if (source) return normalizeSourcePayload(source);
  if (file) return normalizeFilePayload(file);
  if (topic) return normalizeTopicPayload(topic);
  return null;
}
