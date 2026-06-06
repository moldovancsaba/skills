"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  SERVICE_STATES,
  listManagedServiceDefinitions,
  topologicalSortServices,
  validateManagedServiceManifest,
} = require("./lib/runtime/managed-services");
const {
  buildManagedServiceReconciliationPlan,
  canRestartService,
} = require("./lib/runtime/service-reconciler");
const {
  RUNTIME_HEALTH_STATES,
  reduceRuntimeHealth,
} = require("./lib/runtime/health-model");
const {
  buildLogPressure,
  parseVmStat,
  rotateLogFile,
} = require("./lib/runtime/resource-accounting");
const {
  buildDestinationServiceOutageBreaker,
  normalizeQueueCircuitBreakerState,
} = require("../src/lib/pipeline-queue");

async function main() {
  const definitions = listManagedServiceDefinitions();
  const manifest = validateManagedServiceManifest(definitions);
  assert.equal(manifest.ok, true, "managed service manifest must validate");
  assert.equal(manifest.errors.length, 0, "managed service manifest must not contain structural errors");

  const sorted = topologicalSortServices(definitions).map((definition) => definition.id);
  assert.ok(
    sorted.indexOf("check-local-guardian") < sorted.indexOf("check-local-foreground"),
    "guardian must be ordered before foreground worker",
  );
  assert.ok(
    sorted.indexOf("check-local-guardian") < sorted.indexOf("destination-daemon"),
    "guardian must be ordered before destination daemon",
  );

  const duplicatePortManifest = validateManagedServiceManifest([
    definitions[0],
    { ...definitions[1], id: "duplicate-port", ports: definitions[1].ports },
  ]);
  assert.equal(duplicatePortManifest.ok, false, "duplicate service ports must fail manifest validation");

  const observedHealthy = Object.fromEntries(definitions.map((definition) => [definition.id, { healthy: true, pid: 1234 }]));
  const healthyPlan = buildManagedServiceReconciliationPlan({ definitions, observed: observedHealthy, now: new Date("2026-06-06T10:00:00.000Z") });
  assert.equal(
    healthyPlan.services["check-local-foreground"].state,
    SERVICE_STATES.HEALTHY,
    "healthy observations must produce healthy service state",
  );
  assert.equal(healthyPlan.actions.length, 0, "healthy services must not schedule restarts");

  const guardianDownObserved = {
    ...observedHealthy,
    "check-local-guardian": { healthy: false, pid: null, error: "process not found" },
  };
  const blockedPlan = buildManagedServiceReconciliationPlan({
    definitions,
    observed: guardianDownObserved,
    now: new Date("2026-06-06T10:01:00.000Z"),
  });
  assert.equal(blockedPlan.services["check-local-foreground"].state, SERVICE_STATES.BLOCKED, "critical dependency failures must block dependent services");
  assert.deepEqual(blockedPlan.services["check-local-foreground"].blockedBy, ["check-local-guardian"], "blocked service must name its dependency");

  const foreground = definitions.find((definition) => definition.id === "check-local-foreground");
  const restartDecision = canRestartService(foreground, {
    lastRestartAt: "2026-06-06T09:59:59.000Z",
    restartHistory: ["2026-06-06T09:59:59.000Z"],
  }, new Date("2026-06-06T10:00:00.000Z"));
  assert.equal(restartDecision.allowed, false, "restart backoff must prevent rapid restart loops");

  const breaker = buildDestinationServiceOutageBreaker({
    now: new Date("2026-06-06T10:00:00.000Z"),
    nextRetryAt: new Date("2026-06-06T10:30:00.000Z"),
    affectedCount: 44,
  });
  assert.equal(breaker.id, "destination-service-unavailable", "destination outage breaker id must be stable");
  assert.deepEqual(breaker.affectedJobTypes, ["DESTINATION_MISSION_DAEMON"], "breaker must identify affected queue lane");
  assert.equal(normalizeQueueCircuitBreakerState({ active: [breaker], recentEvents: [{ action: "opened" }] }).active.length, 1);

  const health = reduceRuntimeHealth({
    managedServices: healthyPlan,
    queueCircuitBreakers: { active: [breaker] },
    memorySteward: { resourceBand: "HEALTHY", freeMemMb: 4096 },
    queue: { totalActiveJobs: 10, runningJobs: 1 },
    worker: { state: "running" },
  });
  assert.equal(health.state, RUNTIME_HEALTH_STATES.BLOCKED_INFRA, "open infrastructure breakers must drive blocked infra health");
  assert.equal(health.incidents[0].id, "breaker:destination-service-unavailable", "breaker incidents must be visible");

  const vmStat = parseVmStat(`Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                               100.
Pages active:                             200.
Pages inactive:                           100.
Pages speculative:                         50.
Pages wired down:                         300.
Pages purgeable:                           20.
File-backed pages:                         40.
Anonymous pages:                           60.
Pages occupied by compressor:              70.
Pageouts:                                  10.
Swapouts:                                   0.`);
  assert.equal(vmStat.pageSize, 16384, "vm_stat parser must read page size");
  assert.ok(vmStat.reclaimableEstimateMb > 0, "vm_stat parser must expose reclaimable memory estimate");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "check-managed-runtime-"));
  const logFile = path.join(tempDir, "guardian.log");
  fs.writeFileSync(logFile, "x".repeat(1024));
  const pressure = buildLogPressure([logFile], { maxBytes: 512 });
  assert.equal(pressure[0].needsRotation, true, "log pressure must flag oversized files");
  const rotation = rotateLogFile(logFile, { maxBytes: 512, retention: 2 });
  assert.equal(rotation.rotated, true, "oversized logs must rotate");
  assert.equal(fs.existsSync(`${logFile}.1`), true, "rotated log must be retained");

  console.log("managed runtime contracts passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
