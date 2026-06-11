#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const scanRoots = ["src"];
const allowedExternalImportFiles = new Set([
  "src/components/gds/charts.ts",
  "src/components/gds/drag-core.ts",
  "src/components/gds/drag-legacy.ts",
  "src/components/gds/drag-sortable.ts",
  "src/components/gds/drag-utilities.ts",
  "src/components/gds/hooks.ts",
  "src/components/gds/icons.ts",
  "src/components/gds/notifications.ts",
  "src/components/gds/primitives.ts",
]);

const forbiddenImportPatterns = [
  /from\s+["']@mantine\/core["']/,
  /from\s+["']@mantine\/hooks["']/,
  /from\s+["']@mantine\/notifications["']/,
  /from\s+["']@tabler\/icons-react["']/,
  /from\s+["']recharts["']/,
  /from\s+["']@dnd-kit\/core["']/,
  /from\s+["']@dnd-kit\/sortable["']/,
  /from\s+["']@dnd-kit\/utilities["']/,
  /from\s+["']@hello-pangea\/dnd["']/,
];

const malformedImportPatterns = [
  /@mantine@\/components\/gds/,
  /@tabler@\/components\/gds/,
  /@dnd-kit@\/components\/gds/,
  /@dnd@\/components\/gds/,
  /@hello@\/components\/gds/,
  /recharts@\/components\/gds/,
];

const primitiveImportPolicy = {
  Card: new Set(["src/components/ui/unified-card.tsx"]),
  Paper: new Set([]),
  Text: new Set(["src/components/ui/typography.tsx"]),
  Title: new Set(["src/components/ui/typography.tsx"]),
};

function parseNamedImports(source, moduleSpecifier) {
  const imports = [];
  const importPattern = /import\s*\{([\s\S]*?)\}\s*from\s*["']([^"']+)["']/g;
  let match;

  while ((match = importPattern.exec(source)) !== null) {
    if (match[2] !== moduleSpecifier) continue;
    for (const part of match[1].split(",")) {
      const name = part
        .replace(/\/\/.*$/g, "")
        .trim()
        .split(/\s+as\s+/)[0]
        .trim();
      if (name) imports.push(name);
    }
  }

  return imports;
}

function walk(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      files.push(...walk(fullPath));
      continue;
    }

    if (entry.isFile() && /\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

const findings = [];

for (const scanRoot of scanRoots) {
  const scanPath = join(root, scanRoot);
  if (!statSync(scanPath, { throwIfNoEntry: false })?.isDirectory()) continue;

  for (const file of walk(scanPath)) {
    const rel = relative(root, file);
    const source = readFileSync(file, "utf8");
    const lines = source.split(/\r?\n/);

    for (const [index, line] of lines.entries()) {
      for (const pattern of malformedImportPatterns) {
        if (pattern.test(line)) {
          findings.push({ file: rel, line: index + 1, label: "malformed GDS boundary import", text: line.trim() });
        }
      }

      if (allowedExternalImportFiles.has(rel)) continue;

      for (const pattern of forbiddenImportPatterns) {
        if (pattern.test(line)) {
          findings.push({ file: rel, line: index + 1, label: "direct UI peer import outside GDS boundary", text: line.trim() });
        }
      }
    }

    const primitiveImports = parseNamedImports(source, "@/components/gds/primitives");
    for (const primitive of primitiveImports) {
      const allowedFiles = primitiveImportPolicy[primitive];
      if (allowedFiles && !allowedFiles.has(rel)) {
        findings.push({
          file: rel,
          line: 1,
          label: `raw ${primitive} primitive import outside approved GDS adapter`,
          text: `import { ${primitive} } from "@/components/gds/primitives"`,
        });
      }
    }
  }
}

if (findings.length > 0) {
  console.error("GDS boundary audit failed:");
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.label}`);
    console.error(`  ${finding.text}`);
  }
  process.exit(1);
}

console.log("GDS boundary audit passed.");
