import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const registry = JSON.parse(
  readFileSync(join(ROOT, "src/lib/check-foundation/registry-data.json"), "utf8"),
);

const expectedBlocks = ["checklist", "sales", "project", "miniapp"];
const expectedModules = [
  "data",
  "topics",
  "goals",
  "review",
  "knowmore",
  "tactical",
  "analytics",
  "aiQueue",
  "checklist",
  "sales",
  "project",
  "miniapp",
];

const failures = [];

function unique(values) {
  return [...new Set(values)];
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

assert(registry.schemaVersion === 1, "registry schemaVersion must be 1");
assert(Array.isArray(registry.blocks), "registry.blocks must be an array");
assert(Array.isArray(registry.modules), "registry.modules must be an array");

const blockKeys = registry.blocks.map((definition) => definition.key);
const moduleKeys = registry.modules.map((definition) => definition.key);

assert(blockKeys.length === unique(blockKeys).length, "Block keys must be unique");
assert(moduleKeys.length === unique(moduleKeys).length, "Module keys must be unique");

for (const key of expectedBlocks) {
  assert(blockKeys.includes(key), `Missing Block definition: ${key}`);
}

for (const key of expectedModules) {
  assert(moduleKeys.includes(key), `Missing Module definition: ${key}`);
}

for (const block of registry.blocks) {
  assert(block.displayName?.trim(), `Block ${block.key} must have displayName`);
  assert(block.description?.trim(), `Block ${block.key} must have description`);
  assert(block.accessibleDescription?.trim(), `Block ${block.key} must have accessibleDescription`);
  assert(Array.isArray(block.requiredModules), `Block ${block.key} requiredModules must be an array`);
  assert(block.requiredModules.length > 0, `Block ${block.key} must require at least one Module`);
  assert(Array.isArray(block.optionalModules), `Block ${block.key} optionalModules must be an array`);
  assert(Array.isArray(block.cardTypes), `Block ${block.key} cardTypes must be an array`);
  assert(typeof block.publicService === "boolean", `Block ${block.key} publicService must be boolean`);

  for (const moduleKey of [...block.requiredModules, ...block.optionalModules]) {
    assert(moduleKeys.includes(moduleKey), `Block ${block.key} references unknown Module ${moduleKey}`);
  }
}

for (const moduleDefinition of registry.modules) {
  assert(moduleDefinition.displayName?.trim(), `Module ${moduleDefinition.key} must have displayName`);
  assert(moduleDefinition.description?.trim(), `Module ${moduleDefinition.key} must have description`);
  assert(
    moduleDefinition.accessibleDescription?.trim(),
    `Module ${moduleDefinition.key} must have accessibleDescription`,
  );
  assert(Array.isArray(moduleDefinition.cardTypes), `Module ${moduleDefinition.key} cardTypes must be an array`);
  assert(
    ["webapp", "local", "shared"].includes(moduleDefinition.runtimeOwner),
    `Module ${moduleDefinition.key} has invalid runtimeOwner`,
  );
}

const projectBlock = registry.blocks.find((definition) => definition.key === "project");
assert(projectBlock?.requiredModules.length === 1, "Project Block must remain standalone");
assert(projectBlock?.requiredModules[0] === "project", "Project Block must only require the Project Module");
assert(projectBlock?.cardTypes.includes("projectcard"), "Project Block must own projectcard");
assert(projectBlock?.publicService === false, "Project Block must not be a public service");

const miniappBlock = registry.blocks.find((definition) => definition.key === "miniapp");
assert(miniappBlock?.publicService === true, "Miniapp Block must be marked as public-service capable");

if (failures.length > 0) {
  console.error("check foundation registry contract failed:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("check foundation registry contract passed.");
