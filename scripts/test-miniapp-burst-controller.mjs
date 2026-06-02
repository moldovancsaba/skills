import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const controller = readFileSync("src/lib/miniapp-burst-controller.ts", "utf8");
const runRoute = readFileSync("src/app/api/visitor/[visitorKey]/research/burst/run/route.ts", "utf8");
const stateRoute = readFileSync("src/app/api/visitor/[visitorKey]/research/burst/state/route.ts", "utf8");
const docs = readFileSync("docs/miniapps/sovereign-intelligence-contract.md", "utf8");

assert(controller.includes("runMiniappBurstUntilTarget"), "burst controller must expose until-target runner");
assert(controller.includes("getVisitorPublicVerificationSummary"), "burst controller must verify public visible count");
assert(controller.includes("planMiniappResearchTasks"), "burst controller must plan research tasks");
assert(controller.includes("runMiniappEvidenceRuntimeOnce"), "burst controller must run evidence runtime");
assert(controller.includes("promoteMiniappEvidenceToOpportunities"), "burst controller must promote evidence");
assert(controller.includes("evaluateMiniappPromotionGates"), "burst controller must evaluate gates");
assert(controller.includes("verified_public_visible_cards"), "burst controller must use public-card success metric");
assert(controller.includes("sourceCardInventoryIsSuccess: false"), "burst controller must reject source inventory success");
assert(controller.includes("max_cycles_reached_before_target"), "burst controller must report bounded non-stop continuation");
assert(controller.includes("recommendedNextDelayMs"), "burst controller must expose daemon continuation delay");

assert(runRoute.includes('verifyMembership(request, companyId, "ADMIN")'), "burst run route must require admin access");
assert(runRoute.includes("targetVisibleCards") && runRoute.includes("maxCycles") && runRoute.includes("tasksPerCycle"), "burst run route must expose controls");
assert(stateRoute.includes('verifyMembership(request, companyId, "MEMBER")'), "burst state route must require membership");

assert(docs.includes("Burst Controller"), "docs must document burst controller");
assert(docs.includes("max_cycles_reached_before_target"), "docs must document bounded non-stop behavior");

console.log("miniapp burst controller contract OK");
