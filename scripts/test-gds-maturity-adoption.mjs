#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getGdsMaturitySummary, getGdsRecommendedMaturityCapabilities } from "@doneisbetter/gds/server";
import {
  buildGdsMaturityAdoptionReport,
  classifyGdsCapabilityAdoption,
} from "../src/lib/gds-maturity-adoption.ts";

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function fail(message) {
  console.error(`GDS maturity adoption test failed: ${message}`);
  process.exit(1);
}

const manifest = readJson("gds-adoption.json");
const capabilities = getGdsRecommendedMaturityCapabilities();
const summary = getGdsMaturitySummary();

if (capabilities.length !== 7 || summary.total !== 7) {
  fail(`expected seven recommended maturity capabilities, got capabilities=${capabilities.length} summary=${summary.total}.`);
}

for (const capability of capabilities) {
  for (const key of [
    "id",
    "issueNumber",
    "title",
    "status",
    "priorityOrder",
    "benefit",
    "primaryContracts",
    "uxStates",
    "accessibility",
    "observability",
    "testing",
  ]) {
    if (capability[key] === undefined) {
      fail(`capability ${capability.id} missing required registry field: ${key}.`);
    }
  }

  if (!Array.isArray(capability.primaryContracts) || capability.primaryContracts.length === 0) {
    fail(`capability ${capability.id} must expose primaryContracts.`);
  }

  const status = classifyGdsCapabilityAdoption(capability);
  if (!["not-started", "planned", "in-progress", "adopted", "exception"].includes(status)) {
    fail(`capability ${capability.id} has unsupported local adoption status: ${status}.`);
  }
}

const report = buildGdsMaturityAdoptionReport(capabilities, manifest, "2026-06-07T00:00:00.000Z");

if (report.packageVersion !== manifest.packageVersion) {
  fail("report packageVersion must match gds-adoption.json.");
}

if (report.manifestVersion !== manifest.schemaVersion) {
  fail("report manifestVersion must match gds-adoption.json.");
}

if (report.scanCounts.capabilities !== capabilities.length) {
  fail("report scanCounts.capabilities must match registry capability count.");
}

if (report.scanCounts.adopted < 2) {
  fail("expected at least adoption-governance and product-system to be adopted.");
}

for (const item of report.capabilities) {
  if (item.evidence.length === 0) {
    fail(`capability ${item.capabilityId} must include local evidence.`);
  }

  if (item.gaps.length === 0) {
    fail(`capability ${item.capabilityId} must include explicit gaps or follow-up limits.`);
  }

  if (!item.nextIssueTemplate.owner || item.nextIssueTemplate.dependencies.length === 0) {
    fail(`capability ${item.capabilityId} issue template must include owner and dependencies.`);
  }

  if (item.nextIssueTemplate.gdsPrimitiveMapping.length === 0) {
    fail(`capability ${item.capabilityId} issue template must include GDS primitive mapping.`);
  }

  for (const evidence of item.evidence) {
    if (!existsSync(join(root, evidence.path))) {
      fail(`capability ${item.capabilityId} evidence path does not exist: ${evidence.path}.`);
    }
  }
}

const docs = read("docs/GDS_MATURITY_ADOPTION_REPORT.md");
for (const required of [
  "GDS Maturity Adoption Report",
  "getGdsRecommendedMaturityCapabilities()",
  "Capability Status Backlog",
  "Issue Creation Guard",
  "admin-delivery",
  "runtime-feedback",
  "foundation-surfaces",
  "global-readiness",
  "adoption-governance",
  "theme-operations",
  "product-system",
]) {
  if (!docs.includes(required)) {
    fail(`docs/GDS_MATURITY_ADOPTION_REPORT.md missing required phrase: ${required}`);
  }
}

console.log(
  [
    "GDS maturity adoption report OK.",
    `capabilities=${report.scanCounts.capabilities}`,
    `adopted=${report.scanCounts.adopted}`,
    `inProgress=${report.scanCounts.inProgress}`,
    `planned=${report.scanCounts.planned}`,
    `notStarted=${report.scanCounts.notStarted}`,
    `exceptions=${report.scanCounts.exceptions}`,
  ].join(" "),
);
