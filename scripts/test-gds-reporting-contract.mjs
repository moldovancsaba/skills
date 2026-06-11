#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function fail(message) {
  console.error(`GDS reporting contract failed: ${message}`);
  process.exit(1);
}

const reportingAdapter = read("src/components/gds/reporting.tsx");
const analytics = read("src/app/[companyId]/analytics/analytics-client.tsx");

for (const contract of ["GdsChart", "ReportingSection", "validateGdsChartData"]) {
  if (!reportingAdapter.includes(contract)) {
    fail(`reporting adapter must use ${contract}.`);
  }
}

if (!reportingAdapter.includes("renderer={GdsRechartsBarRenderer}")) {
  fail("reporting adapter must render charts through the GDS chart renderer adapter contract.");
}

if (!analytics.includes("GdsReportingSection") || !analytics.includes("GdsReportingBarChart")) {
  fail("company analytics route must use GDS reporting section and chart adapters.");
}

for (const legacy of ["<UnifiedCard tone=\"strategy\">", "<UnifiedCard tone=\"tactical\">", "<UnifiedCard tone=\"review\">", "<UnifiedCard tone=\"knowmore\">"]) {
  if (analytics.includes(legacy)) {
    fail(`company analytics chart panels must not use legacy local card chart composition: ${legacy}`);
  }
}

if (analytics.includes("@/components/gds/charts") || analytics.includes("<ResponsiveContainer") || analytics.includes("<BarChart")) {
  fail("company analytics route must not render raw chart primitives directly.");
}

console.log("GDS reporting contract OK.");
