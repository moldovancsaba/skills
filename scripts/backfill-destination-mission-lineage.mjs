import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_POLICY = Object.freeze({
  version: "destination-legacy-adoption@v1",
  executionMode: "manual",
  minimumScarcityScore: 70,
  allowedListingTypes: [
    "Classes",
    "Camps",
    "Competitions",
    "Drop-In Activities",
    "Meet-Up Groups",
  ],
  requireOfficialSource: true,
  requireImgBbImage: true,
  requireRecurringProgramsWhenAvailable: true,
  maxCandidatesPerMission: 12,
  maxDomainRetries: 2,
  maxContinuousPasses: 3,
  stopCondition: "one_live_verified_listing",
});

function parseArgs(argv) {
  const args = {
    companyId: "",
    destinationKey: "",
    outDir: "logs",
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--companyId") {
      args.companyId = String(argv[index + 1] || "").trim();
      index += 1;
    } else if (token === "--destinationKey") {
      args.destinationKey = String(argv[index + 1] || "").trim().toLowerCase();
      index += 1;
    } else if (token === "--outDir") {
      args.outDir = String(argv[index + 1] || "").trim() || "logs";
      index += 1;
    } else if (token === "--dry-run") {
      args.dryRun = true;
    }
  }

  return args;
}

function usage() {
  return [
    "Usage: node scripts/backfill-destination-mission-lineage.mjs --companyId <companyId> --destinationKey <compare|compare> [--dry-run]",
    "",
    "Creates one adopted legacy mission-run lineage when real destination review/publish evidence exists but no mission run exists yet.",
  ].join("\n");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function cleanDestinationKey(value) {
  if (value === "compare" || value === "compare") return value;
  return "";
}

const args = parseArgs(process.argv.slice(2));
const destinationKey = cleanDestinationKey(args.destinationKey);
if (!args.companyId || !destinationKey) {
  fail(usage());
}

const prisma = new PrismaClient();

try {
  const destinationInstance = await prisma.destinationInstance.findFirst({
    where: {
      companyId: args.companyId,
      destinationKey,
      isActive: true,
    },
    select: {
      id: true,
      destinationKey: true,
      name: true,
    },
  });

  if (!destinationInstance) {
    fail(`No active ${destinationKey} destination instance exists for company ${args.companyId}.`);
  }

  const existingMissionCount = await prisma.destinationMissionRun.count({
    where: {
      companyId: args.companyId,
      destinationInstanceId: destinationInstance.id,
      destinationKey,
    },
  });

  const [latestPacket, latestPublishedOutcome, sourceDocumentCount, candidateCount] = await Promise.all([
    prisma.destinationReviewPacket.findFirst({
      where: {
        companyId: args.companyId,
        destinationInstanceId: destinationInstance.id,
      },
      orderBy: [
        { updatedAt: "desc" },
        { submittedAt: "desc" },
      ],
      select: {
        id: true,
        workflowRunId: true,
        candidateId: true,
        packetState: true,
        updatedAt: true,
      },
    }),
    prisma.destinationOutcomeMemory.findFirst({
      where: {
        companyId: args.companyId,
        destinationInstanceId: destinationInstance.id,
        eventType: {
          in: ["publish_completed", "completed", "complete"],
        },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        workflowRunId: true,
        candidateId: true,
        reviewPacketId: true,
        eventType: true,
        createdAt: true,
      },
    }),
    prisma.destinationSourceDocument.count({
      where: {
        companyId: args.companyId,
        destinationInstanceId: destinationInstance.id,
      },
    }),
    prisma.destinationCandidate.count({
      where: {
        companyId: args.companyId,
        destinationInstanceId: destinationInstance.id,
      },
    }),
  ]);

  const hasInput = sourceDocumentCount > 0 || candidateCount > 0;
  const hasReview = Boolean(latestPacket);
  const hasPublished = Boolean(latestPublishedOutcome);
  const canBackfill = existingMissionCount === 0 && hasInput && (hasReview || hasPublished);
  const terminalState = hasPublished ? "PUBLISHED_VERIFIED" : "CANDIDATE_IN_REVIEW";
  const terminalKind = hasPublished ? "published_verified" : "review_ready";
  const adoptedRefs = {
    source: "backfill-destination-mission-lineage",
    adoptionVersion: 1,
    destinationKey,
    sourceDocumentCount,
    candidateCount,
    reviewPacketId: latestPublishedOutcome?.reviewPacketId ?? latestPacket?.id ?? null,
    outcomeMemoryId: latestPublishedOutcome?.id ?? null,
    workflowRunId: latestPublishedOutcome?.workflowRunId ?? latestPacket?.workflowRunId ?? null,
    candidateId: latestPublishedOutcome?.candidateId ?? latestPacket?.candidateId ?? null,
  };

  const report = {
    ok: canBackfill || existingMissionCount > 0,
    dryRun: args.dryRun,
    companyId: args.companyId,
    destinationKey,
    destinationInstance,
    existingMissionCount,
    hasInput,
    hasReview,
    hasPublished,
    action: existingMissionCount > 0
      ? "skipped_existing_mission_lineage"
      : canBackfill
        ? args.dryRun
          ? "would_create_legacy_mission_lineage"
          : "created_legacy_mission_lineage"
        : "blocked_missing_evidence",
    adoptedRefs,
    createdMissionRunId: null,
    createdAttemptId: null,
    createdAt: new Date().toISOString(),
  };

  if (canBackfill && !args.dryRun) {
    const result = await prisma.$transaction(async (tx) => {
      const policySnapshot = await tx.destinationMissionPolicySnapshot.create({
        data: {
          companyId: args.companyId,
          destinationInstanceId: destinationInstance.id,
          destinationKey,
          missionKind: "rulebook_new_listing",
          version: DEFAULT_POLICY.version,
          policyJson: DEFAULT_POLICY,
          metadata: adoptedRefs,
        },
      });

      const missionRun = await tx.destinationMissionRun.create({
        data: {
          companyId: args.companyId,
          destinationInstanceId: destinationInstance.id,
          policySnapshotId: policySnapshot.id,
          destinationKey,
          missionKind: "rulebook_new_listing",
          state: terminalState,
          successCandidateId: adoptedRefs.candidateId,
          attemptCount: 1,
          metadata: adoptedRefs,
        },
      });

      const attempt = await tx.destinationMissionAttempt.create({
        data: {
          companyId: args.companyId,
          destinationInstanceId: destinationInstance.id,
          missionRunId: missionRun.id,
          ordinal: 1,
          workflowRunId: adoptedRefs.workflowRunId,
          candidateId: adoptedRefs.candidateId,
          state: "completed",
          terminalKind,
          metadata: adoptedRefs,
          startedAt: latestPublishedOutcome?.createdAt ?? latestPacket?.updatedAt ?? new Date(),
          completedAt: latestPublishedOutcome?.createdAt ?? latestPacket?.updatedAt ?? new Date(),
        },
      });

      await tx.destinationMissionRun.update({
        where: { id: missionRun.id },
        data: { activeAttemptId: attempt.id },
      });

      return { missionRunId: missionRun.id, attemptId: attempt.id };
    });

    report.createdMissionRunId = result.missionRunId;
    report.createdAttemptId = result.attemptId;
  }

  mkdirSync(args.outDir, { recursive: true });
  const outputPath = join(args.outDir, `destination-mission-lineage-backfill-${destinationKey}-${Date.now()}.json`);
  writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ ...report, outputPath }, null, 2));

  if (!report.ok) {
    process.exitCode = 1;
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Destination mission lineage backfill failed: ${message}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
