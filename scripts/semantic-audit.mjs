import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SEARCH_ROOTS = ["src/app", "src/components", "src/lib"];

const forbiddenPatterns = [
  { label: "legacy brand color", regex: /color="brand"|c="brand"|var\(--mantine-color-brand/i },
  { label: "generic product color", regex: /color="(blue|green|orange|violet|cyan|teal|indigo)"/i },
  { label: "legacy light-dark helper", regex: /light-dark\(/i },
  { label: "brand loader", regex: /Loader[^>]+color="brand"/i },
  { label: "undefined subtle surface token", regex: /var\(--surface-subtle\)/i },
  { label: "raw mantine dark palette", regex: /var\(--mantine-color-dark-\d+\)/i },
  { label: "raw white text override", regex: /c="white"|color:\s*['"]white['"]/i },
  { label: "raw danger color", regex: /color="red"|c="red"|color:\s*['"]red['"]/i },
  { label: "hard-coded dark glass surface", regex: /rgba\(0,\s*0,\s*0,\s*0\.(2|8)\)|rgba\(20,\s*20,\s*20,\s*0\.95\)/i },
  { label: "hard-coded translucent light panel", regex: /rgba\(255,\s*255,\s*255,\s*0\.(03|05|06)\)/i },
  { label: "local transition declaration", regex: /transition:\s*['"]/i },
  { label: "mantine transition component", regex: /<Transition\b|\bTransition,\s*$/im },
];

const allowedFiles = new Set([
  "src/components/providers.tsx",
]);

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
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
    if (allowedFiles.has(rel)) continue;
    const content = readFileSync(file, "utf8");

    for (const pattern of forbiddenPatterns) {
      const match = content.match(pattern.regex);
      if (match) {
        findings.push({
          file: rel,
          label: pattern.label,
          match: match[0],
        });
      }
    }
  }
}

if (findings.length > 0) {
  console.error("Semantic audit failed. Legacy patterns remain:\n");
  for (const finding of findings) {
    console.error(`- ${finding.file}: ${finding.label} -> ${finding.match}`);
  }
  process.exit(1);
}

console.log("Semantic audit passed: no forbidden legacy product-surface patterns found.");
