const { computeCompanyScoreHealth } = require("./score-health");

const PIPELINE_JOB_TYPES = Object.freeze([
  "FEEDBACK_RECONCILIATION",
  "CARD_RESCORING",
  "FRONTIER_RECOMPUTE",
  "FULL_MAINTENANCE",
  "SCORE_ALERT_REPAIR",
  "COMPANY_SYNTHESIS",
]);

const PIPELINE_QUEUE_COLUMNS = Object.freeze(["NOW", "SOON", "LATER", "PARKED"]);
const PIPELINE_CONTROL_MODES = Object.freeze(["AI_ONLY", "HUMAN_GUIDED"]);
const PIPELINE_JOB_STATUSES = Object.freeze(["ACTIVE", "RUNNING", "PAUSED", "FAILED"]);

const QUEUE_COLUMN_RANK = Object.freeze({
  NOW: 0,
  SOON: 1,
  LATER: 2,
  PARKED: 3,
});

const JOB_LABELS = Object.freeze({
  FEEDBACK_RECONCILIATION: "Feedback Reconciliation",
  CARD_RESCORING: "Card Rescoring",
  FRONTIER_RECOMPUTE: "Frontier Recompute",
  FULL_MAINTENANCE: "Full Maintenance",
  SCORE_ALERT_REPAIR: "Score Alert Repair",
  COMPANY_SYNTHESIS: "Company Synthesis",
});

function getPipelineJobLabel(jobType) {
  return JOB_LABELS[jobType] ?? jobType;
}

function roundPriority(value) {
  return Number(Math.max(0, value).toFixed(2));
}

function getQueueColumnRank(column) {
  return QUEUE_COLUMN_RANK[column] ?? QUEUE_COLUMN_RANK.LATER;
}

function buildAutoJobProfile(jobType, signals) {
  const {
    pendingFeedbackCount,
    pendingStrategicFeedbackCount,
    staleAuditCount,
    scoreHealth,
    activeTaskCount,
    activeKnowledgeCount,
    sourceCount,
  } = signals;
  const overallBand = scoreHealth?.overallBand ?? "HEALTHY";
  const totalPendingFeedback = pendingFeedbackCount + pendingStrategicFeedbackCount;

  switch (jobType) {
    case "FEEDBACK_RECONCILIATION":
      return totalPendingFeedback > 0
        ? {
            queueColumn: "NOW",
            priorityScore: roundPriority(100 + totalPendingFeedback * 8),
            reason: `${totalPendingFeedback} pending feedback event(s) are waiting for worker reconciliation.`,
            sourceSignal: "feedback-backlog",
          }
        : {
            queueColumn: "LATER",
            priorityScore: 24,
            reason: "No pending feedback backlog. Keep reconciliation available under AI control.",
            sourceSignal: "steady-state",
          };
    case "CARD_RESCORING":
      return staleAuditCount > 0 || overallBand === "CRITICAL"
        ? {
            queueColumn: overallBand === "CRITICAL" ? "NOW" : "SOON",
            priorityScore: roundPriority(92 + staleAuditCount * 3 + (overallBand === "CRITICAL" ? 20 : 0)),
            reason:
              overallBand === "CRITICAL"
                ? "Critical score-health state escalated rescoring to immediate worker focus."
                : `${staleAuditCount} card(s) are waiting on audit/rescore attention.`,
            sourceSignal: overallBand === "CRITICAL" ? "score-health-critical" : "oldest-first-rescore",
          }
        : {
            queueColumn: "LATER",
            priorityScore: 42,
            reason: "Periodic rescoring remains scheduled under oldest-first fairness.",
            sourceSignal: "periodic-rescore",
          };
    case "FRONTIER_RECOMPUTE":
      return {
        queueColumn: totalPendingFeedback > 0 || activeTaskCount > 0 ? "SOON" : "LATER",
        priorityScore: roundPriority(56 + totalPendingFeedback * 2 + Math.min(activeTaskCount, 20)),
        reason: "Checklist and planning placement should stay synchronized with the latest scoring and feedback.",
        sourceSignal: totalPendingFeedback > 0 ? "feedback-driven-frontier" : "periodic-frontier",
      };
    case "FULL_MAINTENANCE":
      return {
        queueColumn: "LATER",
        priorityScore: 36,
        reason: "Maintenance keeps drift, freshness, and integrity bounded across the company.",
        sourceSignal: "maintenance-cycle",
      };
    case "SCORE_ALERT_REPAIR":
      if (overallBand === "CRITICAL") {
        return {
          queueColumn: "NOW",
          priorityScore: 120,
          reason: "Critical score-health clustering requires immediate repair work.",
          sourceSignal: "score-health-critical",
        };
      }
      if (overallBand === "SUSPICIOUS" || overallBand === "WARNING") {
        return {
          queueColumn: "SOON",
          priorityScore: overallBand === "SUSPICIOUS" ? 96 : 72,
          reason: `${overallBand} score-health state should trigger repair-oriented queue work.`,
          sourceSignal: `score-health-${overallBand.toLowerCase()}`,
        };
      }
      return {
        queueColumn: "PARKED",
        priorityScore: 0,
        reason: "No active score-health repair signal. Parked under AI control until alerts rise.",
        sourceSignal: "score-health-healthy",
      };
    case "COMPANY_SYNTHESIS":
      return {
        queueColumn: sourceCount > 0 || activeKnowledgeCount > 0 ? "SOON" : "LATER",
        priorityScore: roundPriority(68 + Math.min(sourceCount, 30) + Math.min(activeKnowledgeCount, 20)),
        reason: "Company synthesis keeps evidence flowing into knowledge, goals, and tasks.",
        sourceSignal: "company-synthesis",
      };
    default:
      return {
        queueColumn: "LATER",
        priorityScore: 20,
        reason: "Background pipeline work is waiting in the AI queue.",
        sourceSignal: "default",
      };
  }
}

