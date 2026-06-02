import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const run = spawnSync("node", ["scripts/audit-webapp-boundary.mjs"], {
  cwd: process.cwd(),
  encoding: "utf8",
});
if (run.status !== 0) throw new Error("webapp boundary audit command failed");
const report = JSON.parse(readFileSync("logs/webapp-boundary-audit.json", "utf8"));
const hardcoded = report.findings.filter((finding) => finding.category === "HARDCODED_UNGATED_UI_SURFACE");
assert.equal(hardcoded.length, 0, "hardcoded ungated UI surfaces must stay at zero");

console.log("no hardcoded UI surfaces guard OK");
