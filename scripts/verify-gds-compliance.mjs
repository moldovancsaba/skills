#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const manifest = JSON.parse(readFileSync(join(root, "gds-adoption.json"), "utf8"));

const commands = [
  ["npm", ["run", "verify:gds-adoption"]],
  ["npm", ["run", "audit:gds-boundary"]],
  ["npm", ["run", "audit:semantic"]],
  ["npm", ["run", "test:gds-runtime-provider"]],
  ["npm", ["run", "test:gds-app-shell-adapters"]],
  ["npm", ["run", "test:gds-runtime-feedback"]],
  ["npm", ["run", "test:gds-reporting-contract"]],
  ["npm", ["run", "test:gds-public-miniapp-shell"]],
  ["npm", ["run", "test:gds-maturity-adoption"]],
  ["npm", ["run", "test:gds-strict-enforcement"]],
  ["npm", ["run", "test:gds-style-contract"]],
  ["npm", ["run", "test:no-hardcoded-ui-surfaces"]],
];

function run(command, args) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  execFileSync(command, args, {
    cwd: root,
    stdio: "inherit",
  });
}

for (const [command, args] of commands) {
  run(command, args);
}

console.log(
  [
    "\nGDS compliance gate passed.",
    `mode=${manifest.mode}`,
    `strictMode=${Boolean(manifest.strictMode)}`,
    `adapters=${manifest.approvedAdapters?.length || 0}`,
    `exceptions=${manifest.exceptionSurfaces?.length || 0}`,
  ].join(" "),
);
