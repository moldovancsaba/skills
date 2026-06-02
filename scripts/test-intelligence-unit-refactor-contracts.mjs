import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const files = {
  capabilities: readFileSync(join(ROOT, "src/lib/intelligence-unit-capabilities.ts"), "utf8"),
  packages: readFileSync(join(ROOT, "src/lib/check-foundation/unit-packages.ts"), "utf8"),
  lanes: readFileSync(join(ROOT, "src/lib/local-execution-lanes.ts"), "utf8"),
  inventory: readFileSync(join(ROOT, "scripts/local-runnable-inventory.mjs"), "utf8"),
};

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

assert(/profile\?:\s*string/.test(files.capabilities), "raw v2 capability payload must accept profile alias");
assert(/profile\s*\?\?\s*legacyWithVersion\.webappProfile/.test(files.capabilities), "legacy versioned payloads must prefer v2 profile before webappProfile");
assert(/validation\.isValid\s*=\s*validation\.errors\.length\s*===\s*0/.test(files.capabilities), "capability validation must fail when errors exist");
assert(/normalizeUnitCapabilitiesPayloadForWrite/.test(files.capabilities), "capability write normalizer must exist");

assert(/type\s+UnitPackageValidationResult/.test(files.packages), "unit package validation result contract must exist");
assert(/validateUnitPackageChange/.test(files.packages), "unit package change validator must exist");
assert(/block-not-allowed-by-package/.test(files.packages), "unit package validator must reject package-incompatible Blocks");
assert(/Enable at least one Miniapp instance/.test(files.packages), "unit package validator must expose miniapp setup-required state");

assert(/type\s+PlaylistMutationCategory/.test(files.lanes), "playlist mutation category contract must exist");
assert(/PLAYLIST_MUTATION_POLICIES/.test(files.lanes), "playlist mutation policy registry must exist");
assert(/assertPlaylistMutationPolicy/.test(files.lanes), "playlist mutation category-lane guard must exist");
assert(/buildQueuedMutationResponse/.test(files.lanes), "queued mutation response helper must exist");
assert(/Work was queued for CHECK Local/.test(files.lanes), "queued mutation response must expose operator-safe message");

assert(/api:\/api\/miniapps\/:miniappKey\/ops\/actions/.test(files.inventory), "miniapp ops action bypass must be explicitly classified");
assert(/Human-Approved Burst child jobs/.test(files.inventory), "miniapp ops bypass must have migration target");
assert(/api:\/api\/miniapps\/:miniappKey\/intelligence-contract/.test(files.inventory), "miniapp intelligence contract bypass must be explicitly classified");

if (failures.length > 0) {
  console.error("intelligence unit refactor contracts failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("intelligence unit refactor contracts passed.");
