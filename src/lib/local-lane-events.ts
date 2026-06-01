import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

export type LocalLane = "SYSTEM_HEALTH" | "PLAYLIST" | "HUMAN_APPROVED_BURST";
export type LocalLaneEventType =
  | "APPROVED"
  | "CHILDREN_CREATED"
  | "STARTED"
  | "PROGRESS"
  | "RETRY"
  | "TIMEOUT"
  | "STOP_REQUESTED"
  | "ROLLBACK"
  | "COMPLETED"
  | "FAILED";

export type LocalLaneEvent = {
  id: string;
  lane: LocalLane;
  eventType: LocalLaneEventType;
  actor: "system" | "local-worker" | "operator" | "burst-controller";
  summary: string;
  createdAt: string;
  companyId?: string | null;
  jobId?: string | null;
  burstId?: string | null;
  childJobId?: string | null;
  destinationKey?: string | null;
  metadata?: Record<string, unknown>;
};

export const LOCAL_LANE_EVENTS_SETTING_KEY = "local_ai_lane_events";
const MAX_EVENTS = 250;

let localLaneAuditPrisma: PrismaClient | null | undefined;

function sanitizeText(value: unknown) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/(secret|token|password|api[_-]?key)=([^&\s]+)/gi, "$1=[REDACTED]")
    .slice(0, 500);
}

function sanitizeMetadataValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[MAX_DEPTH]";
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") return sanitizeText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeMetadataValue(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 50)
        .map(([key, item]) => [sanitizeText(key).slice(0, 80), sanitizeMetadataValue(item, depth + 1)]),
    );
  }
  return sanitizeText(value);
}

function sanitizeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return sanitizeMetadataValue(value) as Record<string, unknown>;
}

function asJsonSafe(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

function getLaneAuditPrisma() {
  const datasourceUrl = process.env.LOCAL_DATABASE_URL?.trim();
  if (!datasourceUrl) return null;
  if (localLaneAuditPrisma === undefined) {
    localLaneAuditPrisma = new PrismaClient({ datasourceUrl });
  }
  return localLaneAuditPrisma;
}

function normalizeExistingEvents(value: unknown): LocalLaneEvent[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const events = (value as { events?: unknown }).events;
  return Array.isArray(events) ? events.filter((event): event is LocalLaneEvent => Boolean(event && typeof event === "object")) : [];
}

export async function recordLocalLaneEvent(prisma: any, input: Omit<LocalLaneEvent, "id" | "createdAt"> & { id?: string; createdAt?: string }) {
  const event: LocalLaneEvent = {
    id: input.id ?? crypto.randomUUID(),
    lane: input.lane,
    eventType: input.eventType,
    actor: input.actor,
    summary: sanitizeText(input.summary),
    createdAt: input.createdAt ?? new Date().toISOString(),
    companyId: input.companyId ?? null,
    jobId: input.jobId ?? null,
    burstId: input.burstId ?? null,
    childJobId: input.childJobId ?? null,
    destinationKey: input.destinationKey ?? null,
    metadata: sanitizeMetadata(input.metadata),
  };

  const current = await prisma.systemSetting.findUnique({ where: { key: LOCAL_LANE_EVENTS_SETTING_KEY } });
  const events = [event, ...normalizeExistingEvents(current?.value)].slice(0, MAX_EVENTS);
  await prisma.systemSetting.upsert({
    where: { key: LOCAL_LANE_EVENTS_SETTING_KEY },
    create: { key: LOCAL_LANE_EVENTS_SETTING_KEY, value: { events } },
    update: { value: { events }, updatedAt: new Date() },
  });
  await recordLocalLaneAuditEvent(event);
  return event;
}

async function recordLocalLaneAuditEvent(event: LocalLaneEvent) {
  try {
    const localAuditPrisma = getLaneAuditPrisma();
    if (!localAuditPrisma) return;
    await localAuditPrisma.outcomeEvent.create({
      data: {
        companyId: event.companyId || "__local_ai__",
        actorType: event.actor.toUpperCase(),
        entityType: "LOCAL_EXECUTION_LANE",
        entityId: event.jobId || event.burstId || event.id,
        outcomeType: `LANE_${event.eventType}`,
        outcomeValue: event.lane,
        annotation: event.summary,
        payload: asJsonSafe({
          laneEvent: event,
        }),
        teachingWeight: 30,
      },
    });
  } catch (error) {
    console.warn(`[LOCAL LANE EVENT] Failed to mirror audit event ${event.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function safeRecordLocalLaneEvent(prisma: any, input: Omit<LocalLaneEvent, "id" | "createdAt"> & { id?: string; createdAt?: string }) {
  try {
    return await recordLocalLaneEvent(prisma, input);
  } catch (error) {
    console.warn(`[LOCAL LANE EVENT] Failed to record ${input.lane}/${input.eventType}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export async function listLocalLaneEvents(prisma: any, input: { lane?: LocalLane | null; limit?: number } = {}) {
  const current = await prisma.systemSetting.findUnique({ where: { key: LOCAL_LANE_EVENTS_SETTING_KEY } });
  const limit = Math.max(1, Math.min(Number(input.limit || 50), 250));
  return normalizeExistingEvents(current?.value)
    .filter((event) => (input.lane ? event.lane === input.lane : true))
    .slice(0, limit);
}
