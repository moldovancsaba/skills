#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const appShell = readFileSync(join(root, "src/components/ui/app-shell.tsx"), "utf8");

function fail(message) {
  console.error(`GDS app-shell adapter contract failed: ${message}`);
  process.exit(1);
}

for (const primitive of ["PageHeader", "MetricCard", "EmptyState", "StateBlock", "InlineAlert"]) {
  if (!appShell.includes(`${primitive} as Gds${primitive}`)) {
    fail(`app-shell adapter must import ${primitive} from @doneisbetter/gds/client.`);
  }
}

const requiredUsages = [
  "<GdsPageHeader",
  "<GdsMetricCard",
  "<GdsInlineAlert",
  "<GdsStateBlock",
  "<GdsEmptyState",
];

for (const usage of requiredUsages) {
  if (!appShell.includes(usage)) {
    fail(`app-shell adapter must render ${usage}.`);
  }
}

if (appShell.includes("<Alert")) {
  fail("Notice adapter must not render the local Mantine Alert primitive directly.");
}

console.log("GDS app-shell adapter contract OK.");
