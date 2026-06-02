import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const runtime = readFileSync("src/lib/miniapp-evidence-runtime.ts", "utf8");
const route = readFileSync("src/app/api/visitor/[visitorKey]/research/tasks/run-once/route.ts", "utf8");
const docs = readFileSync("docs/miniapps/sovereign-intelligence-contract.md", "utf8");

assert(runtime.includes('MINIAPP_EVIDENCE_ARTIFACT_SOURCE_TYPE = "miniapp_evidence_artifact"'), "runtime must persist evidence artifacts separately");
assert(runtime.includes("MINIAPP_RESEARCH_TASK_SOURCE_TYPE"), "runtime must update research task status");
assert(runtime.includes("duckduckgo") && runtime.includes("bing-html"), "runtime must use free search provider fallback");
assert(runtime.includes("AbortSignal.timeout"), "runtime must enforce network timeouts");
assert(runtime.includes("FOUND_EVIDENCE") && runtime.includes("NO_RESULTS") && runtime.includes("EXHAUSTED"), "runtime must implement task lifecycle states");
assert(runtime.includes("maxDomainRetries"), "runtime must honor contract retry budgets");
assert(runtime.includes("maxResultsPerTask"), "runtime must honor contract result limits");
assert(runtime.includes("sourceCardInventoryIsSuccess: false"), "runtime must not treat source inventory as success");
assert(runtime.includes('successMetric: "verified_public_visible_cards"'), "runtime artifacts must carry public-card success metric");
assert(runtime.includes("relevanceScore") && runtime.includes("authorityScore"), "runtime must score evidence artifacts");

assert(route.includes('verifyMembership(request, companyId, "ADMIN")'), "runtime route must require admin access");
assert(route.includes("runMiniappEvidenceRuntimeOnce"), "runtime route must execute runtime");
assert(route.includes("taskId") && route.includes("maxTasks"), "runtime route must expose execution controls");

assert(docs.includes("Evidence Runtime"), "docs must document evidence runtime");
assert(docs.includes("miniapp_evidence_artifact"), "docs must document evidence artifact persistence");

console.log("miniapp evidence runtime contract OK");
