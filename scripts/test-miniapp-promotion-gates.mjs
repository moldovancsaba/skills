import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const gates = readFileSync("src/lib/miniapp-promotion-gates.ts", "utf8");
const route = readFileSync("src/app/api/visitor/[visitorKey]/research/gates/evaluate/route.ts", "utf8");
const docs = readFileSync("docs/miniapps/sovereign-intelligence-contract.md", "utf8");

assert(gates.includes("evaluateMiniappPromotionGates"), "promotion gate evaluator must exist");
assert(gates.includes("miniappOpportunityCard"), "promotion gate must evaluate miniapp opportunity candidates");
assert(gates.includes("minimumEvidenceScore"), "promotion gate must enforce evidence score");
assert(gates.includes("minimumSourceAuthorityScore"), "promotion gate must enforce source authority score");
assert(gates.includes("minimumCandidateScore"), "promotion gate must enforce candidate score");
assert(gates.includes("forbiddenSignals"), "promotion gate must enforce contract forbidden signals");
assert(gates.includes("evaluateCompareProjectionGate"), "promotion gate must include public projection gate");
assert(gates.includes('nextState: "NEEDS_REVIEW" | "REWORK_REQUIRED"'), "promotion gate states must be explicit");
assert(gates.includes("facts_snapshot_needed") && gates.includes("draft_payload_needed"), "promotion gate must identify review preparation gaps");
assert(gates.includes("sourceCardInventoryIsSuccess: false"), "promotion gate must reject source inventory success");

assert(route.includes('verifyMembership(request, companyId, "ADMIN")'), "promotion gate route must require admin access");
assert(route.includes("candidateId") && route.includes("limit"), "promotion gate route must expose controls");

assert(docs.includes("Promotion Gates"), "docs must document promotion gates");
assert(docs.includes("facts_snapshot_needed"), "docs must document review-preparation gaps");

console.log("miniapp promotion gates contract OK");
