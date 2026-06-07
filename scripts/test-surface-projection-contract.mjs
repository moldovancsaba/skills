import assert from "node:assert/strict";
import {
  buildMissingSurfaceReadModel,
  checksumSurfacePayload,
  drainDirtySurfaceProjections,
  enqueueDirtySurfaceProjection,
  normalizeSurfaceProjectionRefreshState,
  normalizeSurfaceReadModel,
  recordSurfaceProjectionRefreshResult,
  stableStringify,
} from "../src/lib/surface-projections.ts";
import runtime from "./lib/surface-projections.js";

const left = { b: 2, a: { z: 3, y: [1, 2] } };
const right = { a: { y: [1, 2], z: 3 }, b: 2 };
assert.equal(stableStringify(left), stableStringify(right), "stable stringify must be key-order independent");
assert.equal(checksumSurfacePayload(left), checksumSurfacePayload(right), "checksum must be key-order independent");

const missing = buildMissingSurfaceReadModel("company-1", "unitBoard.project", 3);
assert.equal(missing.companyId, "company-1");
assert.equal(missing.surface, "unitBoard.project");
assert.equal(missing.contractVersion, 3);
assert.equal(missing.freshness.status, "MISSING");
assert.equal(missing.observability.lastError, "PROJECTION_MISSING");

const normalized = normalizeSurfaceReadModel({
  contractVersion: 1,
  generatedAt: "2026-06-07T12:00:00.000Z",
  companyId: "company-1",
  surface: "settings.capabilityControl",
  summary: { ready: true },
  filters: [{ key: "all", label: "All", count: 1 }],
  items: [{ id: "row-1" }],
  actions: [{ key: "refreshProjection", label: "Refresh", enabled: true }],
  observability: { checksum: "abc" },
}, { companyId: "fallback", surfaceKey: "fallback.surface", contractVersion: 1 });
assert.equal(normalized.companyId, "company-1");
assert.equal(normalized.surface, "settings.capabilityControl");
assert.equal(normalized.items.length, 1);
assert.equal(normalized.actions[0].key, "refreshProjection");

const dirtyState = enqueueDirtySurfaceProjection({}, "company-1", "unitBoard.project", "test");
const deduped = enqueueDirtySurfaceProjection(dirtyState, "company-1", "unitBoard.project", "latest");
assert.equal(deduped.dirtySurfaces.length, 1, "dirty surface queue must dedupe company/surface pairs");
assert.equal(deduped.dirtySurfaces[0].reason, "latest");

const drained = drainDirtySurfaceProjections({
  dirtySurfaces: [
    { companyId: "company-1", surfaceKey: "a", reason: "a", requestedAt: "2026-06-07T12:00:00.000Z" },
    { companyId: "company-1", surfaceKey: "b", reason: "b", requestedAt: "2026-06-07T12:01:00.000Z", nextRetryAt: "2999-01-01T00:00:00.000Z" },
  ],
  recentRefreshes: [],
}, 5);
assert.equal(drained.drained.length, 1, "future retry entries must not drain yet");
assert.equal(drained.remaining.length, 1);

const withEvent = recordSurfaceProjectionRefreshResult(normalizeSurfaceProjectionRefreshState({}), {
  companyId: "company-1",
  surfaceKey: "unitBoard.project",
  reason: "test",
  status: "REFRESHED",
  trigger: "unit-test",
});
assert.equal(withEvent.recentRefreshes.length, 1);
assert.equal(withEvent.recentRefreshes[0].status, "REFRESHED");

assert.equal(runtime.checksumSurfacePayload(left), checksumSurfacePayload(left), "runtime and app checksums must agree");
const runtimeDirty = runtime.enqueueDirtySurfaceProjection({}, "company-1", "company.dashboardSummary", "test");
assert.equal(runtimeDirty.dirtySurfaces.length, 1);
assert.equal(runtime.listSurfaceProjectionBuilders().some((builder) => builder.surfaceKey === "company.dashboardSummary"), true);

console.log("Surface projection contract tests passed.");
