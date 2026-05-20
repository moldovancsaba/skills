const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const LOCK_DIR = path.join(__dirname, "..", "..", "..", "logs");
const LOCK_FILE = path.join(LOCK_DIR, "local-ai-foreground-worker.lock");
const LOCK_TTL_MS = 90 * 1000;
const LOCK_RENEW_INTERVAL_MS = 15 * 1000;

function createLockOwner() {
  return {
    ownerId: crypto.randomUUID(),
    pid: process.pid,
    hostname: os.hostname(),
    startedAt: new Date().toISOString(),
  };
}

function buildLockPayload(owner, extra = {}) {
  return JSON.stringify(
    {
      ...owner,
      renewedAt: new Date().toISOString(),
      mode: "LINEAR_SINGLETON",
      ...extra,
    },
    null,
    2,
  );
}

async function ensureLockDir() {
  await fs.mkdir(LOCK_DIR, { recursive: true });
}

async function readLockPayload() {
  try {
    const raw = await fs.readFile(LOCK_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isLockFresh(payload, now = Date.now()) {
  const renewedAtMs = payload?.renewedAt ? new Date(payload.renewedAt).getTime() : 0;
  return Number.isFinite(renewedAtMs) && renewedAtMs > 0 && now - renewedAtMs < LOCK_TTL_MS;
}

async function writeExclusiveLock(owner, extra = {}) {
  const handle = await fs.open(LOCK_FILE, "wx");
  try {
    await handle.writeFile(buildLockPayload(owner, extra), "utf8");
  } finally {
    await handle.close();
  }
}

async function acquireLinearWorkerLock(owner, extra = {}) {
  await ensureLockDir();

  try {
    await writeExclusiveLock(owner, extra);
    return { acquired: true, staleReclaimed: false, holder: owner };
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }

  const existing = await readLockPayload();
  if (existing && isLockFresh(existing)) {
    return { acquired: false, staleReclaimed: false, holder: existing };
  }

  try {
    await fs.unlink(LOCK_FILE);
  } catch {}

  await writeExclusiveLock(owner, extra);
  return { acquired: true, staleReclaimed: true, holder: owner };
}

async function renewLinearWorkerLock(owner, extra = {}) {
  const existing = await readLockPayload();
  if (!existing || existing.ownerId !== owner.ownerId) {
    return false;
  }
  await fs.writeFile(LOCK_FILE, buildLockPayload(owner, extra), "utf8");
  return true;
}

async function releaseLinearWorkerLock(owner) {
  const existing = await readLockPayload();
  if (!existing || existing.ownerId !== owner.ownerId) {
    return false;
  }
  await fs.unlink(LOCK_FILE).catch(() => {});
  return true;
}

module.exports = {
  LOCK_TTL_MS,
  LOCK_RENEW_INTERVAL_MS,
  LOCK_FILE,
  createLockOwner,
  acquireLinearWorkerLock,
  renewLinearWorkerLock,
  releaseLinearWorkerLock,
};
