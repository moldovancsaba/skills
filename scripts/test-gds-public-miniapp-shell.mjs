#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function fail(message) {
  console.error(`GDS public Miniapp shell contract failed: ${message}`);
  process.exit(1);
}

const adapter = read("src/components/gds/public-miniapp-shell.tsx");
const compareHome = read("src/components/compare-home.tsx");

for (const primitive of ["PublicShell", "PublicNav", "PublicBrandFooter", "PublicFlowShell"]) {
  if (!adapter.includes(primitive)) {
    fail(`Miniapp public shell adapter must use ${primitive}.`);
  }
}

if (!adapter.includes('mobileNavigationMode="sheet"')) {
  fail("Miniapp public shell adapter must opt into GDS mobile sheet navigation.");
}

if (!adapter.includes("renderLink")) {
  fail("Miniapp public shell adapter must provide a Next.js link renderer for public nav items.");
}

if (!compareHome.includes("MiniappPublicShell")) {
  fail("Compare Miniapp home must use the GDS-backed Miniapp public shell adapter.");
}

if (compareHome.includes("PageShell")) {
  fail("Compare Miniapp home must not use the local PageShell as its outer shell.");
}

for (const navId of ["overview", "visitor-ops", "project-board", "settings"]) {
  if (!compareHome.includes(`id: "${navId}"`)) {
    fail(`Compare Miniapp shell navigation must include ${navId}.`);
  }
}

console.log("GDS public Miniapp shell contract OK.");
