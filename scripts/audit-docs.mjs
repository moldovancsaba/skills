import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();

const requiredFiles = [
  "README.md",
  "HANDOVER.md",
  "DESIGN_SYSTEM.md",
  "DESIGN_SYSTEM_AGENT_HANDOFF.md",
  "docs/RULEBOOK.md",
  "docs/SSOT.md",
  "docs/SYSTEM_DESIGN_LLD.md",
  "docs/CANONICAL_TERMINOLOGY.md",
  "docs/CHECK_FOUNDATION_LLD.md",
  "docs/ONBOARDING.md",
  "docs/SEMANTIC_DESIGN_SYSTEM_CONTRACT.md",
  "documents/00_company/2026-04-01_company-identity_ceo_v1.md",
  "documents/00_company/2026-04-01_document-architecture_ceo_v1.md",
  "documents/02_product/2026-04-01_product-vision-roadmap_cpo_v1.md",
  "documents/05_technology/2026-04-01_engineering-standards-architecture_cto_v1.md",
];

const requiredPhrases = [
  {
    file: "README.md",
    phrases: ["docs/RULEBOOK.md", "UnifiedCard", "audit:semantic", "general-design-system", "consumed GDS version"],
  },
  {
    file: "HANDOVER.md",
    phrases: ["docs/RULEBOOK.md", "UnifiedCard", "AI brain", "general-design-system", "consumed GDS version"],
  },
  {
    file: "DESIGN_SYSTEM.md",
    phrases: ["Mantine `Card`", "UnifiedCard", "Typography is centrally defined only", "general-design-system", "Local Adapter Inventory"],
  },
  {
    file: "docs/RULEBOOK.md",
    phrases: ["Documentation Precedence", "AI Brain Update Rules", "UnifiedCard"],
  },
  {
    file: "docs/SSOT.md",
    phrases: ["Mantine only", "UnifiedCard", "general-design-system"],
  },
  {
    file: "docs/CANONICAL_TERMINOLOGY.md",
    phrases: ["miniappcard", "DestinationReviewPacket", "product language, docs, routes, and UI must say review card"],
  },
  {
    file: "docs/CHECK_FOUNDATION_LLD.md",
    phrases: ["miniappcard", "miniappcards can be reviewed"],
  },
  {
    file: "documents/00_company/2026-04-01_company-identity_ceo_v1.md",
    phrases: ["Unit-based intelligence platform", "structured cards", "public Miniapp content"],
  },
  {
    file: "documents/02_product/2026-04-01_product-vision-roadmap_cpo_v1.md",
    phrases: ["governed cards", "Block-enabled intelligence platform", "Cards, Blocks, and Miniapps"],
  },
];

const failures = [];

const forbiddenPatterns = [
  {
    pattern: /\/Users\/chappie|\/Users\/moldovancsaba|codex\/worktrees/,
    message: "documentation must not reference stale user-specific Codex/worktree paths",
  },
  {
    pattern: /\{checklist\}/,
    message: "active documentation must not contain unresolved {checklist} placeholders",
  },
  {
    pattern: /simple,\s+actionable\s+checklist\s+solutions|checklist\s+solutions|checklist\s+content\s+assets|First client checklist deliverable/i,
    message: "active product/company docs must not describe check as a generic checklist-solutions product",
  },
  {
    pattern: /Business process consulting and documentation services|Actionable Documentation/,
    message: "active positioning docs must use the Unit intelligence platform category",
  },
  {
    pattern: /\bmini-app\b|\bmini app\b/i,
    message: "documentation must use Miniapp as the canonical product term",
  },
];

function activeDocumentationFiles() {
  const output = execSync("rg --files README.md docs documents", { cwd: ROOT, encoding: "utf8" });
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => !file.startsWith("docs/archive/") && !file.startsWith("documents/09_archive/"));
}

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

for (const file of activeDocumentationFiles()) {
  const content = readFileSync(join(ROOT, file), "utf8");
  for (const rule of forbiddenPatterns) {
    const match = content.match(rule.pattern);
    if (match) {
      failures.push(`${file} contains forbidden documentation drift "${match[0]}": ${rule.message}`);
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
