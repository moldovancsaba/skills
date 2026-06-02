#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const scanRoots = ["src"];

const rules = [
  {
    name: "No raw operational translucent backgrounds",
    pattern: /background:\s*["'`]rgba\(255,255,255,0\.02\)["'`]/,
  },
  {
    name: "No inline 12px border radius",
    pattern: /borderRadius:\s*["'`]12px["'`]/,
  },
  {
    name: "No raw Recharts grid stroke color",
    pattern: /stroke=["'`]rgba\(255,255,255,0\.08\)["'`]/,
  },
  {
    name: "No raw Recharts bar radius array",
    pattern: /radius=\{\[\d+,\s*\d+,\s*\d+,\s*\d+\]\}/,
  },
  {
    name: "No negative component letter spacing",
    pattern: /letterSpacing:\s*["'`]-/,
  },
  {
    name: "No arbitrary HSL utility classes",
    pattern: /\b(?:text|bg|border)-\[hsl\(/,
  },
  {
    name: "No raw hex colors outside token or brand sources",
    pattern: /(?<!&)#[0-9a-fA-F]{3,8}\b/,
    allowFiles: [
      "src/app/globals.css",
      "src/components/providers.tsx",
      "src/app/auth/page.tsx",
      "src/app/login/page.tsx",
    ],
  },
  {
    name: "No raw rgb/rgba color functions outside semantic token sources",
    pattern: /\brgba?\(/,
    allowFiles: [
      "src/app/globals.css",
      "src/lib/semantic-theme.ts",
    ],
  },
];

const targetExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);

function listFiles(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") {
        continue;
      }
      files.push(...listFiles(fullPath));
      continue;
    }

    if (entry.isFile() && targetExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

const failures = [];

for (const scanRoot of scanRoots) {
  const absoluteRoot = path.join(root, scanRoot);
  for (const filePath of listFiles(absoluteRoot)) {
    const source = fs.readFileSync(filePath, "utf8");
    const lines = source.split(/\r?\n/);

    for (const [index, line] of lines.entries()) {
      for (const rule of rules) {
        const relativeFile = path.relative(root, filePath);
        if (rule.allowFiles?.includes(relativeFile)) {
          continue;
        }

        if (rule.pattern.test(line)) {
          failures.push({
            rule: rule.name,
            file: relativeFile,
            line: index + 1,
            text: line.trim(),
          });
        }
      }
    }
  }
}

if (failures.length) {
  console.error("GDS style contract violations found:");
  for (const failure of failures) {
    console.error(`- ${failure.rule}: ${failure.file}:${failure.line}`);
    console.error(`  ${failure.text}`);
  }
  process.exit(1);
}

console.log("GDS style contract passed.");
