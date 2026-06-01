import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const registry = JSON.parse(
  readFileSync(join(ROOT, "src/lib/check-foundation/unit-packages-data.json"), "utf8"),
);

const failures = [];
const expectedBlocks = ["checklist", "sales", "project", "miniapp"];
const expectedPackages = ["core", "sales-only", "project-only", "miniapp-ops", "full"];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

assert(registry.schemaVersion === 1, "unit package registry schemaVersion must be 1");
assert(Array.isArray(registry.packages), "unit package registry packages must be an array");

const keys = registry.packages.map((item) => item.key);
assert(keys.length === new Set(keys).size, "package keys must be unique");

for (const expectedPackage of expectedPackages) {
  assert(keys.includes(expectedPackage), `missing package definition: ${expectedPackage}`);
}

for (const definition of registry.packages) {
  assert(definition.displayName?.trim(), `package ${definition.key} missing displayName`);
  assert(Array.isArray(definition.allowedBlocks) && definition.allowedBlocks.length > 0, `package ${definition.key} missing allowedBlocks`);
  assert(Array.isArray(definition.defaultEnabledBlocks) && definition.defaultEnabledBlocks.length > 0, `package ${definition.key} missing defaultEnabledBlocks`);
  assert(Array.isArray(definition.requiredPermissions), `package ${definition.key} missing requiredPermissions`);

  for (const block of definition.allowedBlocks) {
    assert(expectedBlocks.includes(block), `package ${definition.key} includes unknown block: ${block}`);
  }
  for (const block of definition.defaultEnabledBlocks) {
    assert(definition.allowedBlocks.includes(block), `package ${definition.key} default block ${block} is not in allowedBlocks`);
  }
}

if (failures.length > 0) {
  console.error("check foundation unit package registry contract failed:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("check foundation unit package registry contract passed.");
