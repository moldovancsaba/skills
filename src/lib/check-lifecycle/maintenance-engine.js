const {
  getDestinationMissionKinds,
  getDestinationTopology,
  getUnitLifecycleRequirements,
  listLifecycleDestinationKeys,
} = require("./topology-registry");
const {
  buildDestinationDaemonLane,
  buildLifecycleTelemetry,
  buildMaintenanceDiff,
} = require("./lifecycle-spine");
const { syncCompanyPipelineJobs } = require("../pipeline-queue");

function getDefaultRulebookPolicyForDestination(destinationKey) {
  if (destinationKey === "compare") {
    return {
      version: "compare-visitor-rulebook@v1",
      executionMode: "manual",
      minimumScarcityScore: 70,
      allowedListingTypes: [
        "Shooting Ranges",
        "Sport Shooting Clubs",
        "Shooting Courses",
        "Competitions",
        "Hunting Associations",
        "Hunting Courses",
        "Hunting Expos",
      ],
      requireOfficialSource: true,
      requireImgBbImage: false,
      requireRecurringProgramsWhenAvailable: false,
      maxCandidatesPerMission: 12,
      maxDomainRetries: 2,
      maxContinuousPasses: 3,
      stopCondition: "one_live_verified_listing",
    };
  }

  return {
    version: "classscout-rulebook@v1",
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
  };
}

function missionDefinitionName(destinationKey, missionKind) {
  const topology = getDestinationTopology(destinationKey);
  const label = topology?.label || destinationKey;
  return missionKind === "VISITOR_CONTENT_CURATION"
    ? `${label} Visitor Autopilot`
    : `${label} Mission Autopilot`;
}

function defaultMissionConfig(destinationKey) {
  const rulebookPolicy = getDefaultRulebookPolicyForDestination(destinationKey);
  return {
    version: "lifecycle-maintenance@v1",
    listingTypeScope: [...rulebookPolicy.allowedListingTypes],
    executionPolicy: {
      mode: "autopilot",
      cadence: "scheduled",
      cronEnabled: true,
      requireHumanPublishApproval: false,
    },
    rulebookPolicy: {
      ...rulebookPolicy,
      executionMode: "autopilot",
    },
    qualityGates: {
      requireSourceEvidence: true,
      requireReviewPacket: true,
      requirePublicVerification: true,
      requireFeedbackPolicy: destinationKey === "compare",
    },
  };
}

function unique(values) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

async function ensureDestinationInstance(prisma, companyId, destinationKey) {
  const existing = await prisma.destinationInstance.findFirst({
    where: { companyId, destinationKey, isActive: true },
    orderBy: { updatedAt: "desc" },
  });
  if (existing) return { instance: existing, status: "skipped" };

  const instance = await prisma.destinationInstance.create({
    data: {
      companyId,
      destinationKey,
      name: getDestinationTopology(destinationKey)?.label || destinationKey,
      authRef: "ingest-secret-managed",
      isActive: true,
      config: {},
    },
  });
  return { instance, status: "created" };
}

async function ensureMissionDefinition(prisma, input) {
  const existing = await prisma.destinationMissionDefinition.findFirst({
    where: {
      companyId: input.companyId,
      destinationKey: input.destinationKey,
      missionKind: input.missionKind,
      status: "active",
    },
    select: { id: true, name: true, configJson: true },
    orderBy: { updatedAt: "desc" },
  });
  if (existing) {
    const config = existing.configJson && typeof existing.configJson === "object" && !Array.isArray(existing.configJson)
      ? existing.configJson
      : {};
    const requiredConfig = defaultMissionConfig(input.destinationKey);
    const hasRulebookPolicy = config.rulebookPolicy && typeof config.rulebookPolicy === "object";
    const hasListingTypeScope = Array.isArray(config.listingTypeScope) && config.listingTypeScope.length > 0;
    if (!hasRulebookPolicy || !hasListingTypeScope) {
      const nextConfig = {
        ...requiredConfig,
        ...config,
        listingTypeScope: hasListingTypeScope ? config.listingTypeScope : requiredConfig.listingTypeScope,
        rulebookPolicy: hasRulebookPolicy ? config.rulebookPolicy : requiredConfig.rulebookPolicy,
      };
      return {
        definition: await prisma.destinationMissionDefinition.update({
          where: { id: existing.id },
          data: {
            configJson: nextConfig,
            metadata: {
              source: "maintenance-engine",
              repairedConfigAt: new Date().toISOString(),
            },
            updatedBy: input.actorId,
          },
        }),
        status: "repaired",
      };
    }
    return { definition: existing, status: "skipped" };
  }

  const definition = await prisma.destinationMissionDefinition.create({
    data: {
      companyId: input.companyId,
      destinationInstanceId: input.destinationInstanceId,
      destinationKey: input.destinationKey,
      missionKind: input.missionKind,
      name: missionDefinitionName(input.destinationKey, input.missionKind),
      status: "active",
      configJson: defaultMissionConfig(input.destinationKey),
      metadata: {
        source: "maintenance-engine",
        repairedAt: new Date().toISOString(),
      },
      createdBy: input.actorId,
      updatedBy: input.actorId,
    },
  });

  const revision = await prisma.destinationMissionDefinitionRevision.create({
    data: {
      companyId: input.companyId,
      destinationInstanceId: input.destinationInstanceId,
      missionDefinitionId: definition.id,
      version: 1,
      configJson: defaultMissionConfig(input.destinationKey),
      metadata: { source: "maintenance-engine" },
      createdBy: input.actorId,
    },
  });

  return {
    definition: await prisma.destinationMissionDefinition.update({
      where: { id: definition.id },
      data: { activeRevisionId: revision.id },
    }),
    status: "created",
  };
}

