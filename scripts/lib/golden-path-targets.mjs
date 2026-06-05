const ENV_TARGETS = Object.freeze({
  classscout: "CHECK_GOLDEN_PATH_CLASSSCOUT_COMPANY_ID",
  compare: "CHECK_GOLDEN_PATH_COMPARE_COMPANY_ID",
});

export class GoldenPathTargetError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "GoldenPathTargetError";
    this.code = details.code || "GOLDEN_PATH_TARGET_ERROR";
    this.visitorKey = details.visitorKey || null;
    this.usage = details.usage || null;
    this.candidates = Array.isArray(details.candidates) ? details.candidates : [];
  }
}

function normalizeVisitorKey(visitorKey) {
  const key = String(visitorKey || "").trim().toLowerCase();
  if (key !== "classscout" && key !== "compare") {
    throw new GoldenPathTargetError(`Unsupported golden-path visitor key: ${visitorKey}`, {
      code: "UNSUPPORTED_VISITOR_KEY",
      visitorKey: key,
    });
  }
  return key;
}

function usageFor(visitorKey) {
  return `npm run verify:${visitorKey}-golden-path -- --companyId <companyId> --strict --outDir logs`;
}

async function scoreDestinationTarget(prisma, instance) {
  const [missionRuns, reviewPackets, approvedPackets, sourceDocuments, candidates, snapshot] = await Promise.all([
    prisma.destinationMissionRun.count({
      where: { companyId: instance.companyId, destinationInstanceId: instance.id },
    }),
    prisma.destinationReviewPacket.count({
      where: { companyId: instance.companyId, destinationInstanceId: instance.id },
    }),
    prisma.destinationReviewPacket.count({
      where: { companyId: instance.companyId, destinationInstanceId: instance.id, packetState: "APPROVED" },
    }),
    prisma.destinationSourceDocument.count({
      where: { companyId: instance.companyId, destinationInstanceId: instance.id },
    }),
    prisma.destinationCandidate.count({
      where: { companyId: instance.companyId, destinationInstanceId: instance.id },
    }),
    prisma.intelligenceSnapshot.findUnique({
      where: { companyId: instance.companyId },
      select: { webappProjection: true },
    }),
  ]);

  const projection = snapshot?.webappProjection && typeof snapshot.webappProjection === "object"
    ? snapshot.webappProjection
    : null;
  const projectionGeneratedAt = typeof projection?.generatedAt === "string" ? projection.generatedAt : null;
  const score =
    missionRuns * 10
    + approvedPackets * 8
    + reviewPackets * 4
    + sourceDocuments * 3
    + candidates
    + (projectionGeneratedAt ? 2 : 0);

  return {
    companyId: instance.companyId,
    companyName: null,
    destinationInstanceId: instance.id,
    missionRuns,
    reviewPackets,
    approvedPackets,
    sourceDocuments,
    candidates,
    projectionGeneratedAt,
    score,
  };
}

export async function resolveGoldenPathTarget(prisma, visitorKeyInput, args = {}) {
  const visitorKey = normalizeVisitorKey(visitorKeyInput);
  const explicitCompanyId = String(args.companyId || "").trim();
  if (explicitCompanyId) {
    return {
      visitorKey,
      companyId: explicitCompanyId,
      source: "argument",
      usage: usageFor(visitorKey),
      candidates: [],
    };
  }

  const envKey = ENV_TARGETS[visitorKey];
  const envCompanyId = String(process.env[envKey] || "").trim();
  if (envCompanyId) {
    return {
      visitorKey,
      companyId: envCompanyId,
      source: "configured_default",
      configuredBy: envKey,
      usage: usageFor(visitorKey),
      candidates: [],
    };
  }

  const instances = await prisma.destinationInstance.findMany({
    where: {
      destinationKey: visitorKey,
      isActive: true,
    },
    select: {
      id: true,
      companyId: true,
    },
  });

  if (instances.length === 0) {
    throw new GoldenPathTargetError(
      `No active ${visitorKey} destination instance found. Provide an explicit company id.`,
      {
        code: "MISSING_GOLDEN_PATH_TARGET",
        visitorKey,
        usage: usageFor(visitorKey),
      },
    );
  }

  const candidates = await Promise.all(instances.map((instance) => scoreDestinationTarget(prisma, instance)));
  candidates.sort((left, right) => right.score - left.score || left.companyId.localeCompare(right.companyId));
  const selected = candidates[0];
  if (!selected?.companyId) {
    throw new GoldenPathTargetError(
      `Unable to resolve a ${visitorKey} golden-path company id. Provide an explicit company id.`,
      {
        code: "MISSING_GOLDEN_PATH_TARGET",
        visitorKey,
        usage: usageFor(visitorKey),
        candidates,
      },
    );
  }

  return {
    visitorKey,
    companyId: selected.companyId,
    source: "resolver",
    usage: usageFor(visitorKey),
    candidates,
    selected,
  };
}
