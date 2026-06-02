import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const harness = readFileSync("scripts/verify-sovereign-miniapp-intelligence.mjs", "utf8");
const pkg = readFileSync("package.json", "utf8");
const docs = readFileSync("docs/miniapps/sovereign-intelligence-contract.md", "utf8");

assert(harness.includes("test:sovereign-miniapp-contract"), "harness must run contract test");
assert(harness.includes("test:miniapp-research-planner"), "harness must run planner test");
assert(harness.includes("test:miniapp-evidence-runtime"), "harness must run evidence runtime test");
assert(harness.includes("test:miniapp-opportunity-lifecycle"), "harness must run opportunity lifecycle test");
assert(harness.includes("test:miniapp-promotion-gates"), "harness must run promotion gate test");
assert(harness.includes("test:miniapp-burst-controller"), "harness must run burst controller test");
assert(harness.includes("test:miniapp-learning-memory"), "harness must run learning memory test");
assert(harness.includes("test:miniapp-ops-console"), "harness must run ops console test");
assert(harness.includes("tsc") && harness.includes("--noEmit"), "harness must run TypeScript verification");
assert(harness.includes("sourceCardInventoryIsSuccess: false"), "harness must enforce no source-card success");
assert(harness.includes("verified_public_visible_cards"), "harness must enforce public-card success");
assert(pkg.includes("verify:sovereign-miniapp-intelligence"), "package script must expose proof harness");
assert(docs.includes("Proof Harness"), "docs must document proof harness");

console.log("sovereign miniapp proof harness contract OK");
