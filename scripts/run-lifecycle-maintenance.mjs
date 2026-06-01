import { PrismaClient } from "@prisma/client";
import { maintainCompanyLifecycle, maintainLifecycleShard } from "../src/lib/check-lifecycle/maintenance-engine.js";
import runnerRegistry from "./lib/runtime/runner-registry.js";

const { applyRunnerIdentity } = runnerRegistry;
const RUNNER = applyRunnerIdentity("check.local.lifecycle-maintenance");
const prisma = new PrismaClient();

function readArgs(argv) {
  const args = { companyId: "", limit: 5 };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--companyId") args.companyId = String(argv[index + 1] || "");
    if (token === "--limit") args.limit = Number(argv[index + 1] || 5);
  }
  return args;
}

const args = readArgs(process.argv.slice(2));

try {
  console.log(`${RUNNER.humanName} starting (${RUNNER.id})`);
  const result = args.companyId
    ? await maintainCompanyLifecycle(prisma, { companyId: args.companyId, actorId: "lifecycle-maintenance-cli" })
    : await maintainLifecycleShard(prisma, { limit: args.limit, actorId: "lifecycle-maintenance-cli" });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await prisma.$disconnect();
}
