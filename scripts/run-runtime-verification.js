"use strict";

require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const {
  runRuntimeVerification,
} = require("./lib/runtime/verification");

const prisma = new PrismaClient();

function printReport(report) {
  const summary = report?.summary || {};
  const failing = Array.isArray(report?.checks) ? report.checks.filter((check) => !check.ok) : [];
  console.log(`[runtime-verification] ${summary.ok ? "PASS" : "FAIL"} at ${report.ts}`);
  console.log(`[runtime-verification] checks: ${summary.passedChecks}/${summary.totalChecks} passed`);
  if (!failing.length) {
    console.log("[runtime-verification] no failing checks");
    return;
  }

  console.log("[runtime-verification] failing checks:");
  for (const check of failing) {
    console.log(`- ${check.id}: ${check.summary}`);
    if (check.details) {
      console.log(`  details=${JSON.stringify(check.details)}`);
    }
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for runtime verification. Load the shared runtime environment or set DATABASE_URL before running `npm run verify:runtime`.");
  }
  const report = await runRuntimeVerification(prisma, {
    mode: "live",
    trigger: "manual-cli",
  });
  printReport(report);
  if (!report?.summary?.ok) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("[runtime-verification] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
