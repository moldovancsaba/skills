"use strict";

const fs = require("fs");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const DEFAULT_LOG_MAX_BYTES = 50 * 1024 * 1024;
const DEFAULT_LOG_RETENTION = 5;

function parseVmStat(output) {
  const text = String(output || "");
  const pageSizeMatch = text.match(/page size of (\d+) bytes/i);
  const pageSize = pageSizeMatch ? Number(pageSizeMatch[1]) : 16384;
  const pages = {};

  for (const line of text.split("\n")) {
    const match = line.match(/^"?([^":]+)"?:\s+([0-9.]+)\.?$/);
    if (!match) continue;
    const key = match[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    pages[key] = Number(match[2]);
  }

  function mb(key) {
    return Math.round(Number(pages[key] || 0) * pageSize / (1024 * 1024));
  }

  const accounting = {
    pageSize,
    freeMb: mb("pages_free"),
    activeMb: mb("pages_active"),
    inactiveMb: mb("pages_inactive"),
    speculativeMb: mb("pages_speculative"),
    wiredMb: mb("pages_wired_down"),
    purgeableMb: mb("pages_purgeable"),
    fileBackedMb: mb("file_backed_pages"),
    anonymousMb: mb("anonymous_pages"),
    compressedMb: mb("pages_occupied_by_compressor"),
    compressorStoredMb: mb("pages_stored_in_compressor"),
    pageouts: Number(pages.pageouts || 0),
    swapouts: Number(pages.swapouts || 0),
  };
  accounting.reclaimableEstimateMb = Math.round(
    accounting.freeMb
    + accounting.speculativeMb
    + accounting.purgeableMb
    + accounting.inactiveMb * 0.5
    + accounting.fileBackedMb * 0.25,
  );
  accounting.pressureSummary = accounting.swapouts > 0 || accounting.pageouts > 100000
    ? "critical"
    : accounting.reclaimableEstimateMb >= 1500 ? "healthy" : accounting.reclaimableEstimateMb >= 700 ? "watch" : "critical";
  return accounting;
}

async function collectMacMemoryAccounting() {
  const { stdout } = await execFileAsync("vm_stat", [], { timeout: 3000, maxBuffer: 256 * 1024 });
  return parseVmStat(stdout);
}

function rotateLogFile(filePath, options = {}) {
  const maxBytes = Number(options.maxBytes || DEFAULT_LOG_MAX_BYTES);
  const retention = Number(options.retention || DEFAULT_LOG_RETENTION);
  const mode = options.mode === "copytruncate" ? "copytruncate" : "rename";
  if (!fs.existsSync(filePath)) return { rotated: false, reason: "missing", sizeBytes: 0 };
  const stat = fs.statSync(filePath);
  if (stat.size < maxBytes) return { rotated: false, reason: "below-threshold", sizeBytes: stat.size };

  for (let index = retention - 1; index >= 1; index -= 1) {
    const source = `${filePath}.${index}`;
    const target = `${filePath}.${index + 1}`;
    if (fs.existsSync(source)) {
      if (index + 1 > retention) fs.unlinkSync(source);
      else fs.renameSync(source, target);
    }
  }
  if (mode === "copytruncate") {
    fs.copyFileSync(filePath, `${filePath}.1`);
    fs.truncateSync(filePath, 0);
    return { rotated: true, reason: "threshold-exceeded", mode, sizeBytes: stat.size, rotatedTo: `${filePath}.1` };
  }

  fs.renameSync(filePath, `${filePath}.1`);
  fs.writeFileSync(filePath, "");
  return { rotated: true, reason: "threshold-exceeded", mode, sizeBytes: stat.size, rotatedTo: `${filePath}.1` };
}

function buildLogPressure(files, options = {}) {
  return files.map((filePath) => {
    const sizeBytes = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
    return {
      path: filePath,
      filePath,
      name: filePath.split("/").pop(),
      sizeBytes,
      sizeMb: Math.round(sizeBytes / (1024 * 1024)),
      overLimit: sizeBytes >= Number(options.maxBytes || DEFAULT_LOG_MAX_BYTES),
      needsRotation: sizeBytes >= Number(options.maxBytes || DEFAULT_LOG_MAX_BYTES),
    };
  });
}

module.exports = {
  DEFAULT_LOG_MAX_BYTES,
  DEFAULT_LOG_RETENTION,
  buildLogPressure,
  collectMacMemoryAccounting,
  parseVmStat,
  rotateLogFile,
};
