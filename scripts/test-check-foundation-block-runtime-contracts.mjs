import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();

const {
  buildLocalJobEnvelopeFromPipelineJob,
  resolvePipelineJobAttribution,
} = require("../src/lib/local-job-attribution.js");

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const blockRegistry = JSON.parse(read("src/lib/check-foundation/registry-data.json"));
const cardRegistry = JSON.parse(read("src/lib/check-foundation/card-registry-data.json"));

const projectBlock = blockRegistry.blocks.find((block) => block.key === "project");
assert(projectBlock, "Project Block must be declared in the Block registry.");
assert.deepEqual(projectBlock.cardTypes, ["projectcard"], "Project Block must only own projectcard.");
assert.deepEqual(projectBlock.requiredModules, ["project"], "Project Block must only require the project Module.");

const projectModule = blockRegistry.modules.find((module) => module.key === "project");
assert(projectModule, "Project Module must be declared in the Module registry.");
assert.deepEqual(projectModule.cardTypes, ["projectcard"], "Project Module must only own projectcard.");

const projectCard = cardRegistry.cards.find((card) => card.cardType === "projectcard");
assert(projectCard, "projectcard must be declared in the Card registry.");
assert.equal(projectCard.owningBlock, "project", "projectcard must belong to the Project Block.");
assert.equal(projectCard.owningModule, "project", "projectcard must belong to the Project Module.");
assert.equal(projectCard.scoring, "none", "projectcard must not inherit intelligence or Sales scoring.");
assert.equal(projectCard.evidenceRequired, false, "projectcard must not require Miniapp/source evidence.");

const unitBoardSource = read("src/app/[companyId]/unit-board/unit-project-board-client.tsx");
assert.match(unitBoardSource, /unit-board|Project/i, "Project Block must have a dedicated Unit board surface.");
assert.doesNotMatch(
  unitBoardSource,
  /opportunitycard|miniapp|classscout|compare/i,
  "Project Block board surface must not depend on Sales or Miniapp business concepts.",
);

const destinationDaemonJob = {
  id: "job-destination",
  companyId: "unit-1",
  jobType: "DESTINATION_MISSION_DAEMON",
  entityType: "DESTINATION_SERVICE",
  entityId: "destination-service",
  status: "ACTIVE",
  attemptCount: 1,
  metadata: {
    activeDestinationKeys: ["compare"],
    timeoutMs: 45000,
  },
  scheduledAt: "2026-06-02T00:00:00.000Z",
  createdAt: "2026-06-02T00:00:00.000Z",
  updatedAt: "2026-06-02T00:00:00.000Z",
};

const attribution = resolvePipelineJobAttribution(destinationDaemonJob);
assert.deepEqual(
  attribution,
  {
    unitId: "unit-1",
    blockId: "miniapp",
    moduleId: "miniapp",
    cardId: null,
    cardType: null,
    miniappId: "compare",
  },
  "Destination daemon job must carry canonical Unit/Block/Module/Miniapp attribution.",
);

const localEnvelope = buildLocalJobEnvelopeFromPipelineJob(destinationDaemonJob);
assert.equal(localEnvelope.unitId, "unit-1", "Local job envelope must expose Unit id.");
assert.equal(localEnvelope.blockId, "miniapp", "Local job envelope must expose Block id.");
assert.equal(localEnvelope.miniappId, "compare", "Local job envelope must expose inferred Miniapp id.");
assert.equal(localEnvelope.status, "retrying", "Attempted ACTIVE jobs must surface retrying state.");
assert.match(
  localEnvelope.idempotencyKey,
  /^unit-1:DESTINATION_MISSION_DAEMON:DESTINATION_SERVICE:destination-service$/,
  "Local job envelope must provide deterministic idempotency key.",
);

const blockSummaryRoute = read("src/app/api/companies/[companyId]/blocks/summary/route.ts");
assert.match(blockSummaryRoute, /resolveEffectiveUnitCapabilities/, "Block summary must consume effective capabilities.");
assert.match(blockSummaryRoute, /listBlockDefinitions/, "Block summary must render from the Block registry.");
assert.match(blockSummaryRoute, /readiness/, "Block summary must expose readiness state.");
assert.match(blockSummaryRoute, /health/, "Block summary must expose health state.");
assert.match(blockSummaryRoute, /stale: isProjectionStale/, "Block summary must expose stale projection state.");
assert.match(blockSummaryRoute, /enabledMiniapps\.includes\("compare"\)/, "Miniapp next-action route must support Compare.");
assert.doesNotMatch(
  blockSummaryRoute,
  /const preferredMiniapp = "classscout"/,
  "Block summary must not hardcode ClassScout as the only Miniapp action target.",
);

console.log("check foundation block runtime contracts passed.");
