import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const files = {
  capabilities: readFileSync(join(ROOT, "src/lib/intelligence-unit-capabilities.ts"), "utf8"),
  packages: readFileSync(join(ROOT, "src/lib/check-foundation/unit-packages.ts"), "utf8"),
  lanes: readFileSync(join(ROOT, "src/lib/local-execution-lanes.ts"), "utf8"),
  miniappOpsQueue: readFileSync(join(ROOT, "src/lib/miniapp-ops-queue.ts"), "utf8"),
  miniappOpsRoute: readFileSync(join(ROOT, "src/app/api/miniapps/[miniappKey]/ops/actions/route.ts"), "utf8"),
  pipelineJobs: readFileSync(join(ROOT, "scripts/lib/pipeline-jobs.js"), "utf8"),
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

assert(/ACTION_TO_VISITOR_INTENT/.test(files.miniappOpsQueue), "miniapp ops queue adapter must map actions to visitor intents");
assert(/RESEARCH_BACKFILL/.test(files.miniappOpsQueue), "miniapp ops actions must enqueue RESEARCH_BACKFILL jobs");
assert(/MINIAPP_OPS_ACTION/.test(files.miniappOpsQueue), "miniapp ops queued jobs must use explicit entity type");
assert(/miniapp_ops_action_queued/.test(files.miniappOpsQueue), "miniapp ops queue adapter must return queued action code");
assert(/workerAuthorized/.test(files.miniappOpsRoute), "miniapp ops route must distinguish worker execution from operator queueing");
assert(/enqueueMiniappOpsAction/.test(files.miniappOpsRoute), "miniapp ops route must enqueue operator calls");
assert(/research\.evidence\.run/.test(files.pipelineJobs), "pipeline worker must map evidence run visitor intent");
assert(/research\.humanLane\.run/.test(files.pipelineJobs), "pipeline worker must map human lane visitor intent");
assert(/sourceTerm/.test(files.pipelineJobs), "pipeline worker must pass sourceTerm through queued miniapp actions");

assert(/api:\/api\/miniapps\/:miniappKey\/ops\/actions/.test(files.inventory), "miniapp ops action route must be explicitly classified");
assert(/api:\/api\/miniapps\/:miniappKey\/ops\/actions", \{ lane: LANE\.PLAYLIST/.test(files.inventory), "miniapp ops action route must classify as Playlist after queue migration");
assert(/api:\/api\/miniapps\/:miniappKey\/intelligence-contract/.test(files.inventory), "miniapp intelligence contract bypass must be explicitly classified");
assert(/api:\/api\/miniapps\/:miniappKey\/intelligence-contract", \{ lane: LANE\.SYSTEM_HEALTH/.test(files.inventory), "miniapp intelligence contract must classify as read-only System Health");

if (failures.length > 0) {
  console.error("intelligence unit refactor contracts failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("intelligence unit refactor contracts passed.");
