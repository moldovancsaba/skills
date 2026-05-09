import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

const requiredFiles = [
  "README.md",
  "HANDOVER.md",
  "DESIGN_SYSTEM.md",
  "DESIGN_SYSTEM_AGENT_HANDOFF.md",
  "docs/RULEBOOK.md",
  "docs/SSOT.md",
  "docs/SYSTEM_DESIGN_LLD.md",
  "docs/SEMANTIC_DESIGN_SYSTEM_CONTRACT.md",
  "documents/05_technology/2026-04-01_engineering-standards-architecture_cto_v1.md",
];

const requiredPhrases = [
  {
    file: "README.md",
    phrases: ["docs/RULEBOOK.md", "UnifiedCard", "audit:semantic"],
  },
  {
    file: "HANDOVER.md",
    phrases: ["docs/RULEBOOK.md", "UnifiedCard", "AI brain"],
  },
  {
    file: "DESIGN_SYSTEM.md",
    phrases: ["Mantine `Card`", "UnifiedCard", "Typography is centrally defined only"],
  },
  {
    file: "docs/RULEBOOK.md",
    phrases: ["Documentation Precedence", "AI Brain Update Rules", "UnifiedCard"],
  },
  {
    file: "docs/SSOT.md",
    phrases: ["Mantine only", "UnifiedCard", "AI brain"],
  },
];

const failures = [];

for (const relativePath of requiredFiles) {
  if (!existsSync(join(ROOT, relativePath))) {
    failures.push(`missing required documentation file: ${relativePath}`);
  }
}

for (const { file, phrases } of requiredPhrases) {
  const absolutePath = join(ROOT, file);
  if (!existsSync(absolutePath)) {
    continue;
  }

  const content = readFileSync(absolutePath, "utf8");

  for (const phrase of phrases) {
    if (!content.includes(phrase)) {
      failures.push(`${file} missing required phrase: ${phrase}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Documentation audit failed:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Documentation audit passed: required docs and governing phrases are present.");
