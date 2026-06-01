import "server-only";

import { prisma } from "@/lib/db";
import { ensureDestinationInstance, getActiveDestinationInstance } from "@/lib/destination-workflows";
import { Prisma } from "@prisma/client";
import { resolveDestinationKeyForVisitorWithHint } from "@/lib/visitor-blueprints";

export type VisitorFlashcard = {
  flashcardId: string;
  visitorKey: string;
  front: string;
  back: string;
  appliesTo: string[];
  confidence: number;
  sourceDatacardIds: string[];
  feedbackDerived: boolean;
  disabled?: boolean;
  version?: string;
  createdAt?: string;
  updatedAt?: string;
};

type VisitorKnowledgeStore = {
  flashcards?: Record<string, VisitorFlashcard[]>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((entry) => asString(entry)).filter(Boolean);
}

function asBoolean(value: unknown) {
  return value === true;
}

function clamp01(value: number) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function normalizeVisitorKey(value: string) {
  return value.trim().toLowerCase();
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeFlashcard(visitorKey: string, input: Partial<VisitorFlashcard>): VisitorFlashcard {
  const flashcardId = asString(input.flashcardId);
  if (!flashcardId) throw new Error("flashcardId is required");
  const front = asString(input.front);
  const back = asString(input.back);
  if (!front || !back) throw new Error("front and back are required");
  return {
    flashcardId,
    visitorKey: normalizeVisitorKey(visitorKey),
    front,
    back,
    appliesTo: asStringArray(input.appliesTo),
    confidence: clamp01(Number(input.confidence)),
    sourceDatacardIds: asStringArray(input.sourceDatacardIds),
    feedbackDerived: asBoolean(input.feedbackDerived),
    disabled: asBoolean(input.disabled),
    version: asString(input.version) || undefined,
    createdAt: asString(input.createdAt) || nowIso(),
    updatedAt: nowIso(),
  };
}

function readKnowledgeStore(config: Prisma.JsonValue | null | undefined): VisitorKnowledgeStore {
  const record = asRecord(config);
  const visitor = asRecord(record?.visitor);
  if (!visitor) return {};
  return {
    flashcards: (asRecord(visitor.flashcards) ?? {}) as Record<string, VisitorFlashcard[]>,
  };
}

function writeKnowledgeStore(existingConfig: Prisma.JsonValue | null | undefined, store: VisitorKnowledgeStore): Prisma.InputJsonValue {
  const record = asRecord(existingConfig) ?? {};
  const visitor = asRecord(record.visitor) ?? {};
  visitor.flashcards = store.flashcards ?? {};
  record.visitor = visitor;
  return record as Prisma.InputJsonValue;
}

async function getDestinationInstanceForVisitor(companyId: string, visitorKey: string, destinationKeyHint?: unknown) {
  const destinationKey = resolveDestinationKeyForVisitorWithHint(visitorKey, destinationKeyHint);
  if (!destinationKey) throw new Error("Unsupported visitorKey");
  return ensureDestinationInstance(companyId, destinationKey);
}

export async function listVisitorFlashcards(companyId: string, visitorKey: string, destinationKeyHint?: unknown) {
  const destinationKey = resolveDestinationKeyForVisitorWithHint(visitorKey, destinationKeyHint);
  if (!destinationKey) return [] as VisitorFlashcard[];
  const instance = await getActiveDestinationInstance(companyId, destinationKey);
  if (!instance) return [] as VisitorFlashcard[];
  const store = readKnowledgeStore(instance.config as Prisma.JsonValue);
  return (store.flashcards?.[normalizeVisitorKey(visitorKey)] ?? []).map((card) => ({
    ...card,
    visitorKey: normalizeVisitorKey(visitorKey),
  }));
}

export async function upsertVisitorFlashcard(companyId: string, visitorKey: string, card: Partial<VisitorFlashcard>, destinationKeyHint?: unknown) {
  const instance = await getDestinationInstanceForVisitor(companyId, visitorKey, destinationKeyHint);
  const normalized = normalizeFlashcard(visitorKey, card);
  const store = readKnowledgeStore(instance.config as Prisma.JsonValue);
  const existing = store.flashcards?.[normalizeVisitorKey(visitorKey)] ?? [];
  const next = existing.filter((item) => item.flashcardId !== normalized.flashcardId);
  next.push(normalized);
  next.sort((left, right) => left.flashcardId.localeCompare(right.flashcardId));
  const nextStore: VisitorKnowledgeStore = {
    ...store,
    flashcards: {
      ...(store.flashcards ?? {}),
      [normalizeVisitorKey(visitorKey)]: next,
    },
  };
  await prisma.destinationInstance.update({
    where: { id: instance.id },
    data: {
      config: writeKnowledgeStore(instance.config as Prisma.JsonValue, nextStore),
    },
  });
  return normalized;
}

export async function getVisitorKnowledgeContext(
  companyId: string,
  visitorKey: string,
  appliesTo?: string,
  destinationKeyHint?: unknown,
) {
  const cards = await listVisitorFlashcards(companyId, visitorKey, destinationKeyHint);
  const active = cards.filter((card) => !card.disabled);
  const filtered = appliesTo
    ? active.filter((card) => card.appliesTo.length === 0 || card.appliesTo.includes(appliesTo))
    : active;
  return filtered
    .sort((left, right) => right.confidence - left.confidence || left.flashcardId.localeCompare(right.flashcardId))
    .slice(0, 100);
}
