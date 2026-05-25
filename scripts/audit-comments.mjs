import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SEARCH_ROOTS = ["src", "scripts", "prisma"];
const FILE_RE = /\.(ts|tsx|js|jsx|mjs|prisma)$/;

const forbiddenPatterns = [
  { label: "stale NBA terminology in comments", regex: /(^\s*\/\/.*\bNBA(?:Items?)?\b)|(^\s*\/\*\*?[\s\S]*?\bNBA(?:Items?)?\b[\s\S]*?\*\/)|(^\s*\* .*?\bNBA(?:Items?)?\b)/m },
  { label: "legacy sync comment", regex: /\bLegacy Sync\b/ },
  { label: "decorative comment banner", regex: /^\s*\/\/\s*-{3,}/m },
  { label: "numbered section comment", regex: /^\s*\/\/\s*\d+(?:\.\d+)?\.\s+/m },
];

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (FILE_RE.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

const findings = [];

for (const root of SEARCH_ROOTS) {
  const fullRoot = join(ROOT, root);
  let files = [];
  try {
    files = walk(fullRoot);
  } catch {
    continue;
  }

  for (const file of files) {
    const rel = relative(ROOT, file);
    const content = readFileSync(file, "utf8");
    for (const pattern of forbiddenPatterns) {
      const match = content.match(pattern.regex);
      if (match) {
        findings.push({
          file: rel,
          label: pattern.label,
          match: match[0].trim().split("\n")[0],
        });
      }
    }
  }
}

if (findings.length > 0) {
  console.error("Comment audit failed. Inconsistent comment patterns remain:\n");
  for (const finding of findings) {
    console.error(`- ${finding.file}: ${finding.label} -> ${finding.match}`);
  }
  process.exit(1);
}

console.log("Comment audit passed: no stale or decorative comment patterns found.");
