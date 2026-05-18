"use strict";

const RESOURCE_BANDS = Object.freeze({
  HEALTHY: "HEALTHY",
  CONSTRAINED: "CONSTRAINED",
  DEGRADED: "DEGRADED",
  CRITICAL: "CRITICAL",
});
const FOREGROUND_HARD_PAUSE_MB = 256;

function getFreeMemoryMb(osModule = require("os")) {
  return Math.round(osModule.freemem() / (1024 * 1024));
}

function getResourceBand(freeMemMb) {
  const free = Number(freeMemMb || 0);
  if (free >= 1500) return RESOURCE_BANDS.HEALTHY;
  if (free >= 1000) return RESOURCE_BANDS.CONSTRAINED;
  if (free >= 600) return RESOURCE_BANDS.DEGRADED;
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
    allowed: band === RESOURCE_BANDS.HEALTHY,
    band,
  };
}

module.exports = {
  RESOURCE_BANDS,
  getFreeMemoryMb,
  getResourceBand,
  FOREGROUND_HARD_PAUSE_MB,
  shouldAllowForegroundWork,
  shouldAllowBackgroundSnapshotWork,
};
