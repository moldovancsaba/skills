#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const manifestPath = join(root, "gds-adoption.json");
const packagePath = join(root, "package.json");
const installedPackagePath = join(root, "node_modules", "@doneisbetter", "gds", "package.json");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function fail(message) {
  console.error(`GDS adoption verification failed: ${message}`);
  process.exit(1);
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    fail(`${label} must be a non-empty string.`);
  }
}

function assertDate(value, label) {
  assertNonEmptyString(value, label);
  if (Number.isNaN(new Date(value).getTime())) {
    fail(`${label} must be a valid date string.`);
  }
}

if (!existsSync(manifestPath)) {
  fail("missing gds-adoption.json at repo root.");
}

if (!existsSync(installedPackagePath)) {
  fail("missing installed @doneisbetter/gds package. Run npm install first.");
}

const manifest = readJson(manifestPath);
const packageJson = readJson(packagePath);
const installedGds = readJson(installedPackagePath);

if (manifest.schemaVersion !== 1) {
  fail(`unsupported schemaVersion ${manifest.schemaVersion}.`);
}

if (manifest.packageName !== "@doneisbetter/gds") {
  fail(`packageName must be @doneisbetter/gds, got ${manifest.packageName}.`);
}

assertNonEmptyString(manifest.owner, "owner");
assertNonEmptyString(manifest.upstreamRepository, "upstreamRepository");
assertNonEmptyString(manifest.mode, "mode");
assertDate(manifest.lastReviewedAt, "lastReviewedAt");
assertDate(manifest.nextReviewDue, "nextReviewDue");

const declaredRange = packageJson.dependencies?.["@doneisbetter/gds"] || packageJson.devDependencies?.["@doneisbetter/gds"];
if (!declaredRange) {
  fail("package.json must declare @doneisbetter/gds.");
}

if (installedGds.version !== manifest.packageVersion) {
  fail(`installed @doneisbetter/gds ${installedGds.version} does not match manifest ${manifest.packageVersion}.`);
}

if (!String(declaredRange).includes(manifest.packageVersion)) {
  fail(`package.json range ${declaredRange} does not include manifest packageVersion ${manifest.packageVersion}.`);
}

if (!Array.isArray(manifest.approvedAdapters) || manifest.approvedAdapters.length === 0) {
  fail("approvedAdapters must contain at least one adapter.");
}

const seenPaths = new Set();
for (const [index, adapter] of manifest.approvedAdapters.entries()) {
  const prefix = `approvedAdapters[${index}]`;
  assertNonEmptyString(adapter.path, `${prefix}.path`);
  assertNonEmptyString(adapter.owner, `${prefix}.owner`);
  assertNonEmptyString(adapter.purpose, `${prefix}.purpose`);
  assertNonEmptyString(adapter.replacementPath, `${prefix}.replacementPath`);
  assertDate(adapter.reviewBy, `${prefix}.reviewBy`);
  if (seenPaths.has(adapter.path)) {
    fail(`duplicate approved adapter path: ${adapter.path}.`);
  }
  seenPaths.add(adapter.path);
  if (!existsSync(join(root, adapter.path))) {
    fail(`approved adapter path does not exist: ${adapter.path}.`);
  }
}

for (const [index, exception] of (manifest.exceptionSurfaces || []).entries()) {
  const prefix = `exceptionSurfaces[${index}]`;
  assertNonEmptyString(exception.path, `${prefix}.path`);
  assertNonEmptyString(exception.owner, `${prefix}.owner`);
  assertNonEmptyString(exception.reason, `${prefix}.reason`);
  assertNonEmptyString(exception.replacementPath, `${prefix}.replacementPath`);
  assertDate(exception.reviewBy, `${prefix}.reviewBy`);
  if (!existsSync(join(root, exception.path))) {
    fail(`exception surface path does not exist: ${exception.path}.`);
  }
}

for (const scriptName of manifest.requiredScripts || []) {
  if (!packageJson.scripts?.[scriptName]) {
    fail(`required script is missing from package.json: ${scriptName}.`);
  }
}

console.log(
  [
    "GDS adoption manifest OK.",
    `mode=${manifest.mode}`,
    `strictMode=${Boolean(manifest.strictMode)}`,
    `package=${manifest.packageName}@${manifest.packageVersion}`,
    `approvedAdapters=${manifest.approvedAdapters.length}`,
    `exceptions=${(manifest.exceptionSurfaces || []).length}`,
  ].join(" "),
);
