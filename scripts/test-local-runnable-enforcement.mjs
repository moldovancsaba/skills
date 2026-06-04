import assert from "node:assert/strict";
import { buildLocalRunnableInventory, validateLocalRunnableInventory, LANE } from "./local-runnable-inventory.mjs";

function makeRecord(overrides = {}) {
  return {
    id: "test-entrypoint",
    humanName: "Test entrypoint",
    entrypoint: "script:tests/local-runnable-enforcement",
    trigger: "manual",
    lane: LANE.SYSTEM_HEALTH,
    mutatesBusinessContent: false,
    mutatesRuntimeHealth: true,
    requiresHumanApproval: false,
    ownerDoc: "docs/LOCAL_AI_RUNTIME_SOP.md",
    risk: "low",
    ...overrides,
  };
}

const inventory = buildLocalRunnableInventory();
const inventoryFailures = validateLocalRunnableInventory(inventory);
assert.equal(Array.isArray(inventoryFailures), true, "inventory validator must return a list");
assert.equal(inventoryFailures.length, 0, `inventory must currently be migration-clean (${inventoryFailures.join(", ")})`);

const syntheticForbidWithoutTarget = makeRecord({
  id: "synthetic:forbidden-without-target",
  lane: LANE.FORBIDDEN_BYPASS,
  mutatesBusinessContent: true,
  mutatesRuntimeHealth: false,
});
const syntheticBadSystemHealth = makeRecord({
  id: "synthetic:system-health-mutation",
  lane: LANE.SYSTEM_HEALTH,
  mutatesBusinessContent: true,
  mutatesRuntimeHealth: true,
});
const syntheticBurstWithoutApproval = makeRecord({
  id: "synthetic:burst-no-approval",
  lane: LANE.HUMAN_APPROVED_BURST,
  requiresHumanApproval: false,
  mutatesBusinessContent: true,
  mutatesRuntimeHealth: false,
});

const syntheticFailures = validateLocalRunnableInventory([
  ...inventory,
  syntheticForbidWithoutTarget,
  syntheticBadSystemHealth,
  syntheticBurstWithoutApproval,
]);

assert.equal(
  syntheticFailures.some((failure) => failure.includes("migration target")),
  true,
  "forbidden-bypass runnables must require migrationTarget",
);
assert.equal(
  syntheticFailures.some((failure) => failure.includes("System Health but mutates business content")),
  true,
  "system-health lane cannot mutate business content",
);
assert.equal(
  syntheticFailures.some((failure) => failure.includes("does not require human approval")),
  true,
  "burst lane must always require human approval",
);

console.log("Local runnable enforcement contract tests passed.");
