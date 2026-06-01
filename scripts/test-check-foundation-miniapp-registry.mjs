import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const registry = JSON.parse(
  readFileSync(join(ROOT, "src/lib/check-foundation/miniapp-registry-data.json"), "utf8"),
);

const failures = [];
const requiredMiniapps = ["classscout", "compare"];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

assert(registry.schemaVersion === 1, "miniapp registry schemaVersion must be 1");
assert(Array.isArray(registry.miniapps), "miniapp registry miniapps must be an array");

const ids = registry.miniapps.map((item) => item.id);
assert(ids.length === new Set(ids).size, "miniapp ids must be unique");

for (const requiredId of requiredMiniapps) {
  assert(ids.includes(requiredId), `missing miniapp definition: ${requiredId}`);
}

for (const definition of registry.miniapps) {
  assert(definition.blockId === "miniapp", `miniapp ${definition.id} must use blockId=miniapp`);
  assert(definition.name?.trim(), `miniapp ${definition.id} missing name`);
  assert(
    Array.isArray(definition.supportedContentTypes) && definition.supportedContentTypes.length > 0,
    `miniapp ${definition.id} missing supportedContentTypes`,
  );
  assert(definition.adapterKey?.trim(), `miniapp ${definition.id} missing adapterKey`);
  assert(definition.defaultOpsRoute?.trim(), `miniapp ${definition.id} missing defaultOpsRoute`);
  assert(definition.publicBaseUrlEnv?.trim(), `miniapp ${definition.id} missing publicBaseUrlEnv`);
}

if (failures.length > 0) {
  console.error("check foundation miniapp registry contract failed:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("check foundation miniapp registry contract passed.");
