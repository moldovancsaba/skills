import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import runnerRegistry from "./lib/runtime/runner-registry.js";
import {
  getDestinationMissionKinds,
  getDestinationTopology,
  listSchedulableDestinationMissionKinds,
} from "../src/lib/check-lifecycle/topology-registry.js";
import lifecycleSpine from "../src/lib/check-lifecycle/lifecycle-spine.js";

const { applyRunnerIdentity } = runnerRegistry;
const { buildDestinationDaemonLane, buildLifecycleVerificationReport } = lifecycleSpine;
const RUNNER = applyRunnerIdentity("check.local.lifecycle-verifier");
const prisma = new PrismaClient();

function readArgs(argv) {
  const args = { companyId: "", strict: false, outDir: "logs" };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--companyId") args.companyId = String(argv[index + 1] || "").trim();
    if (token === "--outDir") args.outDir = String(argv[index + 1] || "logs").trim();
    if (token === "--strict") args.strict = true;
  }
  return args;
}

function check(id, passed, summary, metadata = null, severity = "error") {
  return {
    id,
    passed: Boolean(passed),
    severity,
    summary,
    metadata,
  };
}

async function verifyCompany(company) {
  const checks = [];
  const [jobCount, activeDestinations, activeDefinitions, daemonJobs] = await Promise.all([
    prisma.pipelineJob.count({ where: { companyId: company.id } }),
    prisma.destinationInstance.findMany({
      where: { companyId: company.id, isActive: true },
      select: { id: true, destinationKey: true },
    }),
    prisma.destinationMissionDefinition.findMany({
      where: { companyId: company.id, status: "active" },
      select: { id: true, destinationKey: true, missionKind: true, name: true },
    }),
    prisma.pipelineJob.findMany({
      where: { companyId: company.id, jobType: "DESTINATION_MISSION_DAEMON" },
      select: { id: true, entityType: true, entityId: true, status: true, metadata: true },
    }),
  ]);

  checks.push(check(
    "active-unit-has-core-jobs",
    jobCount > 0,
    "Active CHECK Unit must have at least one lifecycle pipeline job.",
    { jobCount },
  ));

  const destinationDaemonJobs = daemonJobs.filter((job) => job.entityType === "DESTINATION_SERVICE");
  for (const destination of activeDestinations) {
    const topology = getDestinationTopology(destination.destinationKey);
    if (!topology) {
      checks.push(check(
        "active-destination-supported",
        false,
        "Active destination must be declared in lifecycle topology.",
        destination,
      ));
      continue;
    }

    const daemonForDestination = destinationDaemonJobs.some((job) => {
      const metadata = job.metadata && typeof job.metadata === "object" ? job.metadata : {};
      return Array.isArray(metadata.activeDestinationKeys)
        ? metadata.activeDestinationKeys.includes(destination.destinationKey)
        : metadata.destinationKey === destination.destinationKey;
    });
    checks.push(check(
      "active-destination-has-daemon-lane",
      daemonForDestination,
      "Active destination must have a destination-service daemon lane.",
      { destinationKey: destination.destinationKey, daemonJobCount: destinationDaemonJobs.length },
    ));

    const requiredMissionKinds = getDestinationMissionKinds(destination.destinationKey);
    for (const missionKind of requiredMissionKinds) {
      const hasDefinition = activeDefinitions.some((definition) =>
        definition.destinationKey === destination.destinationKey && definition.missionKind === missionKind
      );
      checks.push(check(
        "active-destination-has-required-mission",
        hasDefinition,
        "Active destination must have its required active mission definition.",
        { destinationKey: destination.destinationKey, missionKind },
      ));
    }
  }

  const schedulableKinds = new Set(listSchedulableDestinationMissionKinds());
  for (const definition of activeDefinitions) {
    checks.push(check(
      "mission-kind-schedulable",
      schedulableKinds.has(definition.missionKind),
      "Active mission definition must use a schedulable lifecycle mission kind.",
      definition,
    ));
  }
  const lifecycleGate = buildLifecycleVerificationReport({
    companyId: company.id,
    destinationKeys: activeDestinations.map((destination) => destination.destinationKey),
    requiredPipelineJobs: jobCount > 0 ? ["__any_core_job_present__"] : ["__any_core_job_present__"],
    existingPipelineJobs: jobCount > 0 ? ["__any_core_job_present__"] : [],
    daemonLane: buildDestinationDaemonLane({
      destinationKeys: daemonJobs.flatMap((job) => {
        const metadata = job.metadata && typeof job.metadata === "object" ? job.metadata : {};
        if (Array.isArray(metadata.destinationKeys)) return metadata.destinationKeys;
        if (Array.isArray(metadata.activeDestinationKeys)) return metadata.activeDestinationKeys;
        return metadata.destinationKey ? [metadata.destinationKey] : [];
      }),
    }),
    activeMissionKinds: activeDefinitions.map((definition) => definition.missionKind),
    schedulableMissionKinds: listSchedulableDestinationMissionKinds(),
  });

  return {
    company,
    checks,
    lifecycleGate,
    passed: checks.every((item) => item.passed || item.severity !== "error"),
  };
}

const args = readArgs(process.argv.slice(2));

try {
  const companies = await prisma.company.findMany({
    where: args.companyId ? { id: args.companyId } : {},
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const results = [];
  for (const company of companies) {
    results.push(await verifyCompany(company));
  }
  const failedChecks = results.flatMap((result) =>
    result.checks
      .filter((item) => !item.passed && item.severity === "error")
      .map((item) => ({ company: result.company, ...item })),
  );
  const report = {
    ok: failedChecks.length === 0,
    runner: RUNNER,
    processTitle: process.title,
    generatedAt: new Date().toISOString(),
    strict: args.strict,
    inspectedCompanies: companies.length,
    failedChecks,
    results,
  };

  mkdirSync(args.outDir, { recursive: true });
  const reportPath = join(args.outDir, `lifecycle-verification-${Date.now()}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify({
    ok: report.ok,
    runner: RUNNER.humanName,
    inspectedCompanies: report.inspectedCompanies,
    failedCheckCount: failedChecks.length,
    reportPath,
  }, null, 2));

  if (!report.ok && args.strict) process.exit(1);
} finally {
  await prisma.$disconnect();
}
