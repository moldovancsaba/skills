import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const planner = readFileSync("src/lib/miniapp-research-planner.ts", "utf8");
const listRoute = readFileSync("src/app/api/visitor/[visitorKey]/research/tasks/route.ts", "utf8");
const planRoute = readFileSync("src/app/api/visitor/[visitorKey]/research/tasks/plan/route.ts", "utf8");
const docs = readFileSync("docs/miniapps/sovereign-intelligence-contract.md", "utf8");

assert(planner.includes('MINIAPP_RESEARCH_TASK_SOURCE_TYPE = "miniapp_research_task"'), "planner must persist internal research tasks");
assert(planner.includes("sourceCardInventoryIsSuccess: false"), "planner must never count source-card inventory as success");
assert(planner.includes("successMetric: contract.promotionPolicy.successMetric"), "planner must preserve contract success metric");
assert(planner.includes("buildMiniappResearchTaskFingerprint"), "planner must expose deterministic fingerprints");
assert(planner.includes("synthesizeMiniappResearchTaskDrafts"), "planner must expose deterministic synthesis");
assert(planner.includes("listVisitorSourceDatacards"), "planner must use datacards as research input");
assert(planner.includes("listVisitorFlashcards"), "planner must use flashcards as research input");
assert(planner.includes("listVisitorFeedbackMemory"), "planner must use learning memory");
assert(planner.includes("getVisitorPublicVerificationSummary"), "planner must plan against public visible count");
assert(planner.includes("expectedEvidenceTypes"), "planner must remain evidence-contract-driven");
assert(planner.includes("0.45 * coverageGap + 0.25 * sourceDiversity + 0.2 * historicalSuccess + 0.1 * freshness"), "planner priority formula must be explicit");
assert(planner.includes('status: "QUEUED"'), "new tasks must start queued");
assert(planner.includes('status !== "EXHAUSTED"'), "planner must preserve exhausted task recovery boundary");
assert(planner.includes("check://miniapp-research-task/"), "planner must avoid SOURCE-card URLs for task identity");

assert(listRoute.includes('verifyMembership(request, companyId, "MEMBER")'), "list route must require membership");
assert(listRoute.includes('sourceType: "miniapp_research_task"'), "list route must read stored research task projections");
assert(listRoute.includes("miniappResearchTask"), "list route must decode task projection metadata");
assert(!listRoute.includes("listMiniappResearchTasks"), "list route must not import planner runtime");
assert(listRoute.includes("sourceCardInventoryIsSuccess: false"), "list route must expose source inventory invariant");
assert(planRoute.includes('verifyMembership(request, companyId, "ADMIN")'), "plan route must require admin access");
assert(planRoute.includes("targetVisibleCards") && planRoute.includes("limit"), "plan route must expose target and limit controls");
assert(planRoute.includes("queueVisitorLocalIntent"), "plan route must queue Local AI intent");
assert(planRoute.includes('intentKind: "research.tasks.plan"'), "plan route must preserve planning intent kind");
assert(!planRoute.includes("planMiniappResearchTasks"), "plan route must not execute planner runtime in Webapp");

assert(docs.includes("Research Task Planner"), "docs must document the planner");
assert(docs.includes("miniapp_research_task"), "docs must document planner persistence");
assert(docs.includes("does not create SOURCE cards"), "docs must state SOURCE cards are not created");

console.log("miniapp research planner contract OK");
