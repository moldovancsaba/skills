const PIPELINE_JOB_DEFAULT_BLOCK = Object.freeze({
  DESTINATION_MISSION_DAEMON: "miniapp",
  MINE_OPPORTUNITYCARDS: "sales",
  SEARCH_OPPORTUNITYCARDS: "sales",
  REFRESH_OPPORTUNITYCARDS: "sales",
});

const PIPELINE_JOB_DEFAULT_MODULE = Object.freeze({
  DESTINATION_MISSION_DAEMON: "miniapp",
  MINE_OPPORTUNITYCARDS: "sales",
  SEARCH_OPPORTUNITYCARDS: "sales",
  REFRESH_OPPORTUNITYCARDS: "sales",
  FEEDBACK_RECONCILIATION: "review",
  CARD_RESCORING: "aiQueue",
  FRONTIER_RECOMPUTE: "aiQueue",
  SCORE_ALERT_REPAIR: "aiQueue",
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readJobMetadata(job) {
  return isPlainObject(job?.metadata) ? job.metadata : {};
}

function normalizePipelineJobStatus(status, metadata = {}) {
  const normalizedStatus = String(status || "").toUpperCase();
  const attemptCount = Number(metadata.attemptCount ?? 0);

  if (normalizedStatus === "RUNNING") return "running";
  if (normalizedStatus === "FAILED") return metadata.retryable === true ? "retrying" : "failed";
  if (normalizedStatus === "PAUSED") return "cancelled";
  if (normalizedStatus === "ACTIVE") {
    if (attemptCount > 0) return "retrying";
    return "queued";
  }
  return "queued";
}

function resolvePipelineJobAttribution(job) {
  const metadata = readJobMetadata(job);
  const blockId = typeof metadata.blockId === "string" && metadata.blockId
    ? metadata.blockId
    : (PIPELINE_JOB_DEFAULT_BLOCK[job?.jobType] || "checklist");
  const moduleId = typeof metadata.moduleId === "string" && metadata.moduleId
    ? metadata.moduleId
    : (PIPELINE_JOB_DEFAULT_MODULE[job?.jobType] || "aiQueue");
  const declaredMiniappId = typeof metadata.miniappId === "string"
    ? metadata.miniappId
    : (typeof metadata.miniappKey === "string" ? metadata.miniappKey : "");
  const normalizedDeclaredMiniappId = declaredMiniappId.trim().toLowerCase();
  const destinationKey = typeof metadata.destinationKey === "string"
    ? metadata.destinationKey.trim().toLowerCase()
    : "";
  const activeDestinationKeys = Array.isArray(metadata.activeDestinationKeys)
    ? metadata.activeDestinationKeys
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean)
    : [];
  const inferredMiniappId = destinationKey === "classscout" || destinationKey === "compare"
    ? destinationKey
    : (activeDestinationKeys.length === 1 && (activeDestinationKeys[0] === "classscout" || activeDestinationKeys[0] === "compare")
      ? activeDestinationKeys[0]
      : null);
  const miniappId = normalizedDeclaredMiniappId
    ? normalizedDeclaredMiniappId
    : (inferredMiniappId || (blockId === "miniapp" ? "classscout" : null));

  return {
    unitId: job?.companyId || null,
    blockId,
    moduleId,
    cardId: typeof metadata.cardId === "string" ? metadata.cardId : null,
    cardType: typeof metadata.cardType === "string" ? metadata.cardType : null,
    miniappId,
  };
}

function buildLocalJobEnvelopeFromPipelineJob(job) {
  const metadata = readJobMetadata(job);
  const attribution = resolvePipelineJobAttribution(job);
  const operation = String(job?.jobType || "UNKNOWN");

  return {
    id: job?.id || null,
    unitId: attribution.unitId,
    blockId: attribution.blockId,
    moduleId: attribution.moduleId,
    cardId: attribution.cardId,
    cardType: attribution.cardType,
    miniappId: attribution.miniappId,
    operation,
    idempotencyKey: `${job?.companyId || "unknown"}:${operation}:${job?.entityType || "COMPANY"}:${job?.entityId || "company"}`,
    status: normalizePipelineJobStatus(job?.status, {
      attemptCount: job?.attemptCount,
      retryable: metadata.retryable,
    }),
    attempt: Number(job?.attemptCount || 0),
    maxAttempts: Number(metadata.maxAttempts || 3),
    timeoutMs: Number(metadata.timeoutMs || 0),
    nextRunAt: job?.scheduledAt || null,
    lastError: job?.lastError || null,
    createdAt: job?.createdAt || null,
    updatedAt: job?.updatedAt || null,
  };
}

module.exports = {
  PIPELINE_JOB_DEFAULT_BLOCK,
  PIPELINE_JOB_DEFAULT_MODULE,
  normalizePipelineJobStatus,
  resolvePipelineJobAttribution,
  buildLocalJobEnvelopeFromPipelineJob,
};
