"use strict";

const RESOURCE_BANDS = Object.freeze({
  HEALTHY: "HEALTHY",
  CONSTRAINED: "CONSTRAINED",
  DEGRADED: "DEGRADED",
  CRITICAL: "CRITICAL",
});
const DEFAULT_HEALTHY_MIN_FREE_MB = 1500;
const DEFAULT_CONSTRAINED_MIN_FREE_MB = 1000;
const DEFAULT_DEGRADED_MIN_FREE_MB = 600;
const DEFAULT_FOREGROUND_HARD_PAUSE_MB = 256;
const DEFAULT_BACKGROUND_SNAPSHOT_HARD_PAUSE_MB = 1000;

function readPositiveIntegerEnv(name, fallback) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

const HEALTHY_MIN_FREE_MB = readPositiveIntegerEnv("CHECK_LOCAL_HEALTHY_MIN_FREE_MB", DEFAULT_HEALTHY_MIN_FREE_MB);
const CONSTRAINED_MIN_FREE_MB = Math.min(
  HEALTHY_MIN_FREE_MB,
  readPositiveIntegerEnv("CHECK_LOCAL_CONSTRAINED_MIN_FREE_MB", DEFAULT_CONSTRAINED_MIN_FREE_MB),
);
const DEGRADED_MIN_FREE_MB = Math.min(
  CONSTRAINED_MIN_FREE_MB,
  readPositiveIntegerEnv("CHECK_LOCAL_DEGRADED_MIN_FREE_MB", DEFAULT_DEGRADED_MIN_FREE_MB),
);
const FOREGROUND_HARD_PAUSE_MB = readPositiveIntegerEnv(
  "CHECK_LOCAL_FOREGROUND_HARD_PAUSE_MB",
  DEFAULT_FOREGROUND_HARD_PAUSE_MB,
);
const BACKGROUND_SNAPSHOT_HARD_PAUSE_MB = readPositiveIntegerEnv(
  "CHECK_LOCAL_BACKGROUND_SNAPSHOT_HARD_PAUSE_MB",
  DEFAULT_BACKGROUND_SNAPSHOT_HARD_PAUSE_MB,
);

function getFreeMemoryMb(osModule = require("os")) {
  return Math.round(osModule.freemem() / (1024 * 1024));
}

function getResourceBand(freeMemMb) {
  const free = Number(freeMemMb || 0);
  if (free >= HEALTHY_MIN_FREE_MB) return RESOURCE_BANDS.HEALTHY;
  if (free >= CONSTRAINED_MIN_FREE_MB) return RESOURCE_BANDS.CONSTRAINED;
  if (free >= DEGRADED_MIN_FREE_MB) return RESOURCE_BANDS.DEGRADED;
  return RESOURCE_BANDS.CRITICAL;
}

function shouldAllowForegroundWork(freeMemMb) {
  const band = getResourceBand(freeMemMb);
  return {
    allowed: Number(freeMemMb || 0) >= FOREGROUND_HARD_PAUSE_MB,
    band,
  };
}

function shouldAllowBackgroundSnapshotWork(freeMemMb) {
  const band = getResourceBand(freeMemMb);
  return {
    allowed: Number(freeMemMb || 0) >= BACKGROUND_SNAPSHOT_HARD_PAUSE_MB,
    band,
  };
}

module.exports = {
  RESOURCE_BANDS,
  getFreeMemoryMb,
  getResourceBand,
  HEALTHY_MIN_FREE_MB,
  CONSTRAINED_MIN_FREE_MB,
  DEGRADED_MIN_FREE_MB,
  FOREGROUND_HARD_PAUSE_MB,
  BACKGROUND_SNAPSHOT_HARD_PAUSE_MB,
  shouldAllowForegroundWork,
  shouldAllowBackgroundSnapshotWork,
};
