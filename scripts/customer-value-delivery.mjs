#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assertIncludes(file, needle, label = needle) {
  const content = read(file);
  if (!content.includes(needle)) {
    throw new Error(`${file} is missing ${label}`);
  }
}

function verify() {
  const requiredFiles = [
    "src/lib/customer-value-delivery.ts",
    "src/app/api/companies/[companyId]/customer-operations/route.ts",
    "src/app/api/customer-value/delivery/route.ts",
    "src/app/api/opportunitycards/[id]/outcome/route.ts",
    "src/app/api/opportunitycards/learning-memory/route.ts",
    "src/app/[companyId]/customer-operations/page.tsx",
    "src/app/[companyId]/customer-operations/customer-operations-client.tsx",
    "docs/CUSTOMER_VALUE_DELIVERY_LLD.md",
    "docs/CUSTOMER_VALUE_DELIVERY_API.md",
    "docs/CUSTOMER_VALUE_DELIVERY_USER_GUIDE.md",
  ];

  for (const file of requiredFiles) {
    if (!fs.existsSync(path.join(root, file))) {
      throw new Error(`Required customer-value artifact is missing: ${file}`);
    }
  }

  const contract = read("src/lib/customer-value-delivery.ts");
  const issueMatches = contract.match(/^    issueNumber: \d+/gm) || [];
  if (issueMatches.length !== 10) {
    throw new Error(`Expected 10 customer-value deliverables, found ${issueMatches.length}`);
  }

  for (const issue of [402, 405, 406, 409, 410, 403, 319, 448, 449, 38]) {
    assertIncludes("src/lib/customer-value-delivery.ts", `issueNumber: ${issue}`, `issue #${issue}`);
  }

  assertIncludes("src/lib/customer-value-delivery.ts", "CUSTOMER_VALUE_DELIVERY_VERSION");
  assertIncludes("src/lib/customer-value-delivery.ts", "recordOpportunityOutcomeAndLearning");
  assertIncludes("src/lib/customer-value-delivery.ts", "getOpportunityLearningMemory");
  assertIncludes("src/lib/customer-value-delivery.ts", "buildCustomerOperationsSummary");
  assertIncludes("src/app/[companyId]/customer-operations/customer-operations-client.tsx", "aria-label");
  assertIncludes("src/app/api/opportunitycards/[id]/outcome/route.ts", "Idempotency-Key");
  assertIncludes("docs/CUSTOMER_VALUE_DELIVERY_API.md", "POST /api/opportunitycards/:id/outcome");
  assertIncludes("docs/CUSTOMER_VALUE_DELIVERY_LLD.md", "Rollback");
  assertIncludes("docs/CUSTOMER_VALUE_DELIVERY_USER_GUIDE.md", "Customer Operations");
  assertIncludes("package.json", "\"version\": \"0.17.0\"");

  return {
    ok: true,
    version: "customer-value-delivery@0.17.0",
    deliverables: issueMatches.length,
    checkedFiles: requiredFiles.length,
  };
}

function usage() {
  console.log(`Usage:
  node scripts/customer-value-delivery.mjs verify

Commands:
  verify   Static contract check for customer-value APIs, UI, docs, version, and DoD artifacts.`);
}

const command = process.argv[2] || "verify";
try {
  if (command === "verify") {
    console.log(JSON.stringify(verify(), null, 2));
  } else {
    usage();
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
