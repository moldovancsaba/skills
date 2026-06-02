import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const memory = readFileSync("src/lib/miniapp-learning-memory.ts", "utf8");
const planner = readFileSync("src/lib/miniapp-research-planner.ts", "utf8");
const syncRoute = readFileSync("src/app/api/visitor/[visitorKey]/research/learning/sync/route.ts", "utf8");
const listRoute = readFileSync("src/app/api/visitor/[visitorKey]/research/learning/route.ts", "utf8");
const docs = readFileSync("docs/miniapps/sovereign-intelligence-contract.md", "utf8");

assert(memory.includes("MiniappLearningRule"), "learning memory must define rule contract");
assert(memory.includes("miniapp_learning_memory:"), "learning memory must persist per company and visitor");
assert(memory.includes("NO_RESULTS") && memory.includes("EXHAUSTED"), "learning memory must consume research task failures");
assert(memory.includes("miniappPromotionGate"), "learning memory must consume promotion gate blockers");
assert(memory.includes("domain_retry_budget_exhausted"), "learning memory must preserve retry budget failures");
assert(memory.includes("suppress_domain") && memory.includes("expand_query") && memory.includes("retry_later"), "learning actions must be explicit");
assert(planner.includes("listMiniappLearningMemory"), "planner must read miniapp learning memory");
assert(planner.includes("[...feedbackMemory, ...miniappMemory]"), "planner must combine feedback and miniapp memory");

assert(syncRoute.includes('verifyMembership(request, companyId, "ADMIN")'), "learning sync route must require admin access");
assert(listRoute.includes('verifyMembership(request, companyId, "MEMBER")'), "learning list route must require membership");

assert(docs.includes("Learning Memory"), "docs must document learning memory");
assert(docs.includes("miniapp_learning_memory"), "docs must document persistence key");

console.log("miniapp learning memory contract OK");
