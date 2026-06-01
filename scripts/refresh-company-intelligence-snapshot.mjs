import { createRequire } from "module";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");
const { refreshCompanyIntelligenceSnapshot } = require("./lib/intelligence-snapshot");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = {
    companyId: "",
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--companyId") {
      args.companyId = String(argv[index + 1] || "").trim();
      index += 1;
    } else if (value === "--json") {
      args.json = true;
    }
  }

  return args;
}

function usage() {
  return [
    "Usage: node scripts/refresh-company-intelligence-snapshot.mjs --companyId <companyId> [--json]",
    "",
    "Refreshes one Unit intelligence snapshot and webapp projection immediately.",
    "Use this before miniapp golden-path proof when Local has produced fresh work but the UI projection is stale.",
  ].join("\n");
}

const args = parseArgs(process.argv.slice(2));
if (!args.companyId) {
  console.error(usage());
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const startedAt = new Date();
  const result = await refreshCompanyIntelligenceSnapshot(prisma, args.companyId);
  const finishedAt = new Date();
  const payload = {
    ok: true,
    companyId: args.companyId,
    root: ROOT,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    result,
  };

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(`Refreshed intelligence snapshot for ${args.companyId}.`);
    console.log(`Duration: ${payload.durationMs}ms`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to refresh intelligence snapshot for ${args.companyId}: ${message}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
