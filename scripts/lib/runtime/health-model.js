"use strict";

const { RESOURCE_BANDS } = require("./resource-bands");
const { SERVICE_CRITICALITY, SERVICE_STATES } = require("./managed-services");

const RUNTIME_HEALTH_STATES = Object.freeze({
  HEALTHY: "HEALTHY",
  DEGRADED: "DEGRADED",
  BLOCKED_INFRA: "BLOCKED_INFRA",
  LOW_MEMORY: "LOW_MEMORY",
  QUEUE_STARVED: "QUEUE_STARVED",
  RECOVERING: "RECOVERING",
  CRITICAL: "CRITICAL",
});

function buildIncident(input) {
  return {
    id: input.id,
    severity: input.severity || "warning",
    code: input.code,
    summary: input.summary,
    affectedServices: input.affectedServices || [],
    affectedJobTypes: input.affectedJobTypes || [],
    startedAt: input.startedAt || new Date().toISOString(),
    nextAction: input.nextAction || "Inspect runtime state.",
    nextRetryAt: input.nextRetryAt || null,
  };
}

function collectServiceIncidents(managedServices = {}) {
  const services = Array.isArray(managedServices.services)
    ? managedServices.services
    : Object.values(managedServices.services || managedServices || {});
  return services
    .filter((service) => service && service.state && service.state !== SERVICE_STATES.HEALTHY)
    .map((service) => {
      const critical = service.criticality === SERVICE_CRITICALITY.CRITICAL;
      const restartLimited = service.state === SERVICE_STATES.RESTART_LIMITED;
      return buildIncident({
        id: `service:${service.serviceId}`,
        severity: critical || restartLimited ? "critical" : "warning",
        code: service.incidentCode || `SERVICE_${String(service.state).toUpperCase()}`,
        summary: `${service.displayName || service.serviceId} is ${service.state}. ${service.lastError || ""}`.trim(),
        affectedServices: [service.serviceId],
        startedAt: service.lastCheckedAt || service.lastRestartAt || new Date().toISOString(),
        nextAction: service.operatorAction || "Inspect service state and restart if safe.",
      });
    });
}

function collectBreakerIncidents(queueCircuitBreakers = {}) {
  const active = Array.isArray(queueCircuitBreakers.active) ? queueCircuitBreakers.active : [];
  return active
    .filter((breaker) => breaker && breaker.state && breaker.state !== "closed")
    .map((breaker) => buildIncident({
      id: `breaker:${breaker.id}`,
      severity: breaker.state === "open" ? "warning" : "info",
      code: `QUEUE_BREAKER_${String(breaker.failureClass || breaker.id || "UNKNOWN").toUpperCase()}`,
      summary: breaker.reason || `${breaker.id} circuit breaker is ${breaker.state}.`,
      affectedJobTypes: breaker.affectedJobTypes || [],
      startedAt: breaker.openedAt || new Date().toISOString(),
      nextAction: breaker.nextAction || "Wait for retry window or manually confirm retry.",
      nextRetryAt: breaker.nextRetryAt || null,
    }));
}

function collectMemoryIncident(memorySteward = {}) {
  const band = memorySteward.resourceBand || memorySteward.plan?.resourceBand;
  if (band !== RESOURCE_BANDS.CRITICAL && band !== RESOURCE_BANDS.DEGRADED) return [];
  return [buildIncident({
    id: "memory:runtime-guard",
    severity: band === RESOURCE_BANDS.CRITICAL ? "critical" : "warning",
    code: band === RESOURCE_BANDS.CRITICAL ? "MEMORY_CRITICAL" : "MEMORY_DEGRADED",
    summary: `Runtime memory guard reports ${band} memory (${memorySteward.freeMemMb ?? "unknown"}MB free).`,
    nextAction: "Pause background work and use memory steward recommendations.",
  })];
}

function collectQueueIncident(queue = {}, worker = {}) {
  const active = Number(queue.totalActiveJobs || 0);
  const running = Number(queue.runningJobs || 0);
  const workerRunning = worker.state === "running";
  const workerOnline = worker.online !== false;
  const lastProgressMs = worker.lastProgressAt ? new Date(worker.lastProgressAt).getTime() : 0;
  const freshWorker = workerOnline && Number.isFinite(lastProgressMs) && Date.now() - lastProgressMs < 2 * 60 * 1000;
  if (active > 0 && running === 0 && !workerRunning && !freshWorker && queue.currentJob) {
    return [buildIncident({
      id: "queue:no-running-work",
      severity: "warning",
      code: "QUEUE_STARVED",
      summary: `Queue has ${active} active job(s), but no job is running.`,
      affectedJobTypes: queue.currentJob?.jobType ? [queue.currentJob.jobType] : [],
      nextAction: "Inspect queue head, active circuit breakers, and worker scheduler state.",
    })];
  }
  return [];
}

function reduceRuntimeHealth(input = {}) {
  const incidents = [
    ...collectServiceIncidents(input.managedServices),
    ...collectBreakerIncidents(input.queueCircuitBreakers),
    ...collectMemoryIncident(input.memorySteward),
    ...collectQueueIncident(input.queue, input.worker),
  ];
  const criticalIncidents = incidents.filter((incident) => incident.severity === "critical");
  const hasCriticalService = criticalIncidents.some((incident) => incident.id.startsWith("service:"));
  const hasInfraBreaker = incidents.some((incident) => incident.id.startsWith("breaker:"));
  const hasMemoryCritical = incidents.some((incident) => incident.code === "MEMORY_CRITICAL");
  const hasQueueStarved = incidents.some((incident) => incident.code === "QUEUE_STARVED");
  const recovering = Object.values(input.managedServices?.services || {}).some((service) => service.state === SERVICE_STATES.RECOVERING);

  let state = RUNTIME_HEALTH_STATES.HEALTHY;
  if (hasCriticalService) state = RUNTIME_HEALTH_STATES.CRITICAL;
  else if (hasInfraBreaker) state = RUNTIME_HEALTH_STATES.BLOCKED_INFRA;
  else if (hasMemoryCritical) state = RUNTIME_HEALTH_STATES.LOW_MEMORY;
  else if (hasQueueStarved) state = RUNTIME_HEALTH_STATES.QUEUE_STARVED;
  else if (recovering) state = RUNTIME_HEALTH_STATES.RECOVERING;
  else if (incidents.length > 0) state = RUNTIME_HEALTH_STATES.DEGRADED;

  return {
    state,
    ok: state === RUNTIME_HEALTH_STATES.HEALTHY,
    summary: incidents[0]?.summary || "CHECK Local runtime is healthy.",
    generatedAt: new Date().toISOString(),
    incidents,
  };
}

module.exports = {
  RUNTIME_HEALTH_STATES,
  buildIncident,
  collectBreakerIncidents,
  collectMemoryIncident,
  collectQueueIncident,
  collectServiceIncidents,
  reduceRuntimeHealth,
};
