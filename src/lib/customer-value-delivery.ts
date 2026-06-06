import {
  ChecklistKanbanColumn,
  OpportunitycardActionType,
  OpportunitycardDeclineReason,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { buildOpportunityLearningAnnotation } from "@/lib/opportunitycards";
import { listPersistedCompanyPipelineJobs } from "@/lib/pipeline-queue";
import { buildProjectionMetadata, normalizeWebappProjection } from "@/lib/webapp-projection";

export const CUSTOMER_VALUE_DELIVERY_VERSION = "customer-value-delivery@0.17.0";

export type CustomerValueDeliverable = {
  issueNumber: number;
  slug: string;
  title: string;
  customerValue: string;
  executionOrder: number;
  dependencies: number[];
  status: "in_progress" | "todo";
  primarySurface: "api" | "ui" | "runtime" | "docs";
};

export const CUSTOMER_VALUE_DELIVERABLES: CustomerValueDeliverable[] = [
  {
    issueNumber: 402,
    slug: "check-foundation-refactor",
    title: "CHECK Foundation Refactor",
    customerValue: "Stable product blocks, permissions, and registry contracts for predictable customer deployments.",
    executionOrder: 66,
    dependencies: [],
    status: "in_progress",
    primarySurface: "runtime",
  },
  {
    issueNumber: 405,
    slug: "intelligence-unit-control-plane",
    title: "Intelligence Unit Control Plane Refactor",
    customerValue: "Governed customer unit setup with explicit profiles, modules, routing, and rollback clarity.",
    executionOrder: 67,
    dependencies: [402],
    status: "in_progress",
    primarySurface: "ui",
  },
  {
    issueNumber: 406,
    slug: "sales-opportunitycards",
    title: "Sales Opportunitycard MVP Delivery",
    customerValue: "Customer-facing lead discovery, scoring, review, and acceptance workflow.",
    executionOrder: 68,
    dependencies: [402, 405],
    status: "todo",
    primarySurface: "ui",
  },
  {
    issueNumber: 409,
    slug: "content-intelligence-workflow",
    title: "Content Intelligence Workflow Consolidation",
    customerValue: "Clear content refresh and publish readiness signals for customer miniapps.",
    executionOrder: 69,
    dependencies: [402, 405],
    status: "todo",
    primarySurface: "runtime",
  },
  {
    issueNumber: 410,
    slug: "classscout-rulebook-ops",
    title: "ClassScout Rulebook and Continuous Ops Consolidation",
    customerValue: "Always-on ClassScout/Compare discovery with governed review pressure and recovery actions.",
    executionOrder: 70,
    dependencies: [409],
    status: "todo",
    primarySurface: "runtime",
  },
  {
    issueNumber: 403,
    slug: "lifecycle-automation",
    title: "Lifecycle Automation Refactor",
    customerValue: "Provisioning, maintenance, delivery gates, and recovery behaviors customers can trust.",
    executionOrder: 71,
    dependencies: [402, 405, 410],
    status: "todo",
    primarySurface: "runtime",
  },
  {
    issueNumber: 319,
    slug: "destination-golden-path",
    title: "Destination workspace golden path",
    customerValue: "Mission-to-publish operator flow for ClassScout/Compare customer destinations.",
    executionOrder: 72,
    dependencies: [403, 410],
    status: "todo",
    primarySurface: "ui",
  },
  {
    issueNumber: 448,
    slug: "customer-operations-dashboard",
    title: "Customer Operations Dashboard",
    customerValue: "Single customer cockpit for sales value, operations pressure, and next safe action.",
    executionOrder: 73,
    dependencies: [319, 403, 406, 409, 410],
    status: "todo",
    primarySurface: "ui",
  },
  {
    issueNumber: 449,
    slug: "opportunity-feedback-learning-loop",
    title: "Opportunity Feedback Learning Loop",
    customerValue: "Accepted and rejected opportunity outcomes become reusable scoring and search memory.",
    executionOrder: 74,
    dependencies: [406, 448],
    status: "todo",
    primarySurface: "api",
  },
  {
    issueNumber: 38,
    slug: "email-notifications",
    title: "Email Notifications",
    customerValue: "Notification readiness for high-value customer actions with score thresholds and channel settings.",
    executionOrder: 75,
    dependencies: [448, 449],
    status: "todo",
    primarySurface: "api",
  },
];

export type CustomerOperationsSeverity = "info" | "warning" | "critical";

export type CustomerOperationsAction = {
  label: string;
  method: "GET" | "POST" | "PATCH";
  href: string;
  body?: Record<string, unknown>;
  requiresConfirmation: boolean;
};

export type CustomerOperationsItem = {
  id: string;
  source: "opportunity" | "runtime" | "destination" | "content" | "notification" | "learning";
  severity: CustomerOperationsSeverity;
  title: string;
  summary: string;
  metric: number;
  updatedAt: string | null;
  actions: CustomerOperationsAction[];
};

type OpportunityOutcomeInput = {
  cardId: string;
  action: OpportunitycardActionType;
  declineReason?: OpportunitycardDeclineReason | null;
  annotation?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  idempotencyKey?: string | null;
  modified?: {
    companyName?: string | null;
    title?: string | null;
    body?: string | null;
    website?: string | null;
    location?: string | null;
    coreOffer?: string | null;
    fitRationale?: string | null;
  };
};

function dateToIso(value?: Date | string | null) {
  if (!value) return null;
  return new Date(value).toISOString();
}

function asPositiveNumber(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function severityFromCount(count: number, warningAt: number, criticalAt: number): CustomerOperationsSeverity {
  if (count >= criticalAt) return "critical";
  if (count >= warningAt) return "warning";
  return "info";
}

export function getCustomerValueDeliveryMap() {
  const doneBefore = new Set<number>();
  const sequenced = [...CUSTOMER_VALUE_DELIVERABLES].sort((left, right) => left.executionOrder - right.executionOrder);
  return sequenced.map((deliverable) => {
    const blockedBy = deliverable.dependencies.filter((issueNumber) => !doneBefore.has(issueNumber));
    if (deliverable.status === "in_progress") doneBefore.add(deliverable.issueNumber);
    return {
      ...deliverable,
      blockedBy,
      canonicalStandard: "https://github.com/sovereignsquad/general-design-system/issues/81",
      issueUrl: `https://github.com/sovereignsquad/general-design-system/issues/${deliverable.issueNumber}`,
    };
  });
}

export async function buildCustomerOperationsSummary(companyId: string) {
  // This read model intentionally joins customer value and operational pressure so the UI can
  // prioritize the next safe action without executing recovery work during page load.
  const [
    pipelineJobs,
    snapshot,
    opportunityCounts,
    acceptedCount,
    highValueOpportunities,
    recentLearning,
    communicationSettings,
    destinationRuns,
  ] = await Promise.all([
    listPersistedCompanyPipelineJobs(prisma, companyId),
    prisma.intelligenceSnapshot.findUnique({
      where: { companyId },
      select: { webappProjection: true },
    }),
    prisma.opportunitycard.count({
      where: {
        companyId,
        departmentKey: "SALES",
        activityState: { not: "ARCHIVED" },
      },
    }),
    prisma.opportunitycard.count({
      where: {
        companyId,
        departmentKey: "SALES",
        processingStatus: "ACCEPTED",
      },
    }),
    prisma.opportunitycard.findMany({
      where: {
        companyId,
        departmentKey: "SALES",
        activityState: { not: "ARCHIVED" },
      },
      orderBy: [{ iceScore: "desc" }, { updatedAt: "desc" }],
      take: 5,
      select: {
        id: true,
        companyName: true,
        title: true,
        iceScore: true,
        processingStatus: true,
        kanbanColumn: true,
        updatedAt: true,
      },
    }),
    prisma.memoryEntry.findMany({
      where: {
        companyId,
        active: true,
        sourceEventType: { in: ["OPPORTUNITY_ACCEPT", "OPPORTUNITY_DECLINE", "OPPORTUNITY_MODIFY", "OPPORTUNITY_REFRESH"] },
      },
      orderBy: [{ weight: "desc" }, { updatedAt: "desc" }],
      take: 8,
      select: {
        id: true,
        scope: true,
        lessonType: true,
        lessonContent: true,
        weight: true,
        topicHint: true,
        itemFamilyId: true,
        updatedAt: true,
      },
    }),
    prisma.communicationSettings.findUnique({
      where: { companyId },
      select: {
        isEnabled: true,
        channel: true,
        handle: true,
        minIceScore: true,
        updatedAt: true,
      },
    }),
    prisma.destinationMissionRun.findMany({
      where: {
        companyId,
        state: { in: ["FAILED_RECOVERABLE", "PAUSED", "CANDIDATE_IN_REVIEW", "PUBLISHING"] },
      },
      select: {
        id: true,
        destinationKey: true,
        state: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
  ]);

  const projection = normalizeWebappProjection(snapshot?.webappProjection);
  const projectionMetadata = buildProjectionMetadata(projection);
  const failedJobs = pipelineJobs.filter((job) => job.status === "FAILED" || job.status === "PAUSED");
  const reviewPressure =
    asPositiveNumber(projection?.miniapps.classscout?.reviewPressureCount) +
    asPositiveNumber(projection?.miniapps.compare?.reviewPressureCount);
  const failedDestinations = destinationRuns.filter((run) => run.state === "FAILED_RECOVERABLE" || run.state === "PAUSED");
  const highValueReady = highValueOpportunities.filter((item) => Number(item.iceScore || 0) >= 80);
  const notificationReady = Boolean(communicationSettings?.isEnabled && communicationSettings.handle);

  const items: CustomerOperationsItem[] = [
    {
      id: "sales:high-value-opportunities",
      source: "opportunity",
      severity: severityFromCount(highValueReady.length, 1, 5),
      title: "High-value sales opportunities",
      summary: `${highValueReady.length} high-ICE opportunitycard(s) are ready for customer review.`,
      metric: highValueReady.length,
      updatedAt: dateToIso(highValueOpportunities[0]?.updatedAt),
      actions: [
        {
          label: "Open sales board",
          method: "GET",
          href: `/${companyId}/sales`,
          requiresConfirmation: false,
        },
      ],
    },
    {
      id: "runtime:blocked-work",
      source: "runtime",
      severity: severityFromCount(failedJobs.length, 1, 3),
      title: "Blocked or failed runtime work",
      summary: `${failedJobs.length} persisted pipeline job(s) need retry, cancel, or acknowledgement.`,
      metric: failedJobs.length,
      updatedAt: dateToIso(failedJobs[0]?.updatedAt ?? failedJobs[0]?.lastTriedAt),
      actions: [
        {
          label: "Open operations API",
          method: "GET",
          href: `/api/companies/${companyId}/operations`,
          requiresConfirmation: false,
        },
      ],
    },
    {
      id: "destination:review-pressure",
      source: "destination",
      severity: severityFromCount(reviewPressure + failedDestinations.length, 1, 10),
      title: "Destination review pressure",
      summary: `${reviewPressure} miniapp packet(s) and ${failedDestinations.length} destination run(s) need operator attention.`,
      metric: reviewPressure + failedDestinations.length,
      updatedAt: dateToIso(destinationRuns[0]?.updatedAt),
      actions: [
        {
          label: "Open unit board",
          method: "GET",
          href: `/${companyId}/unit-board`,
          requiresConfirmation: false,
        },
      ],
    },
    {
      id: "content:projection-freshness",
      source: "content",
      severity: projectionMetadata.freshness.status === "FRESH" ? "info" : "warning",
      title: "Customer read-model freshness",
      summary: `Projection status is ${projectionMetadata.freshness.status.toLowerCase()}.`,
      metric: projectionMetadata.freshness.status === "FRESH" ? 0 : 1,
      updatedAt: projectionMetadata.generatedAt,
      actions: [
        {
          label: "Refresh intelligence snapshot",
          method: "POST",
          href: `/api/companies/${companyId}/operations/${encodeURIComponent("read-model:projection-stale")}/retry`,
          body: { reason: "Customer operations dashboard freshness recovery" },
          requiresConfirmation: true,
        },
      ],
    },
    {
      id: "learning:opportunity-memory",
      source: "learning",
      severity: recentLearning.length > 0 ? "info" : "warning",
      title: "Opportunity learning memory",
      summary: `${recentLearning.length} active opportunity lesson(s) are available to guide scoring and search.`,
      metric: recentLearning.length,
      updatedAt: dateToIso(recentLearning[0]?.updatedAt),
      actions: [
        {
          label: "Open learning API",
          method: "GET",
          href: `/api/opportunitycards/learning-memory?companyId=${encodeURIComponent(companyId)}`,
          requiresConfirmation: false,
        },
      ],
    },
    {
      id: "notification:readiness",
      source: "notification",
      severity: notificationReady ? "info" : "warning",
      title: "Notification readiness",
      summary: notificationReady
        ? `${communicationSettings?.channel} notifications are enabled at ICE ${communicationSettings?.minIceScore}.`
        : "Notifications are not fully configured for high-value customer actions.",
      metric: notificationReady ? 1 : 0,
      updatedAt: dateToIso(communicationSettings?.updatedAt),
      actions: [
        {
          label: "Open settings",
          method: "GET",
          href: `/${companyId}/settings`,
          requiresConfirmation: false,
        },
      ],
    },
  ];

  const critical = items.filter((item) => item.severity === "critical").length;
  const warning = items.filter((item) => item.severity === "warning").length;

  return {
    version: CUSTOMER_VALUE_DELIVERY_VERSION,
    companyId,
    generatedAt: new Date().toISOString(),
    health: critical > 0 ? "critical" : warning > 0 ? "warning" : "healthy",
    delivery: getCustomerValueDeliveryMap(),
    summary: {
      issues: CUSTOMER_VALUE_DELIVERABLES.length,
      opportunities: opportunityCounts,
      acceptedOpportunitycards: acceptedCount,
      highValueReady: highValueReady.length,
      failedJobs: failedJobs.length,
      reviewPressure,
      failedDestinations: failedDestinations.length,
      learningLessons: recentLearning.length,
      notificationsReady: notificationReady,
    },
    items,
    topOpportunities: highValueOpportunities,
    learningMemory: recentLearning,
    operations: {
      actionContract: {
        retryTimeoutMs: 30_000,
        idempotency: "Use the Idempotency-Key header or body.idempotencyKey for mutating recovery and outcome calls.",
        rollback: "Recovery actions only enqueue or move existing work; destructive rollback requires an explicit rollback action.",
      },
    },
  };
}

function mapOutcomeToMemory(input: {
  action: OpportunitycardActionType;
  declineReason?: OpportunitycardDeclineReason | null;
  annotation?: string | null;
  title: string;
  companyName: string;
}) {
  if (input.action === "ACCEPT") {
    return {
      sourceEventType: "OPPORTUNITY_ACCEPT",
      lessonType: "SUCCESS_PATTERN",
      weight: 1.2,
      lessonContent: `Successful opportunity pattern: ${input.companyName} - ${input.title}`,
    };
  }
  if (input.action === "DECLINE") {
    return {
      sourceEventType: "OPPORTUNITY_DECLINE",
      lessonType: input.declineReason === "DUPLICATE" ? "DUPLICATE_HINT" : "ANTI_PATTERN",
      weight: 1.0,
      lessonContent: buildOpportunityLearningAnnotation({
        declineReason: input.declineReason ?? undefined,
        annotation: input.annotation ?? undefined,
      }),
    };
  }
  if (input.action === "MODIFY") {
    return {
      sourceEventType: "OPPORTUNITY_MODIFY",
      lessonType: "SOFT_PREFERENCE",
      weight: 0.8,
      lessonContent: input.annotation || `Operator modified opportunity details for ${input.companyName}.`,
    };
  }
  return {
    sourceEventType: "OPPORTUNITY_REFRESH",
    lessonType: "SOFT_PREFERENCE",
    weight: 0.6,
    lessonContent: input.annotation || `Operator requested follow-up action ${input.action} for ${input.companyName}.`,
  };
}

export async function recordOpportunityOutcomeAndLearning(input: OpportunityOutcomeInput) {
  const card = await prisma.opportunitycard.findUnique({
    where: { id: input.cardId },
  });
  if (!card) {
    return { ok: false as const, status: 404, error: "Opportunitycard not found" };
  }

  const idempotencyKey = String(input.idempotencyKey || "").trim();
  if (idempotencyKey) {
    const recentEvents = await prisma.outcomeEvent.findMany({
      where: {
        companyId: card.companyId,
        entityType: "OPPORTUNITYCARD",
        entityId: card.id,
        outcomeType: input.action,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, payload: true, createdAt: true },
    });
    const existing = recentEvents.find((event) => {
      const payload = event.payload as Record<string, unknown> | null;
      return payload?.idempotencyKey === idempotencyKey;
    });
    if (existing) {
      return {
        ok: true as const,
        idempotent: true,
        companyId: card.companyId,
        opportunitycard: card,
        outcomeEventId: existing.id,
        learningImpact: null,
      };
    }
  }

  const annotation = input.annotation?.trim() || null;
  const updateData: Prisma.OpportunitycardUpdateInput = {
    lastActionAt: new Date(),
    userAnnotation: buildOpportunityLearningAnnotation({
      declineReason: input.declineReason ?? undefined,
      annotation: annotation ?? undefined,
    }),
    updatedAt: new Date(),
  };

  if (input.action === "DECLINE") {
    updateData.processingStatus = "DECLINED";
    updateData.activityState = "ARCHIVED";
    updateData.feedbackScore = Number(card.feedbackScore || 0) - 1;
    updateData.declineCount = { increment: 1 };
    updateData.evaluationReason = input.declineReason || annotation || card.evaluationReason;
  } else if (input.action === "ACCEPT") {
    updateData.processingStatus = "ACCEPTED";
    updateData.kanbanColumn = ChecklistKanbanColumn.CHECKLIST;
    updateData.feedbackScore = Number(card.feedbackScore || 0) + 1;
    updateData.acceptanceCount = { increment: 1 };
  } else if (input.action === "PIN") {
    updateData.kanbanColumn = ChecklistKanbanColumn.CHECKLIST;
  } else if (input.action === "REQUEST_REFRESH") {
    updateData.activityState = "STALE";
  } else if (input.action === "ARCHIVE") {
    updateData.activityState = "ARCHIVED";
  } else if (input.action === "MODIFY") {
    updateData.companyName = input.modified?.companyName?.trim() || card.companyName;
    updateData.title = input.modified?.title?.trim() || card.title;
    updateData.body = input.modified?.body?.trim() || card.body;
    updateData.website = input.modified?.website?.trim() || card.website;
    updateData.location = input.modified?.location?.trim() || card.location;
    updateData.coreOffer = input.modified?.coreOffer?.trim() || card.coreOffer;
    updateData.fitRationale = input.modified?.fitRationale?.trim() || card.fitRationale;
    updateData.processingStatus = "REVIEW";
    updateData.activityState = "STALE";
    updateData.feedbackScore = Number(card.feedbackScore || 0) + 0.5;
  }

  // Writes are sequential instead of transactional because some local Mongo runtimes do not
  // support multi-document transactions. Feedback and audit remain append-only for recovery.
  const feedback = await prisma.opportunitycardFeedback.create({
    data: {
      companyId: card.companyId,
      opportunitycardId: card.id,
      action: input.action,
      declineReason: input.declineReason ?? undefined,
      annotation: annotation ?? undefined,
      modifiedCompanyName: input.modified?.companyName ?? undefined,
      modifiedTitle: input.modified?.title ?? undefined,
      modifiedBody: input.modified?.body ?? undefined,
      modifiedWebsite: input.modified?.website ?? undefined,
      modifiedLocation: input.modified?.location ?? undefined,
      modifiedCoreOffer: input.modified?.coreOffer ?? undefined,
      modifiedFitRationale: input.modified?.fitRationale ?? undefined,
      actedBy: input.actorEmail || input.actorId || "webapp-user",
    },
  });

  const updated = await prisma.opportunitycard.update({
    where: { id: card.id },
    data: updateData,
  });

  const outcome = await prisma.outcomeEvent.create({
    data: {
      companyId: card.companyId,
      actorType: "USER",
      actorId: input.actorId ?? undefined,
      actorEmail: input.actorEmail ?? undefined,
      entityType: "OPPORTUNITYCARD",
      entityId: card.id,
      outcomeType: input.action,
      outcomeValue: input.declineReason ?? input.action,
      annotation: annotation ?? undefined,
      beforeState: {
        processingStatus: card.processingStatus,
        activityState: card.activityState,
        kanbanColumn: card.kanbanColumn,
      } as Prisma.InputJsonValue,
      afterState: {
        processingStatus: updated.processingStatus,
        activityState: updated.activityState,
        kanbanColumn: updated.kanbanColumn,
      } as Prisma.InputJsonValue,
      payload: {
        idempotencyKey: idempotencyKey || null,
        feedbackId: feedback.id,
        issueNumber: 449,
        deliveryVersion: CUSTOMER_VALUE_DELIVERY_VERSION,
      } as Prisma.InputJsonValue,
      teachingWeight: input.action === "DECLINE" ? 100 : input.action === "MODIFY" ? 95 : 85,
    },
  });

  const memoryInput = mapOutcomeToMemory({
    action: input.action,
    declineReason: input.declineReason,
    annotation,
    title: updated.title,
    companyName: updated.companyName,
  });
  const memory = await prisma.memoryEntry.create({
    data: {
      companyId: card.companyId,
      scope: updated.versionFamilyId ? "ITEM_FAMILY" : "TOPIC",
      lessonType: memoryInput.lessonType,
      lessonContent: memoryInput.lessonContent || `Opportunity outcome ${input.action} recorded for ${updated.companyName}.`,
      weight: memoryInput.weight,
      topicHint: updated.opportunityType,
      itemFamilyId: updated.versionFamilyId ?? undefined,
      sourceEventId: outcome.id,
      sourceEventType: memoryInput.sourceEventType,
      expiresAt: input.action === "DECLINE" ? new Date(Date.now() + 180 * 24 * 60 * 60 * 1000) : undefined,
    },
  });

  return {
    ok: true as const,
    idempotent: false,
    companyId: card.companyId,
    opportunitycard: updated,
    feedback,
    outcomeEventId: outcome.id,
    learningImpact: memory,
  };
}

export async function getOpportunityLearningMemory(companyId: string) {
  const [lessons, recentOutcomes] = await Promise.all([
    prisma.memoryEntry.findMany({
      where: {
        companyId,
        active: true,
        sourceEventType: { in: ["OPPORTUNITY_ACCEPT", "OPPORTUNITY_DECLINE", "OPPORTUNITY_MODIFY", "OPPORTUNITY_REFRESH"] },
      },
      orderBy: [{ weight: "desc" }, { updatedAt: "desc" }],
      take: 50,
    }),
    prisma.outcomeEvent.findMany({
      where: {
        companyId,
        entityType: "OPPORTUNITYCARD",
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        entityId: true,
        outcomeType: true,
        outcomeValue: true,
        annotation: true,
        createdAt: true,
      },
    }),
  ]);

  const byLessonType = lessons.reduce<Record<string, number>>((acc, lesson) => {
    acc[lesson.lessonType] = (acc[lesson.lessonType] ?? 0) + 1;
    return acc;
  }, {});

  return {
    version: CUSTOMER_VALUE_DELIVERY_VERSION,
    companyId,
    generatedAt: new Date().toISOString(),
    summary: {
      totalLessons: lessons.length,
      byLessonType,
      recentOutcomes: recentOutcomes.length,
    },
    lessons,
    recentOutcomes,
    contracts: {
      writeApi: "POST /api/opportunitycards/:id/outcome",
      readApi: "GET /api/opportunitycards/learning-memory?companyId=:companyId",
      idempotency: "Pass Idempotency-Key or body.idempotencyKey to prevent duplicate outcome learning writes.",
    },
  };
}
