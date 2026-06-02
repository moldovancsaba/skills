import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const failures = [];

const cardRegistry = JSON.parse(readFileSync(join(ROOT, "src/lib/check-foundation/card-registry-data.json"), "utf8"));
const requiredCardTypes = cardRegistry.cards.map((card) => card.cardType);

const docsThatMustListEveryCardType = [
  "docs/CANONICAL_TERMINOLOGY.md",
  "docs/CHECK_FOUNDATION_LLD.md",
];

const forbiddenDocPatterns = [
  {
    pattern: /\b[Mm]iniapp\s+[Pp]ackets?\b|\bminiapp[_\s.]packet\b/,
    message: "Miniapp docs must use miniappcard/card terminology.",
  },
  {
    pattern: /\b[Rr]eview\s+[Pp]ackets?\b|\breview-packet\b/,
    message: "Review docs must use review-card terminology.",
  },
  {
    pattern: /\b[Pp]ackets?\s+can\s+be\s+reviewed\b/,
    message: "Miniapp production checks must say miniappcards can be reviewed.",
  },
  {
    pattern: /\bpacket[-\s]state\b|\bpacket\s+destination\b|\bpacket\s+list\b|\bpacket\s+detail\b|\bpacket\s+pressure\b|\brevision\s+packets?\b/,
    message: "Active docs must describe review-card state, destination, list/detail, pressure, and revisions.",
  },
  {
    pattern: /\breviewPackets\b|\blearning\.packets\b/,
    message: "Projection docs must expose reviewCards and learning.cards naming.",
  },
  {
    pattern: /\/api\/destination-review\/packets|\/review\/\[packetId\]|\/review\/:packetId/,
    message: "Public route docs must use card routes.",
  },
];

function listActiveDocFiles() {
  const output = execSync(`rg --files README.md docs`, { cwd: ROOT, encoding: "utf8" });
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => !file.startsWith("docs/archive/"));
}

function isAllowedLegacyStorageAlias(file, text, match) {
  return (
    file === "docs/CANONICAL_TERMINOLOGY.md" &&
    match.includes("Packet") &&
    text.includes("DestinationReviewPacket") &&
    text.includes("packetState") &&
    text.includes("packetFingerprint")
  );
}

for (const file of docsThatMustListEveryCardType) {
  const text = readFileSync(join(ROOT, file), "utf8");
  for (const cardType of requiredCardTypes) {
    if (!text.includes(`\`${cardType}\``)) {
      failures.push(`${file}: missing required card type \`${cardType}\``);
    }
  }
}

for (const file of listActiveDocFiles()) {
  const text = readFileSync(join(ROOT, file), "utf8");
  for (const rule of forbiddenDocPatterns) {
    const match = text.match(rule.pattern);
    if (match && !isAllowedLegacyStorageAlias(file, text, match[0])) {
      failures.push(`${file}: forbidden "${match[0]}" - ${rule.message}`);
    }
  }
}

if (failures.length > 0) {
  console.error("check foundation docs contract failed:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("check foundation docs contract passed.");