async function retireStaleDestinationRuns(prisma, input) {
  if (input.destinationKey !== "compare") return [];
  const runs = await prisma.destinationMissionRun.findMany({
    where: {
      companyId: input.companyId,
      destinationKey: input.destinationKey,
      state: {
        in: ["QUEUED", "CATALOG_INSPECTED", "DISCOVERING", "FAILED_RECOVERABLE", "CANDIDATE_IN_REVIEW", "PUBLISHING", "PAUSED"],
      },
    },
    include: {
      policySnapshot: true,
    },
  });
  const staleRuns = runs.filter((run) => {
    const policy = run.policySnapshot?.policyJson;
    return policy && typeof policy === "object" && !Array.isArray(policy)
      && policy.version === "classscout-rulebook@v1";
  });
  if (staleRuns.length === 0) return [];

  await prisma.destinationMissionRun.updateMany({
    where: { id: { in: staleRuns.map((run) => run.id) } },
    data: {
      state: "FAILED_TERMINAL",
      failureCode: "stale_destination_policy_snapshot",
      failureDetail: "Run retired because Compare was using legacy ClassScout rulebook defaults.",
      updatedAt: new Date(),
    },
  });

  return staleRuns.map((run) => ({
    id: `mission-run:${run.id}`,
    status: "repaired",
    summary: "Retired stale Compare mission run that used ClassScout rulebook defaults.",
    metadata: { missionRunId: run.id },
  }));
}

async function inferActiveDestinationKeys(prisma, companyId) {
  const [instances, definitions] = await Promise.all([
    prisma.destinationInstance.findMany({
      where: { companyId, isActive: true },
      select: { destinationKey: true },
    }),
    prisma.destinationMissionDefinition.findMany({
      where: { companyId, status: "active" },
      select: { destinationKey: true },
    }),
  ]);
  const supported = new Set(listLifecycleDestinationKeys());
  return unique([...instances, ...definitions].map((item) => item.destinationKey))
    .filter((destinationKey) => supported.has(destinationKey));
}

async function maintainCompanyLifecycle(prisma, input) {
  const companyId = typeof input === "string" ? input : input.companyId;
  const actorId = typeof input === "string" ? "maintenance-engine" : input.actorId || "maintenance-engine";
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true } });
  if (!company) {
    return {
      ok: false,
      companyId,
      state: "not_found",
      steps: [],
    };
  }

  const destinationKeys = await inferActiveDestinationKeys(prisma, companyId);
  const steps = [];
  for (const destinationKey of destinationKeys) {
    const { instance, status } = await ensureDestinationInstance(prisma, companyId, destinationKey);
    steps.push({
      id: `destination:${destinationKey}`,
      status,
      summary: `${status === "created" ? "Created" : "Verified"} active ${destinationKey} destination instance.`,
      metadata: { destinationInstanceId: instance.id },
    });

    for (const missionKind of getDestinationMissionKinds(destinationKey)) {
      const result = await ensureMissionDefinition(prisma, {
        companyId,
        destinationKey,
        missionKind,
        destinationInstanceId: instance.id,
        actorId,
      });
      steps.push({
        id: `mission:${destinationKey}:${missionKind}`,
        status: result.status,
        summary: `${result.status === "created" ? "Created" : "Verified"} active ${missionKind} mission for ${destinationKey}.`,
        metadata: { missionDefinitionId: result.definition.id },
      });
    }
    steps.push(...await retireStaleDestinationRuns(prisma, { companyId, destinationKey }));
  }

  const jobs = await syncCompanyPipelineJobs(prisma, companyId);
  const daemonJobs = await prisma.pipelineJob.findMany({
    where: { companyId, jobType: "DESTINATION_MISSION_DAEMON" },
    select: { id: true, entityType: true, entityId: true, status: true, metadata: true },
  });
  const requirements = getUnitLifecycleRequirements({ destinationKeys });
  const lifecycleHealth = buildMaintenanceDiff({
    destinationKeys,
    existingPipelineJobs: jobs.map((job) => job.jobType).filter(Boolean),
    existingMissionKinds: requirements.requiredMissionKinds,
  });
  const daemonLane = buildDestinationDaemonLane({
    destinationKeys,
    activeDefinitionIds: steps
      .map((step) => step.metadata && step.metadata.missionDefinitionId)
      .filter(Boolean),
  });

  return {
    ok: true,
    company,
    state: "healthy_or_repaired",
    destinationKeys,
    requiredPipelineJobs: requirements.requiredPipelineJobs,
    requiredMissionKinds: requirements.requiredMissionKinds,
    jobCount: jobs.length,
    daemonJobs,
    daemonLane,
    lifecycleHealth,
    telemetry: buildLifecycleTelemetry("LIFECYCLE_MAINTENANCE_RUN", {
      companyId,
      destinationKeys,
      reasonCode: lifecycleHealth.reasonCode,
      recovered: lifecycleHealth.metrics.repaired > 0,
      metrics: lifecycleHealth.metrics,
    }),
    steps,
  };
}

async function maintainLifecycleShard(prisma, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit || 5), 25));
  const companies = await prisma.company.findMany({
    select: { id: true, name: true },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });
  const results = [];
  for (const company of companies) {
    results.push(await maintainCompanyLifecycle(prisma, {
      companyId: company.id,
      actorId: options.actorId || "maintenance-engine",
    }));
  }
  return {
    ok: true,
    inspected: companies.length,
    repairedOrVerified: results.filter((item) => item.ok).length,
    results,
  };
}

module.exports = {
  maintainCompanyLifecycle,
  maintainLifecycleShard,
};
