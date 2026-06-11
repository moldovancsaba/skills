#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const manifest = JSON.parse(readFileSync(join(root, "gds-adoption.json"), "utf8"));

const targetExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const scanRoots = ["src"];
const nativeDialogPattern = /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/;
const localTransitionPattern = /^\s*transition\s*:/;
const directUiPeerPattern =
  /from\s+["'](?:@mantine\/core|@mantine\/hooks|@mantine\/notifications|@tabler\/icons-react|recharts|@dnd-kit\/core|@dnd-kit\/sortable|@dnd-kit\/utilities|@hello-pangea\/dnd)["']/;

function fail(message, findings = []) {
  console.error(`GDS strict enforcement failed: ${message}`);
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.message}`);
    if (finding.text) console.error(`  ${finding.text}`);
  }
  process.exit(1);
}

function assertNonEmpty(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    fail(`${label} must be a non-empty string.`);
  }
}

function assertDate(value, label) {
  assertNonEmpty(value, label);
  if (Number.isNaN(new Date(value).getTime())) {
    fail(`${label} must be a valid date.`);
  }
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

    if (entry.isFile() && targetExtensions.has(fullPath.slice(fullPath.lastIndexOf(".")))) {
      files.push(fullPath);
    }
  }

  return files;
}

if (manifest.mode !== "strict" || manifest.strictMode !== true) {
  fail("gds-adoption.json must run in strict mode for issue 458.");
}

if (!manifest.requiredScripts?.includes("test:gds-strict-enforcement")) {
  fail("gds-adoption.json requiredScripts must include test:gds-strict-enforcement.");
}

const strictExceptions = manifest.strictExceptions || [];
const strictExceptionPaths = new Set();

for (const [index, exception] of strictExceptions.entries()) {
  const prefix = `strictExceptions[${index}]`;
  assertNonEmpty(exception.path, `${prefix}.path`);
  assertNonEmpty(exception.owner, `${prefix}.owner`);
  assertNonEmpty(exception.reason, `${prefix}.reason`);
  assertNonEmpty(exception.replacementPath, `${prefix}.replacementPath`);
  assertNonEmpty(exception.expiryBehavior, `${prefix}.expiryBehavior`);
  assertDate(exception.reviewBy, `${prefix}.reviewBy`);

  if (!existsSync(join(root, exception.path))) {
    fail(`${prefix}.path does not exist: ${exception.path}`);
  }

  if (strictExceptionPaths.has(exception.path)) {
    fail(`duplicate strict exception path: ${exception.path}`);
  }
  strictExceptionPaths.add(exception.path);
}

for (const [index, exception] of (manifest.exceptionSurfaces || []).entries()) {
  assertNonEmpty(exception.expiryBehavior, `exceptionSurfaces[${index}].expiryBehavior`);
}

const findings = [];
const nativeDialogFiles = new Set();

for (const scanRoot of scanRoots) {
  const scanPath = join(root, scanRoot);
  if (!statSync(scanPath, { throwIfNoEntry: false })?.isDirectory()) continue;

  for (const file of walk(scanPath)) {
    const rel = relative(root, file);
    const source = readFileSync(file, "utf8");
    const lines = source.split(/\r?\n/);

    for (const [index, line] of lines.entries()) {
      if (nativeDialogPattern.test(line)) {
        nativeDialogFiles.add(rel);
        if (rel !== "src/lib/gds-operation-feedback.tsx" && !strictExceptionPaths.has(rel)) {
          findings.push({
            file: rel,
            line: index + 1,
            message: "native browser dialog outside GDS adapter or strict exception",
            text: line.trim(),
          });
        }
      }

      if (localTransitionPattern.test(line) && rel !== "src/components/providers.tsx" && rel !== "src/components/board/shared-board.tsx") {
        findings.push({
          file: rel,
          line: index + 1,
          message: "local transition style outside approved GDS/motion boundary",
          text: line.trim(),
        });
      }

      if (directUiPeerPattern.test(line) && !rel.startsWith("src/components/gds/")) {
        findings.push({
          file: rel,
          line: index + 1,
          message: "direct UI peer import outside src/components/gds boundary",
          text: line.trim(),
        });
      }
    }
  }
}

for (const exceptionPath of strictExceptionPaths) {
  if (!nativeDialogFiles.has(exceptionPath)) {
    findings.push({
      file: exceptionPath,
      line: 1,
      message: "strict native-dialog exception no longer matches code; remove or replace the exception",
      text: "",
    });
  }
}

if (findings.length > 0) {
  fail("strict scan found untracked drift.", findings);
}

console.log(
  [
    "GDS strict enforcement OK.",
    `mode=${manifest.mode}`,
    `adapters=${manifest.approvedAdapters?.length || 0}`,
    `exceptions=${manifest.exceptionSurfaces?.length || 0}`,
    `strictExceptions=${strictExceptions.length}`,
    `trackedNativeDialogFiles=${nativeDialogFiles.size - 1}`,
  ].join(" "),
);
