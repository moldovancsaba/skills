const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const DEFAULT_FOCUS_REASON = "Local AI focus mode is restricted to configured destination work.";

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readLocalAiFocusPolicy(env = process.env) {
  const destinationKeys = splitCsv(env.CHECK_LOCAL_FOCUS_DESTINATION_KEYS);
  const enabled = TRUE_VALUES.has(String(env.CHECK_LOCAL_FOCUS_ENABLED || "").trim().toLowerCase()) && destinationKeys.length > 0;
  return {
    enabled,
    destinationKeys,
    reason: String(env.CHECK_LOCAL_FOCUS_REASON || DEFAULT_FOCUS_REASON).trim() || DEFAULT_FOCUS_REASON,
  };
}

function collectStringSet(target, values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      target.add(value.trim().toLowerCase());
    } else if (Array.isArray(value)) {
      collectStringSet(target, value);
    }
  }
}

function getLocalAiJobDestinationKeys(job) {
  const metadata = isPlainObject(job?.metadata) ? job.metadata : {};
  const playlist = isPlainObject(metadata.playlist) ? metadata.playlist : {};
  const target = isPlainObject(metadata.target) ? metadata.target : {};
  const visitorIntent = isPlainObject(metadata.visitorIntent) ? metadata.visitorIntent : {};
  const keys = new Set();

  collectStringSet(keys, [
    metadata.destinationKey,
    metadata.miniappKey,
    metadata.destinationKeys,
    metadata.activeDestinationKeys,
    metadata.serviceLane,
    metadata.serviceLanes,
    playlist.miniappKey,
    playlist.miniappId,
    target.destinationKey,
    visitorIntent.destinationKey,
    visitorIntent.visitorKey,
  ]);

  return Array.from(keys);
}

function isPipelineJobAllowedByLocalAiFocus(job, policy = readLocalAiFocusPolicy()) {
  if (!policy.enabled) return true;
  const allowed = new Set(policy.destinationKeys);
  return getLocalAiJobDestinationKeys(job).some((key) => allowed.has(key));
}

function buildLocalAiFocusBlockMessage(job, policy = readLocalAiFocusPolicy()) {
  const jobId = job?.id || "unknown";
  const jobType = job?.jobType || "UNKNOWN";
  const scope = getLocalAiJobDestinationKeys(job).join(",") || "unscoped";
  const allowed = policy.destinationKeys.join(",") || "none";
  return `${policy.reason} Blocked ${jobType} ${jobId} with scope ${scope}; allowed destination scope: ${allowed}.`;
}

function filterDestinationKeysForLocalAiFocus(destinationKeys, policy = readLocalAiFocusPolicy()) {
  const keys = Array.from(new Set((destinationKeys || []).map((key) => String(key || "").trim().toLowerCase()).filter(Boolean)));
  if (!policy.enabled) return keys;
  const allowed = new Set(policy.destinationKeys);
  return keys.filter((key) => allowed.has(key));
}

module.exports = {
  readLocalAiFocusPolicy,
  getLocalAiJobDestinationKeys,
  isPipelineJobAllowedByLocalAiFocus,
  buildLocalAiFocusBlockMessage,
  filterDestinationKeysForLocalAiFocus,
};
