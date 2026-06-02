import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const lifecycle = readFileSync("src/lib/miniapp-opportunity-lifecycle.ts", "utf8");
const listRoute = readFileSync("src/app/api/visitor/[visitorKey]/research/opportunities/route.ts", "utf8");
const promoteRoute = readFileSync("src/app/api/visitor/[visitorKey]/research/opportunities/promote/route.ts", "utf8");
const docs = readFileSync("docs/miniapps/sovereign-intelligence-contract.md", "utf8");

assert(lifecycle.includes("MINIAPP_EVIDENCE_ARTIFACT_SOURCE_TYPE"), "opportunity lifecycle must consume evidence artifacts");
assert(lifecycle.includes("MiniappOpportunityCard"), "opportunity lifecycle must define opportunitycard contract");
assert(lifecycle.includes("minimumEvidenceScore"), "promotion must enforce minimum evidence score");
assert(lifecycle.includes("minimumSourceAuthorityScore"), "promotion must enforce source authority score");
assert(lifecycle.includes("minimumCandidateScore"), "promotion must enforce candidate score");
assert(lifecycle.includes('visitorCandidateState: "OPPORTUNITY_CANDIDATE"'), "solid opportunities must become visitor candidates");
assert(lifecycle.includes('status: solid ? "CANDIDATE" : "REWORK_REQUIRED"'), "weak evidence must loop to rework");
assert(lifecycle.includes("sourceCardInventoryIsSuccess: false"), "opportunity lifecycle must reject source inventory success");
assert(lifecycle.includes("DestinationWorkflowState.DISCOVERED"), "new candidates must enter destination workflow safely");
assert(lifecycle.includes("miniappEvidencePromotion"), "evidence artifacts must record promotion outcome");

assert(listRoute.includes('verifyMembership(request, companyId, "MEMBER")'), "opportunity list route must require membership");
assert(promoteRoute.includes('verifyMembership(request, companyId, "ADMIN")'), "promotion route must require admin access");
assert(promoteRoute.includes("promoteMiniappEvidenceToOpportunities"), "promotion route must call lifecycle");

assert(docs.includes("Opportunity Lifecycle"), "docs must document opportunity lifecycle");
assert(docs.includes("REWORK_REQUIRED"), "docs must document rework path");

console.log("miniapp opportunity lifecycle contract OK");
