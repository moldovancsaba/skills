import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { listLocalLaneEvents } from "@/lib/local-lane-events";
import { verifySuperAdmin } from "@/lib/permissions";
import type { SurfaceReadModel } from "@/lib/surface-projections";

export const dynamic = "force-dynamic";

type LocalAiCommandCenterItem = {
  id: string;
  kind: "incident" | "service" | "laneEvent";
  severity: "info" | "warning" | "critical";
  label: string;
  summary: string;
  createdAt: string | null;
  meta?: Record<string, unknown>;
};

function isLocalOperatorRequest(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const forwardedHost = request.headers.get("x-forwarded-host") || "";
  const candidate = `${host} ${forwardedHost}`.toLowerCase();
  return candidate.includes("localhost")
    || candidate.includes("127.0.0.1")
    || candidate.includes("[::1]");
}

async function fetchJson(url: string, timeoutMs = 1000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function severityFromState(state: unknown): "info" | "warning" | "critical" {
  const normalized = String(state || "").toLowerCase();
  if (normalized.includes("critical") || normalized.includes("offline") || normalized.includes("failed")) return "critical";
  if (normalized.includes("warning") || normalized.includes("recover") || normalized.includes("degraded") || normalized.includes("stale")) return "warning";
  return "info";
}

function buildServiceItems(statusPayload: any): LocalAiCommandCenterItem[] {
  const services = Array.isArray(statusPayload?.managedServices?.services) ? statusPayload.managedServices.services : [];
  return services.map((service: any, index: number) => ({
    id: `service:${service.id || service.serviceId || service.name || index}`,
    kind: "service",
    severity: severityFromState(service.state),
    label: String(service.id || service.serviceId || service.name || "Managed service"),
    summary: service.lastError
      ? String(service.lastError)
      : service.state === "healthy"
        ? "Service is healthy."
        : `Service state is ${service.state || "unknown"}.`,
    createdAt: statusPayload?.managedServices?.generatedAt || statusPayload?.ts || null,
    meta: {
      pid: service.pid ?? null,
      state: service.state ?? null,
      statusCode: service.statusCode ?? null,
    },
  }));
}

function buildIncidentItems(statusPayload: any): LocalAiCommandCenterItem[] {
  const incidents = Array.isArray(statusPayload?.runtimeHealth?.incidents) ? statusPayload.runtimeHealth.incidents : [];
  return incidents.slice(0, 12).map((incident: any, index: number) => ({
    id: `incident:${incident.id || index}`,
    kind: "incident",
    severity: severityFromState(incident.severity || incident.state),
    label: String(incident.title || incident.kind || "Runtime incident"),
    summary: String(incident.summary || incident.detail || "Runtime incident requires operator attention."),
    createdAt: statusPayload?.ts || null,
    meta: {
      source: incident.source || null,
      action: incident.action || null,
    },
  }));
}

function buildLaneEventItems(events: any[]): LocalAiCommandCenterItem[] {
  return events.slice(0, 40).map((event) => ({
    id: `lane:${event.id}`,
    kind: "laneEvent",
    severity: event.eventType === "FAILED" || event.eventType === "TIMEOUT" ? "critical" : event.eventType === "RETRY" ? "warning" : "info",
    label: `${event.lane || "LOCAL"} / ${event.eventType || "EVENT"}`,
    summary: String(event.summary || "Local lane event"),
    createdAt: typeof event.createdAt === "string" ? event.createdAt : null,
    meta: {
      lane: event.lane || null,
      eventType: event.eventType || null,
      jobId: event.jobId || null,
      companyId: event.companyId || null,
    },
  }));
}

export async function GET(request: NextRequest) {
  if (!isLocalOperatorRequest(request)) {
    const auth = await verifySuperAdmin(request);
    if (auth.error) return auth.error;
  }

  const limit = Math.max(1, Math.min(Number(request.nextUrl.searchParams.get("limit") || 40), 100));
  const cursor = request.nextUrl.searchParams.get("cursor");
  const [statusPayload, laneEvents] = await Promise.all([
    fetchJson("http://127.0.0.1:10006/api/status", 1500),
    listLocalLaneEvents(prisma, { limit }),
  ]);

  const filteredEvents = cursor
    ? laneEvents.filter((event) => new Date(event.createdAt).getTime() > new Date(cursor).getTime())
    : laneEvents;
  const items = [
    ...buildIncidentItems(statusPayload),
    ...buildServiceItems(statusPayload),
    ...buildLaneEventItems(filteredEvents),
  ];
  const worker = statusPayload?.worker || {};
  const queue = statusPayload?.queue || {};
  const generatedAt = new Date().toISOString();
  const nextCursor = laneEvents[0]?.createdAt || cursor || null;

  const projection: SurfaceReadModel<LocalAiCommandCenterItem> = {
    contractVersion: 1,
    generatedAt,
    companyId: "__local_ai__",
    surface: "localAi.commandCenter",
    freshness: {
      status: statusPayload ? "FRESH" : "MISSING",
      generatedAt: statusPayload?.ts || null,
      ageMinutes: statusPayload?.ts ? Math.max(0, Math.round((Date.now() - new Date(statusPayload.ts).getTime()) / 60000)) : null,
    },
    summary: {
      runtimeHealth: statusPayload?.runtimeHealth?.state || "UNKNOWN",
      workerStage: worker.stage || "UNKNOWN",
      activeTask: worker.activeTask || null,
      activeCompany: worker.currentCompany || null,
      totalActiveJobs: Number(queue.totalActiveJobs || 0),
      runningJobs: Number(queue.runningJobs || 0),
      failedJobs: Number(queue.failedJobs || 0),
      servicesHealthy: Array.isArray(statusPayload?.managedServices?.services)
        ? statusPayload.managedServices.services.filter((service: any) => service.state === "healthy").length
        : 0,
      servicesTotal: Array.isArray(statusPayload?.managedServices?.services) ? statusPayload.managedServices.services.length : 0,
      nextCursor,
    },
    filters: [
      { key: "incident", label: "Incidents", count: items.filter((item) => item.kind === "incident").length },
      { key: "service", label: "Services", count: items.filter((item) => item.kind === "service").length },
      { key: "laneEvent", label: "Lane events", count: items.filter((item) => item.kind === "laneEvent").length },
    ],
    items,
    actions: [
      { key: "refresh", label: "Refresh command center", enabled: true },
      {
        key: "restartForeground",
        label: "Restart foreground worker",
        enabled: Boolean(statusPayload),
        confirm: {
          title: "Restart foreground worker",
          body: "Restarting the foreground worker interrupts the current local AI cycle. Continue only for recovery.",
          destructive: true,
        },
      },
    ],
    states: {
      empty: "No runtime incidents or lane events are currently visible.",
      stale: "Local command center status is stale or unavailable.",
      blocked: "A managed runtime service needs operator attention.",
      success: "Local command center status is available.",
    },
    observability: {
      sourceRunId: statusPayload?.ts ? `local-ai-command-center:${statusPayload.ts}` : null,
      inputWatermark: nextCursor,
      checksum: statusPayload?.worker?.settings?.buildIdentity?.gitSha || null,
    },
  };

  return NextResponse.json({
    ok: Boolean(statusPayload),
    projection,
    cursor: nextCursor,
    rawStatusAvailable: Boolean(statusPayload),
    compat: {
      statusPayload,
      laneEvents: filteredEvents,
    },
  }, { status: statusPayload ? 200 : 503 });
}
