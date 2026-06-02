import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const run = spawnSync("node", ["scripts/audit-webapp-boundary.mjs"], {
  cwd: process.cwd(),
  encoding: "utf8",
});

if (run.status !== 0) {
  process.stdout.write(run.stdout || "");
  process.stderr.write(run.stderr || "");
  throw new Error("webapp boundary audit command failed");
}

const report = JSON.parse(readFileSync("logs/webapp-boundary-audit.json", "utf8"));
assert.equal(report.summary.totalFindings, 0, `expected 0 webapp boundary findings, got ${report.summary.totalFindings}`);
assert.deepEqual(report.findings, [], "webapp boundary findings must be empty");

console.log("webapp boundary guard OK");
