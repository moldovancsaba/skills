"use strict";

const crypto = require("crypto");
const { getLocalAuditPrisma } = require("../local-audit-db");

const LOCAL_LANE_EVENTS_SETTING_KEY = "local_ai_lane_events";
const MAX_EVENTS = 250;

function sanitizeText(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/(secret|token|password|api[_-]?key)=([^&\s]+)/gi, "$1=[REDACTED]")
    .slice(0, 500);
}

function normalizeExistingEvents(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const events = value.events;
  return Array.isArray(events) ? events.filter((event) => event && typeof event === "object") : [];
}

function sanitizeMetadataValue(value, depth = 0) {
  if (depth > 4) return "[MAX_DEPTH]";
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") return sanitizeText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeMetadataValue(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 50)
        .map(([key, item]) => [sanitizeText(key).slice(0, 80), sanitizeMetadataValue(item, depth + 1)]),
    );
  }
  return sanitizeText(value);
}

function sanitizeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return sanitizeMetadataValue(value);
}

async function recordLocalLaneEvent(prisma, input) {
  if (!prisma?.systemSetting) return null;
  const event = {
    id: input.id || crypto.randomUUID(),
    lane: input.lane,
    eventType: input.eventType,
    actor: input.actor,
    summary: sanitizeText(input.summary),
    createdAt: input.createdAt || new Date().toISOString(),
    companyId: input.companyId || null,
    jobId: input.jobId || null,
    burstId: input.burstId || null,
    childJobId: input.childJobId || null,
    destinationKey: input.destinationKey || null,
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

async function recordLocalLaneAuditEvent(event) {
  try {
    const localAuditPrisma = getLocalAuditPrisma();
    if (!localAuditPrisma) return;
    await localAuditPrisma.outcomeEvent.create({
      data: {
        companyId: event.companyId || "__local_ai__",
        actorType: String(event.actor || "system").toUpperCase(),
        entityType: "LOCAL_EXECUTION_LANE",
        entityId: event.jobId || event.burstId || event.id,
        outcomeType: `LANE_${event.eventType}`,
        outcomeValue: event.lane,
        annotation: event.summary,
        payload: {
          laneEvent: event,
        },
        teachingWeight: 30,
      },
    });
  } catch (error) {
    console.warn(`[LOCAL LANE EVENT] Failed to mirror audit event ${event.id}: ${error?.message || error}`);
  }
}

async function safeRecordLocalLaneEvent(prisma, input) {
  try {
    return await recordLocalLaneEvent(prisma, input);
  } catch (error) {
    console.warn(`[LOCAL LANE EVENT] Failed to record ${input.lane}/${input.eventType}: ${error?.message || error}`);
    return null;
  }
}

module.exports = {
  LOCAL_LANE_EVENTS_SETTING_KEY,
  recordLocalLaneEvent,
  safeRecordLocalLaneEvent,
};
