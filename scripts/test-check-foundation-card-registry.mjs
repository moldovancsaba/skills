import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const registry = JSON.parse(
  readFileSync(join(ROOT, "src/lib/check-foundation/card-registry-data.json"), "utf8"),
);

const expectedCardTypes = [
  "datacard",
  "topiccard",
  "goalcard",
  "reviewcard",
  "flashcard",
  "taskcard",
  "opportunitycard",
  "projectcard",
  "logiccard",
  "miniappcard",
];

const expectedModules = [
  "data",
  "topics",
  "goals",
  "review",
  "knowmore",
  "tactical",
  "analytics",
  "aiQueue",
  "checklist",
  "sales",
  "project",
  "miniapp",
];

const expectedBlocks = ["checklist", "sales", "project", "miniapp"];
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function unique(values) {
  return [...new Set(values)];
}

assert(registry.schemaVersion === 1, "card registry schemaVersion must be 1");
assert(Array.isArray(registry.cards), "card registry cards must be an array");

const cardTypes = registry.cards.map((item) => item.cardType);
assert(cardTypes.length === unique(cardTypes).length, "cardType values must be unique");

for (const requiredType of expectedCardTypes) {
  assert(cardTypes.includes(requiredType), `missing card definition: ${requiredType}`);
}

for (const card of registry.cards) {
  assert(card.displayName?.trim(), `Card ${card.cardType} missing displayName`);
  assert(card.accessibleDescription?.trim(), `Card ${card.cardType} missing accessibleDescription`);
  assert(Array.isArray(card.lifecycleStates) && card.lifecycleStates.length > 0, `Card ${card.cardType} missing lifecycleStates`);
  assert(Array.isArray(card.allowedBoards) && card.allowedBoards.length > 0, `Card ${card.cardType} missing allowedBoards`);
  assert(typeof card.evidenceRequired === "boolean", `Card ${card.cardType} evidenceRequired must be boolean`);
  assert(typeof card.lineageRequired === "boolean", `Card ${card.cardType} lineageRequired must be boolean`);
  assert(
    ["none", "ice", "priorityProfile", "custom"].includes(card.scoring),
    `Card ${card.cardType} has invalid scoring mode`,
  );
  assert(expectedModules.includes(card.owningModule), `Card ${card.cardType} has unknown owningModule`);
  if (card.owningBlock !== undefined) {
    assert(expectedBlocks.includes(card.owningBlock), `Card ${card.cardType} has unknown owningBlock`);
  }
}

const projectCard = registry.cards.find((card) => card.cardType === "projectcard");
assert(projectCard?.owningBlock === "project", "projectcard must belong to project Block");
assert(projectCard?.owningModule === "project", "projectcard must belong to project Module");

const opportunityCard = registry.cards.find((card) => card.cardType === "opportunitycard");
assert(opportunityCard?.owningBlock === "sales", "opportunitycard must belong to sales Block");

if (failures.length > 0) {
  console.error("check foundation card registry contract failed:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("check foundation card registry contract passed.");
