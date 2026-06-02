import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const commands = [
  ["npm", ["run", "test:sovereign-miniapp-contract"]],
  ["npm", ["run", "test:miniapp-research-planner"]],
  ["npm", ["run", "test:miniapp-evidence-runtime"]],
  ["npm", ["run", "test:miniapp-opportunity-lifecycle"]],
  ["npm", ["run", "test:miniapp-promotion-gates"]],
  ["npm", ["run", "test:miniapp-burst-controller"]],
  ["npm", ["run", "test:miniapp-learning-memory"]],
  ["npm", ["run", "test:miniapp-ops-console"]],
  ["npx", ["tsc", "--noEmit", "--pretty", "false"]],
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const contract = readFileSync("src/lib/miniapp-intelligence-contracts.ts", "utf8");
const planner = readFileSync("src/lib/miniapp-research-planner.ts", "utf8");
const burst = readFileSync("src/lib/miniapp-burst-controller.ts", "utf8");
const opsConsole = readFileSync("src/components/visitor-ops-workspace.tsx", "utf8");
const docs = readFileSync("docs/miniapps/sovereign-intelligence-contract.md", "utf8");

assert(contract.includes("targetVisibleCards: 40") && contract.includes("targetVisibleCards: 20"), "contract must define concrete visible-card targets");
assert(contract.includes("sourceCardInventoryIsSuccess: false"), "contract must reject source-card inventory success");
assert(planner.includes("targetVisibleCards") && planner.includes("Number(input.limit) || 100"), "planner must support 100-card planning");
assert(burst.includes("targetVisibleCards") && burst.includes("verified_public_visible_cards"), "burst must target verified public cards");
assert(opsConsole.includes("SOURCE inventory is not success"), "operator console must show no source-card success invariant");
assert(docs.includes("Default target is 100 visible public cards"), "docs must state 100-card target behavior");

for (const [command, args] of commands) {
  const label = `${command} ${args.join(" ")}`;
  console.log(`[verify] ${label}`);
  const result = spawnSync(command, args, { stdio: "inherit", shell: false });
  if (result.status !== 0) {
    throw new Error(`Verification command failed: ${label}`);
  }
}

console.log("sovereign miniapp intelligence verification OK");
