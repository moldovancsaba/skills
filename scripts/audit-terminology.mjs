import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

const ROOT = process.cwd();

const args = new Set(process.argv.slice(2));
const json = args.has("--json");
const help = args.has("--help") || args.has("-h");

const pathArgs = process.argv
  .slice(2)
  .filter((arg) => arg.startsWith("--path="))
  .map((arg) => arg.slice("--path=".length))
  .filter(Boolean);

if (help) {
  console.log(`Usage:
  npm run audit:terminology
  npm run audit:terminology -- --json
  npm run audit:terminology -- --path=docs --path=src

Purpose:
  Enforce canonical check product language.

Inline allow:
  Add "terminology-audit: allow" on a line that intentionally contains legacy language.`);
  process.exit(0);
}

const defaultTargets = [
  "README.md",
  "AGENT.md",
  "HANDOVER.md",
  "SOUL.md",
  "DESIGN_SYSTEM.md",
  "DESIGN_SYSTEM_AGENT_HANDOFF.md",
  "docs",
  "src",
  "app",
  "components",
  "lib",
];

const targetPaths = pathArgs.length > 0 ? pathArgs : defaultTargets;

const allowedExtensions = new Set([
  ".md",
  ".mdx",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".css",
  ".scss",
]);

const ignoredDirectories = new Set([
  ".git",
  ".next",
  "node_modules",
  "coverage",
  "dist",
  "build",
  "logs",
  ".turbo",
]);

const ignoredFiles = new Set([
  "scripts/audit-terminology.mjs",
  "docs/TERMINOLOGY_AUDIT.md",
]);

const rules = [
  {
    id: "platform-name-checklist",
    severity: "error",
    pattern: /\bChecklist\s+(OS|platform|system|product|application|app|webapp|web app)\b/gi,
    preferred: "Use `check` for the full platform. Use `Checklist Block` only for the optional Block.",
    reason: "`Checklist` is not the full platform name anymore.",
  },
  {
    id: "platform-name-braced-checklist",
    severity: "error",
    pattern: /\{checklist\}/gi,
    preferred: "Use `check`.",
    reason: "`{checklist}` was historical shorthand and now causes product confusion.",
  },
  {
    id: "main-logged-in-app",
    severity: "error",
    pattern: /\b(main\s+logged[- ]in\s+app|logged[- ]in\s+app|main\s+app)\b/gi,
    preferred: "Use `Webapp` for the B2B UI.",
    reason: "There is no main logged-in product app concept in the canonical model.",
  },
  {
    id: "public-destination-app",
    severity: "error",
    pattern: /\b(public\s+destination\s+apps?|destination\s+apps?)\b/gi,
    preferred: "Use `Miniapp` for public-facing apps powered by a Unit.",
    reason: "`destination app` language is deprecated.",
  },
  {
    id: "miniapp-as-webapp-screen",
    severity: "error",
    pattern: /\b(Miniapp|Miniapps)\s+(screen|screens|page|pages|route|routes)\b/gi,
    preferred: "Use `Miniapp Ops workspace` for Webapp operation surfaces, or `Miniapp` for the public app.",
    reason: "Miniapps are public services, not Webapp screens.",
  },
  {
    id: "profile-as-product-model",
    severity: "warning",
    pattern: /\b(profile-driven|profile-first|profile based|profile-based)\b/gi,
    preferred: "Use Block-first, Unit capabilities, or legacy profile adapter when referring to compatibility code.",
    reason: "Profiles are legacy implementation language, not the product model.",
  },
  {
    id: "dashboard-as-webapp",
    severity: "warning",
    pattern: /\bmain\s+dashboard\b/gi,
    preferred: "Use `Webapp` or name the exact Block workspace.",
    reason: "`dashboard` should not become a replacement product name for Webapp.",
  },
  {
    id: "company-as-unit-product-language",
    severity: "warning",
    pattern: /\bcompany\s+(workspace|dashboard|profile|app|application|portal)\b/gi,
    preferred: "Use `Unit` for the product concept. Keep `companyId` only as a temporary implementation alias.",
    reason: "`Company` is legacy implementation language when used as the product model.",
  },
];

function toPosixPath(path) {
  return path.split(sep).join("/");
}

function shouldIgnorePath(relativePath) {
  const normalized = toPosixPath(relativePath);
  if (ignoredFiles.has(normalized)) return true;
  return normalized.split("/").some((part) => ignoredDirectories.has(part));
}

function collectFiles(target) {
  const absoluteTarget = join(ROOT, target);
  if (!existsSync(absoluteTarget)) return [];

  const stats = statSync(absoluteTarget);
  if (stats.isFile()) {
    const relativePath = toPosixPath(relative(ROOT, absoluteTarget));
    return shouldScanFile(relativePath) ? [absoluteTarget] : [];
  }

  if (!stats.isDirectory()) return [];

  const files = [];
  const entries = readdirSync(absoluteTarget, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = join(absoluteTarget, entry.name);
    const relativePath = toPosixPath(relative(ROOT, absolutePath));
    if (shouldIgnorePath(relativePath)) continue;

    if (entry.isDirectory()) {
      files.push(...collectFiles(relativePath));
      continue;
    }

    if (entry.isFile() && shouldScanFile(relativePath)) {
      files.push(absolutePath);
    }
  }

  return files;
}

function shouldScanFile(relativePath) {
  if (shouldIgnorePath(relativePath)) return false;
  return allowedExtensions.has(extname(relativePath));
}

function scanLine({ line, lineNumber, relativePath, rule }) {
  if (line.includes("terminology-audit: allow")) return [];

  const findings = [];
  const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
  let match;

  while ((match = pattern.exec(line)) !== null) {
    findings.push({
      ruleId: rule.id,
      severity: rule.severity,
      path: relativePath,
      line: lineNumber,
      column: match.index + 1,
      match: match[0],
      preferred: rule.preferred,
      reason: rule.reason,
    });
  }

  return findings;
}

const files = [...new Set(targetPaths.flatMap(collectFiles))].sort();
const findings = [];

for (const absolutePath of files) {
  const relativePath = toPosixPath(relative(ROOT, absolutePath));
  const content = readFileSync(absolutePath, "utf8");
  const lines = content.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    for (const rule of rules) {
      findings.push(...scanLine({
        line,
        lineNumber: index + 1,
        relativePath,
        rule,
      }));
    }
  }
}

const errorCount = findings.filter((finding) => finding.severity === "error").length;
const warningCount = findings.filter((finding) => finding.severity === "warning").length;

if (json) {
  console.log(JSON.stringify({
    ok: errorCount === 0,
    scannedFiles: files.length,
    errorCount,
    warningCount,
    findings,
  }, null, 2));
} else if (findings.length > 0) {
  console.error("Terminology audit found product-language drift:\n");
  for (const finding of findings) {
    console.error(
      `- [${finding.severity}] ${finding.path}:${finding.line}:${finding.column} ${finding.ruleId}: "${finding.match}"`,
    );
    console.error(`  ${finding.preferred}`);
    console.error(`  Reason: ${finding.reason}\n`);
  }
  console.error(`Scanned files: ${files.length}`);
  console.error(`Errors: ${errorCount}`);
  console.error(`Warnings: ${warningCount}`);
} else {
  console.log(`Terminology audit passed: scanned ${files.length} files with no findings.`);
}

if (errorCount > 0) {
  process.exit(1);
}