async function gatherCompanyPipelineSignals(prisma, companyId) {
  const [
    pendingFeedbackCount,
    pendingStrategicFeedbackCount,
    activeTaskCount,
    activeKnowledgeCount,
    sourceCount,
    staleFlashcards,
    staleGoals,
    staleTasks,
    staleSources,
    staleTopics,
    staleFiles,
    scoreHealth,
  ] = await Promise.all([
    prisma.feedback.count({
      where: {
        nbaItem: { companyId },
        processedByWorkerAt: null,
      },
    }),
    prisma.strategicFeedback.count({
      where: {
        companyId,
        processedByAI: false,
      },
    }),
    prisma.nBAItem.count({
      where: {
        companyId,
        activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] },
        processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED"] },
      },
    }),
    prisma.flashcard.count({
      where: {
        companyId,
        activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] },
        processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED"] },
      },
    }),
    prisma.source.count({ where: { companyId } }),
    prisma.flashcard.count({
      where: {
        companyId,
        activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] },
        processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED"] },
        OR: [
          { lastAuditedAt: null },
          { lastAuditedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        ],
      },
    }),
    prisma.goalcard.count({
      where: {
        companyId,
        activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] },
        processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED"] },
        OR: [
          { lastAuditedAt: null },
          { lastAuditedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        ],
      },
    }),
    prisma.nBAItem.count({
      where: {
        companyId,
        activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] },
        processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED"] },
        OR: [
          { lastAuditedAt: null },
          { lastAuditedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        ],
      },
    }),
    prisma.source.count({
      where: {
        companyId,
        updatedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.topic.count({
      where: {
        companyId,
        updatedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.uploadedSourceFile.count({
      where: {
        companyId,
        updatedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
    computeCompanyScoreHealth(companyId, prisma),
  ]);

  return {
    pendingFeedbackCount,
    pendingStrategicFeedbackCount,
    activeTaskCount,
    activeKnowledgeCount,
    sourceCount,
    staleAuditCount: staleFlashcards + staleGoals + staleTasks + staleSources + staleTopics + staleFiles,
    scoreHealth,
  };
}

async function syncCompanyPipelineJobs(prisma, companyId) {
  const signals = await gatherCompanyPipelineSignals(prisma, companyId);
  const jobs = [];

  for (const jobType of PIPELINE_JOB_TYPES) {
    const autoProfile = buildAutoJobProfile(jobType, signals);
    const existing = await prisma.pipelineJob.findUnique({
      where: { companyId_jobType: { companyId, jobType } },
    });

    if (!existing) {
      jobs.push(await prisma.pipelineJob.create({
        data: {
          companyId,
          jobType,
          entityId: companyId,
          entityType: "COMPANY",
          status: "ACTIVE",
          controlMode: "AI_ONLY",
          queueColumn: autoProfile.queueColumn,
          manualSortOrder: 0,
          priorityScore: autoProfile.priorityScore,
          reason: autoProfile.reason,
          sourceSignal: autoProfile.sourceSignal,
        },
      }));
      continue;
    }

    jobs.push(await prisma.pipelineJob.update({
      where: { id: existing.id },
      data: {
        priorityScore: autoProfile.priorityScore,
        reason: autoProfile.reason,
        sourceSignal: autoProfile.sourceSignal,
        queueColumn: existing.controlMode === "AI_ONLY" ? autoProfile.queueColumn : existing.queueColumn,
        status:
          existing.status === "RUNNING"
            ? existing.status
            : existing.status === "PAUSED"
              ? existing.status
              : "ACTIVE",
      },
    }));
  }

  return jobs;
}

async function syncAllCompanyPipelineJobs(prisma) {
  const companies = await prisma.company.findMany({
    select: { id: true },
    orderBy: { updatedAt: "asc" },
  });

  for (const company of companies) {
    await syncCompanyPipelineJobs(prisma, company.id);
  }
}

function sortPipelineJobs(jobs) {
  return [...jobs].sort((left, right) => {
    const leftManual = left.controlMode === "HUMAN_GUIDED";
    const rightManual = right.controlMode === "HUMAN_GUIDED";
    if (leftManual !== rightManual) return leftManual ? -1 : 1;

    const leftRank = getQueueColumnRank(left.queueColumn);
    const rightRank = getQueueColumnRank(right.queueColumn);
    if (leftRank !== rightRank) return leftRank - rightRank;

    if (leftManual && rightManual) {
      if ((left.manualSortOrder ?? 0) !== (right.manualSortOrder ?? 0)) {
        return (left.manualSortOrder ?? 0) - (right.manualSortOrder ?? 0);
      }
    } else if ((left.priorityScore ?? 0) !== (right.priorityScore ?? 0)) {
      return (right.priorityScore ?? 0) - (left.priorityScore ?? 0);
    }

    return new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime();
  });
}

async function listCompanyPipelineJobs(prisma, companyId) {
  await syncCompanyPipelineJobs(prisma, companyId);
  const jobs = await prisma.pipelineJob.findMany({
    where: { companyId },
    orderBy: [{ updatedAt: "asc" }],
  });
  return sortPipelineJobs(jobs);
}

async function resetCompanyPipelineJobsToAiOnly(prisma, companyId) {
  await prisma.pipelineJob.updateMany({
    where: { companyId },
    data: {
      controlMode: "AI_ONLY",
      manualSortOrder: 0,
      status: "ACTIVE",
      lastError: null,
      updatedAt: new Date(),
    },
  });
  return listCompanyPipelineJobs(prisma, companyId);
}

async function applyManualPipelineQueueMove(prisma, companyId, movedJobId, sourceColumn, destinationColumn, destinationColumnOrderIds, sourceColumnOrderIds = []) {
  const manualSortForIndex = (index, total) => index - total;
  await prisma.$transaction(async (tx) => {
    for (const [index, jobId] of destinationColumnOrderIds.entries()) {
      await tx.pipelineJob.update({
        where: { id: jobId },
        data: {
          companyId,
          queueColumn: destinationColumn,
          controlMode: "HUMAN_GUIDED",
          manualSortOrder: manualSortForIndex(index, destinationColumnOrderIds.length),
          status: "ACTIVE",
          updatedAt: new Date(),
        },
      });
    }

    for (const [index, jobId] of sourceColumnOrderIds.entries()) {
      await tx.pipelineJob.update({
        where: { id: jobId },
        data: {
          companyId,
          queueColumn: sourceColumn,
          controlMode: "HUMAN_GUIDED",
          manualSortOrder: manualSortForIndex(index, sourceColumnOrderIds.length),
          status: "ACTIVE",
          updatedAt: new Date(),
        },
      });
    }
  });

  const moved = await prisma.pipelineJob.findUnique({ where: { id: movedJobId } });
  return {
    moved,
    jobs: await listCompanyPipelineJobs(prisma, companyId),
  };
}

async function claimNextPipelineJobs(prisma, limit = 3) {
  await syncAllCompanyPipelineJobs(prisma);
  const candidates = await prisma.pipelineJob.findMany({
    where: {
      status: { in: ["ACTIVE", "FAILED"] },
      queueColumn: { not: "PARKED" },
    },
    orderBy: [{ updatedAt: "asc" }],
    include: {
      company: true,
    },
  });

  const claimed = [];
  for (const job of sortPipelineJobs(candidates).slice(0, limit)) {
    const updated = await prisma.pipelineJob.update({
      where: { id: job.id },
      data: {
        status: "RUNNING",
        lastTriedAt: new Date(),
        attemptCount: (job.attemptCount ?? 0) + 1,
        lastError: null,
      },
      include: { company: true },
    });
    claimed.push(updated);
  }
  return claimed;
}

async function completePipelineJob(prisma, jobId, reason = null) {
  return prisma.pipelineJob.update({
    where: { id: jobId },
    data: {
      status: "ACTIVE",
      lastCompletedAt: new Date(),
      lastError: null,
      updatedAt: new Date(),
      reason: reason ?? undefined,
    },
  });
}

async function failPipelineJob(prisma, jobId, error) {
  return prisma.pipelineJob.update({
    where: { id: jobId },
    data: {
      status: "FAILED",
      lastError: String(error?.message ?? error ?? "unknown pipeline failure"),
      updatedAt: new Date(),
    },
  });
}

module.exports = {
  PIPELINE_JOB_TYPES,
  PIPELINE_QUEUE_COLUMNS,
  PIPELINE_CONTROL_MODES,
  PIPELINE_JOB_STATUSES,
  getPipelineJobLabel,
  getQueueColumnRank,
  buildAutoJobProfile,
  gatherCompanyPipelineSignals,
  syncCompanyPipelineJobs,
  syncAllCompanyPipelineJobs,
  listCompanyPipelineJobs,
  resetCompanyPipelineJobsToAiOnly,
  applyManualPipelineQueueMove,
  claimNextPipelineJobs,
  completePipelineJob,
  failPipelineJob,
  sortPipelineJobs,
};
