import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const SELF = "scripts/test-check-foundation-card-naming-contract.mjs";
const failures = [];

const scannedGlobs = ["src", "scripts", "docs", "package.json"];
const packet = "packet";
const packetTitle = "Packet";
const packetsTitle = "Packets";
const packets = "packets";
const legacyMiniappCardType = ["miniapp", packetTitle].join("");
const legacyMiniappContentAdapter = ["MiniappContent", packetTitle].join("");
const legacyMiniappPublishAdapter = ["publishMiniapp", packetTitle].join("");
const legacyPublishMethod = ["publish", packetTitle].join("");
const forbiddenPatterns = [
  {
    pattern: new RegExp(`destination-review/${packets}`),
    message: "Destination review external API must use /api/destination-review/cards.",
  },
  {
    pattern: new RegExp(`review/\\[${packet}Id\\]`),
    message: "Visitor review external API route must use [cardId].",
  },
  {
    pattern: new RegExp(`visitor/.*review/.*${packet}`),
    message: "Visitor review public paths must use card terminology.",
  },
  {
    pattern: new RegExp(`${legacyMiniappCardType}|Miniapp ${packetTitle}|miniapp ${packet}|miniapp_${packet}|miniapp\\.${packet}`),
    message: "Obsolete miniapp card naming must not return.",
  },
  {
    pattern: new RegExp(`${legacyMiniappContentAdapter}|${legacyMiniappPublishAdapter}|${legacyPublishMethod}`),
    message: "Miniapp foundation adapter must use card naming.",
  },
  {
    pattern: new RegExp(
      `Workflow ${packetsTitle}|Workflow ${packets}|Review ${packetsTitle}|Review ${packets}|Open Review ${packetsTitle}|No destination ${packets}|${packets} are waiting|destination review ${packets}|${packetTitle} ID|${packetTitle} state|All ${packet} states`,
    ),
    message: "Operator-facing review surfaces must use card terminology.",
  },
];

function listFiles() {
  const output = execSync(`rg --files ${scannedGlobs.map((item) => JSON.stringify(item)).join(" ")}`, {
    cwd: ROOT,
    encoding: "utf8",
  });
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => file !== SELF)
    .filter((file) => !file.startsWith(".next/") && !file.includes("/node_modules/"));
}

for (const file of listFiles()) {
  const text = readFileSync(join(ROOT, file), "utf8");
  for (const rule of forbiddenPatterns) {
    const match = text.match(rule.pattern);
    if (match) {
      failures.push(`${file}: forbidden "${match[0]}" - ${rule.message}`);
    }
  }
}

if (failures.length > 0) {
  console.error("check foundation card naming contract failed:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("check foundation card naming contract passed.");
