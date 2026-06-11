#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function fail(message) {
  console.error(`Unit board projection contract failed: ${message}`);
  process.exit(1);
}

const projection = read("src/lib/unit-board-projection.ts");
const surfaceRoute = read("src/app/api/companies/[companyId]/surfaces/[surfaceKey]/route.ts");
const actionRoute = read("src/app/api/companies/[companyId]/surfaces/[surfaceKey]/actions/route.ts");
const client = read("src/app/[companyId]/unit-board/unit-project-board-client.tsx");

for (const required of [
  "UnitBoardProjectionItem",
  "accessibleLabel",
  "allowedActions",
  "buildUnitBoardProjectReadModel",
  "PROJECT_BOARD_COLUMNS.map",
  "itemIds",
  "checksumSurfacePayload",
  "refreshProjection",
]) {
  if (!projection.includes(required)) {
    fail(`src/lib/unit-board-projection.ts missing required contract phrase: ${required}`);
  }
}

for (const action of ["create", "update", "move", "archive", "restore", "refreshProjection"]) {
  if (!projection.includes(`"${action}"`)) {
    fail(`projection action contract missing ${action}.`);
  }
}

for (const state of ["loading", "empty", "stale", "blocked", "error", "success"]) {
  if (!projection.includes(`${state}:`)) {
    fail(`projection state metadata missing ${state}.`);
  }
}

if (!surfaceRoute.includes("buildUnitBoardProjectReadModel") || !surfaceRoute.includes("UNIT_BOARD_PROJECT_SURFACE_KEY")) {
  fail("surface read route must serve the unitBoard.project projection builder.");
}

for (const required of [
  "handleUnitBoardProjectAction",
  "buildUnitBoardProjectReadModel(prisma, companyId)",
  "projectionRevision",
  "previousRevision",
  "changedItemIds",
  "nextProjection",
  "markCompanySurfaceProjectionDirty",
]) {
  if (!actionRoute.includes(required)) {
    fail(`surface action route missing required unit board action phrase: ${required}`);
  }
}

for (const action of ["create", "update", "move", "archive", "restore", "refreshProjection"]) {
  if (!actionRoute.includes(`"${action}"`)) {
    fail(`surface action route missing unitBoard.project action mapping for ${action}.`);
  }
}

if (!client.includes("UNIT_BOARD_SURFACE_KEY = \"unitBoard.project\"")) {
  fail("unit board client must name the unitBoard.project surface key.");
}

if (!client.includes("/surfaces/") || !client.includes("/actions")) {
  fail("unit board client must use surface read and action endpoints.");
}

if (client.includes("/api/board-items")) {
  fail("unit board client must not call the legacy /api/board-items endpoint.");
}

if (!client.includes("projectionRevision") || !client.includes("nextProjection")) {
  fail("unit board client must consume projection revisions and returned action projections.");
}

if (!projection.includes('UNIT_BOARD_PROJECT_SURFACE_KEY = "unitBoard.project"')) {
  fail("unexpected or missing unitBoard.project surface key constant.");
}

if (!projection.includes("UNIT_BOARD_PROJECT_CONTRACT_VERSION = 1")) {
  fail("unexpected or missing contract version constant.");
}

console.log("Unit board projection contract OK. surface=unitBoard.project contractVersion=1");
