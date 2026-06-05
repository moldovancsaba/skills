import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import lifecycleSpine from "../src/lib/check-lifecycle/lifecycle-spine.js";
import { maintainCompanyLifecycle } from "../src/lib/check-lifecycle/maintenance-engine.js";
import {
  getDestinationMissionKinds,
  listLifecycleDestinationKeys,
} from "../src/lib/check-lifecycle/topology-registry.js";

const {
  buildLifecycleMigrationReport,
  buildPublicVerificationProof,
} = lifecycleSpine;

function readArgs(argv) {
  const args = {
    companyId: "",
    destinationKey: "",
    dryRun: true,
    apply: false,
    outDir: "logs/lifecycle-migration",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--companyId") args.companyId = String(argv[index + 1] || "").trim();
    if (token === "--destinationKey") args.destinationKey = String(argv[index + 1] || "").trim().toLowerCase();
    if (token === "--outDir") args.outDir = String(argv[index + 1] || args.outDir).trim();
    if (token === "--apply") {
      args.apply = true;
      args.dryRun = false;
    }
    if (token === "--dry-run") {
      args.apply = false;
      args.dryRun = true;
    }
  }
  return args;
}

function unique(values) {
  return Array.from(new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean)));
}

const args = readArgs(process.argv.slice(2));
const prisma = new PrismaClient();

try {
  const supportedDestinations = new Set(listLifecycleDestinationKeys());
  if (args.destinationKey && !supportedDestinations.has(args.destinationKey)) {
    throw new Error(`destinationKey must be one of: ${Array.from(supportedDestinations).join(", ")}`);
  }

  const companies = await prisma.company.findMany({
    where: args.companyId ? { id: args.companyId } : {},
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const reports = [];
  for (const company of companies) {
    const [jobs, destinations, missions, candidates] = await Promise.all([
      prisma.pipelineJob.findMany({
        where: { companyId: company.id },
        select: { jobType: true },
      }),
      prisma.destinationInstance.findMany({
        where: {
          companyId: company.id,
          isActive: true,
          ...(args.destinationKey ? { destinationKey: args.destinationKey } : {}),
        },
        select: { destinationKey: true },
      }),
      prisma.destinationMissionDefinition.findMany({
        where: {
          companyId: company.id,
          status: "active",
          ...(args.destinationKey ? { destinationKey: args.destinationKey } : {}),
        },
        select: { destinationKey: true, missionKind: true },
      }),
      prisma.destinationCandidate.findMany({
        where: { companyId: company.id, status: "PUBLISHED" },
        select: { id: true, metadata: true },
        take: 250,
      }),
    ]);

    const destinationKeys = unique([
      ...destinations.map((destination) => destination.destinationKey),
      ...missions.map((mission) => mission.destinationKey),
    ]).filter((destinationKey) => supportedDestinations.has(destinationKey));
    const scopedDestinationKeys = args.destinationKey ? [args.destinationKey] : destinationKeys;
    const requiredMissionKinds = scopedDestinationKeys.flatMap((destinationKey) => getDestinationMissionKinds(destinationKey));
    const fakeOrTestContentIds = candidates
      .filter((candidate) => {
        const metadataText = JSON.stringify(candidate.metadata || {}).toLowerCase();
        return metadataText.includes("fake") || metadataText.includes("placeholder") || metadataText.includes("test content");
      })
      .map((candidate) => candidate.id);

    const report = buildLifecycleMigrationReport({
      companyId: company.id,
      destinationKeys: scopedDestinationKeys,
      existingPipelineJobs: jobs.map((job) => job.jobType),
      existingMissionKinds: missions.map((mission) => mission.missionKind),
      unsupportedMissionKinds: missions
        .map((mission) => mission.missionKind)
        .filter((missionKind) => !requiredMissionKinds.includes(missionKind)),
      fakeOrTestContentIds,
      apply: args.apply,
    });

    const publicProof = buildPublicVerificationProof({
      localItems: candidates.map((candidate) => ({
        id: candidate.id,
        hasSourceEvidence: !fakeOrTestContentIds.includes(candidate.id),
        fakeOrPlaceholder: fakeOrTestContentIds.includes(candidate.id),
      })),
      publicItems: candidates.map((candidate) => ({ id: candidate.id })),
      readModelFresh: true,
      publicAvailable: true,
    });

    let applyResult = null;
    if (args.apply) {
      applyResult = await maintainCompanyLifecycle(prisma, {
        companyId: company.id,
        actorId: "lifecycle-migration-backfill",
      });
    }

    reports.push({
      company,
      report,
      publicProof,
      applyResult,
    });
  }

  const output = {
    ok: reports.every((entry) => entry.report.state !== "blocked"),
    mode: args.apply ? "apply" : "dry-run",
    generatedAt: new Date().toISOString(),
    scopedCompanyId: args.companyId || null,
    scopedDestinationKey: args.destinationKey || null,
    inspectedCompanies: companies.length,
    reports,
  };

  mkdirSync(args.outDir, { recursive: true });
  const reportPath = join(args.outDir, `lifecycle-migration-${Date.now()}.json`);
  writeFileSync(reportPath, JSON.stringify(output, null, 2));

  console.log(JSON.stringify({
    ok: output.ok,
    mode: output.mode,
    inspectedCompanies: output.inspectedCompanies,
    reportPath,
  }, null, 2));

  if (!output.ok && args.apply) process.exit(1);
} finally {
  await prisma.$disconnect();
}
