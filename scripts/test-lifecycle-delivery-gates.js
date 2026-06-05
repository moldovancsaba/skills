const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const {
  buildLifecycleControlCenterView,
  buildLifecycleMigrationReport,
  buildLifecycleVerificationReport,
  buildPublicVerificationProof,
  buildRecoveryActionView,
} = require("../src/lib/check-lifecycle/lifecycle-spine");

const proof = buildPublicVerificationProof({
  localItems: [
    { id: "item_1", title: "Real item", hasSourceEvidence: true, category: "classes" },
    { id: "item_2", title: "Bad item", hasSourceEvidence: false, fakeOrPlaceholder: true },
  ],
  publicItems: [
    { id: "item_1", title: "Real item", category: "classes", publicUrl: "https://example.test/item_1" },
    { id: "orphan", title: "Orphan public item", publicUrl: "https://example.test/orphan" },
  ],
  readModelFresh: true,
  publicAvailable: true,
});

assert.equal(proof.state, "rollback_pending", "critical public drift must require rollback");
assert.equal(proof.rollbackActionCount, 2, "missing evidence and orphan public item must create rollback actions");
assert.equal(proof.reasonCodes.includes("missing_source_evidence"), true, "proof must expose missing source evidence");
assert.equal(proof.reasonCodes.includes("public_item_missing_local_proof"), true, "proof must expose orphan public item");

const staleProof = buildPublicVerificationProof({ readModelFresh: false, publicItems: [], localItems: [] });
assert.equal(staleProof.state, "pending", "stale read model must prevent verified state");

const controlCenter = buildLifecycleControlCenterView({
  companyId: "unit_1",
  blocks: ["miniapp"],
  modules: ["data", "review"],
  miniapps: ["compare"],
  lifecycleHealth: { state: "repairing", operatorMessage: "Repairing lifecycle drift." },
  daemonLane: { metadata: { destinationKeys: ["compare"], sourceSignal: "Compare daemon armed." } },
  publicVerification: proof,
  operations: [{ id: "local-job:1", severity: "critical", status: "failed", safeActions: ["retry"] }],
});

assert.equal(controlCenter.state, "failed", "critical operation must surface failed lifecycle UI state");
assert.equal(controlCenter.accessibility.gdsOnly, true, "control center view must require GDS-only rendering");
assert.equal(controlCenter.uxStates.includes("permission-denied"), true, "control center must include permission-denied UX state");

const migration = buildLifecycleMigrationReport({
  companyId: "unit_1",
  destinationKeys: ["compare"],
  existingPipelineJobs: [],
  existingMissionKinds: [],
  stalePublicProjectionIds: ["content_1"],
  fakeOrTestContentIds: ["content_fake"],
});

assert.equal(migration.dryRun, true, "migration report must default to dry-run");
assert.equal(migration.summary.quarantineCount, 1, "fake/test content must be quarantined");
assert.equal(migration.actions.some((action) => action.status === "would_create"), true, "dry-run actions must be would_create");

const verification = buildLifecycleVerificationReport({
  companyId: "unit_1",
  destinationKeys: ["compare"],
  requiredPipelineJobs: ["DESTINATION_MISSION_DAEMON"],
  existingPipelineJobs: [],
  daemonLane: { metadata: { destinationKeys: [] } },
  activeMissionKinds: ["legacy_unknown"],
  schedulableMissionKinds: ["VISITOR_CONTENT_CURATION"],
  publicVerification: proof,
});

assert.equal(verification.ok, false, "broken lifecycle invariants must fail verification");
assert.equal(
  verification.failedChecks.some((check) => check.id === "active-unit-has-core-jobs"),
  true,
  "verification must fail missing core jobs",
);
assert.equal(
  verification.failedChecks.some((check) => check.id === "mission-kind-schedulable"),
  true,
  "verification must fail unsupported mission kinds",
);
assert.equal(
  verification.failedChecks.some((check) => check.id === "public-content-source-backed"),
  true,
  "verification must fail public proof drift",
);

const recovery = buildRecoveryActionView({
  id: "local-job:1",
  source: "local_job",
  status: "dead_lettered",
  severity: "critical",
  safeActions: ["replay", "rollback", "acknowledge"],
  summary: "Job dead-lettered.",
});

assert.equal(recovery.confirmationRequired, true, "rollback-capable recovery must require confirmation");
assert.equal(recovery.auditRequired, true, "recovery action must require audit");
assert.equal(recovery.idempotencyRequired, true, "recovery action must require idempotency");

const publicVerificationSource = readFileSync(join(process.cwd(), "src/lib/visitor-public-verification.ts"), "utf8");
assert.match(publicVerificationSource, /buildPublicVerificationProof/, "public verification route must expose proof contract");
assert.match(publicVerificationSource, /rollbackActions/, "public verification summary must expose rollback actions");

const operationsSource = readFileSync(join(process.cwd(), "src/app/api/companies/[companyId]/operations/route.ts"), "utf8");
assert.match(operationsSource, /buildRecoveryActionView/, "operations API must expose recovery action view");

const operationActionSource = readFileSync(join(process.cwd(), "src/app/api/companies/[companyId]/operations/[itemId]/[action]/route.ts"), "utf8");
assert.match(operationActionSource, /guardedUnitMutation/, "operations actions must be permission guarded");
assert.match(operationActionSource, /recordOutcomeEvent/, "operations actions must write outcome audit events");

const observabilityApiSource = readFileSync(join(process.cwd(), "src/app/api/observability/route.ts"), "utf8");
assert.match(observabilityApiSource, /lifecycleControlCenter/, "observability API must expose lifecycle control center view");

const observabilityPageSource = readFileSync(join(process.cwd(), "src/app/[companyId]/observability/page.tsx"), "utf8");
assert.match(observabilityPageSource, /Lifecycle Control Center/, "observability UI must render lifecycle control center");
assert.match(observabilityPageSource, /aria-live="polite"/, "lifecycle UI must announce status changes politely");

const migrationSource = readFileSync(join(process.cwd(), "scripts/lifecycle-migration-backfill.mjs"), "utf8");
assert.match(migrationSource, /--dry-run/, "migration CLI must support dry-run");
assert.match(migrationSource, /--apply/, "migration CLI must support apply mode");
assert.match(migrationSource, /fakeOrTestContentIds/, "migration CLI must quarantine fake/test content");

const verifyLifecycleSource = readFileSync(join(process.cwd(), "scripts/verify-lifecycle.mjs"), "utf8");
assert.match(verifyLifecycleSource, /buildLifecycleVerificationReport/, "verify:lifecycle must include lifecycle gate report");

console.log("Lifecycle delivery gate contract tests passed.");
