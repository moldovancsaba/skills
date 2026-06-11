import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const lib = readFileSync("src/lib/miniapp-ops-console.ts", "utf8");
const snapshotRoute = readFileSync("src/app/api/miniapps/[miniappKey]/ops/snapshot/route.ts", "utf8");
const actionsRoute = readFileSync("src/app/api/miniapps/[miniappKey]/ops/actions/route.ts", "utf8");
const component = readFileSync("src/components/visitor-ops-workspace.tsx", "utf8");
const docs = readFileSync("docs/miniapps/sovereign-intelligence-contract.md", "utf8");

assert(lib.includes("getMiniappOpsSnapshot"), "ops snapshot read model must exist");
assert(lib.includes("executeMiniappOpsAction"), "ops action handler must exist");
assert(lib.includes("sourceCardInventoryIsSuccess"), "ops model must expose no-SOURCE success invariant");
assert(lib.includes("contentQualityScore"), "ops model must expose content quality score");
assert(lib.includes("publicVisibleCards") && lib.includes("targetVisibleCards"), "ops model must expose public-card target progress");
assert(lib.includes("researchTasks") && lib.includes("opportunities") && lib.includes("learningMemory"), "ops model must expose sovereign loop sections");
assert(lib.includes("pause_burst") && lib.includes("resume_burst") && lib.includes("retry_task"), "ops actions must support pause/resume/retry");
assert(lib.includes("suppress_domain") && lib.includes("override_suppression"), "ops actions must support suppression controls");
assert(lib.includes("code: \"miniapp_ops_paused\""), "paused actions must fail with structured code");
assert(lib.includes("correlationId") && lib.includes("retryable") && lib.includes("diagnostics"), "ops APIs must expose structured diagnostics");

assert(snapshotRoute.includes('verifyMembership(request, companyId, "MEMBER")'), "snapshot route must require membership");
assert(actionsRoute.includes('verifyMembership(request, companyId, "ADMIN")'), "actions route must require admin access");
assert(actionsRoute.includes("MiniappOpsAction"), "actions route must enforce action contract");

assert(component.includes("Sovereign Miniapp Ops"), "console must render sovereign ops title");
assert(component.includes("aria-live=\"polite\""), "console must announce action/error states");
assert(component.includes("aria-label=\"Miniapp operations sections\""), "console tabs must be accessible");
assert(component.includes("SOURCE inventory is not success"), "console must show no-SOURCE success invariant");
assert(component.includes("Run Burst Cycle") && component.includes("Re-plan") && component.includes("Sync Learning"), "console must expose core controls");
assert(component.includes("window.confirm"), "suppressive/destructive actions must require confirmation");
assert(component.includes("MetricCard") && component.includes("UnifiedCard"), "console must use local GDS primitives");
assert(!component.includes("style={{"), "console must not introduce custom inline visual system styles");

assert(docs.includes("Operator Console"), "docs must document operator console");
assert(docs.includes("/api/miniapps/[miniappKey]/ops/snapshot"), "docs must document snapshot API");
assert(docs.includes("/api/miniapps/[miniappKey]/ops/actions"), "docs must document actions API");

console.log("miniapp ops console contract OK");
