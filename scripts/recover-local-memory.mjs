#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import http from "node:http";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

const execute = process.argv.includes("--execute");
const restartStatusServer = process.argv.includes("--restart-status-server");
const outDirArgIndex = process.argv.indexOf("--outDir");
const outDir = outDirArgIndex >= 0 && process.argv[outDirArgIndex + 1]
  ? process.argv[outDirArgIndex + 1]
  : "logs/audits/local-delivery-recovery";
const STATUS_SERVER_RESTART_MIN_RSS_MB = 512;

function freeMemMb() {
  return Math.round(os.freemem() / 1024 / 1024);
}

function parsePs() {
  const output = execFileSync("ps", ["-axo", "pid,ppid,rss,comm,args"], {
    encoding: "utf8",
  });
  const lines = output.trim().split("\n").slice(1);
  return lines
    .map((line) => {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
      if (!match) return null;
      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        rssKb: Number(match[3]),
        rssMb: Math.round(Number(match[3]) / 1024),
        command: match[4],
        args: match[5],
      };
    })
    .filter(Boolean);
}

function isOllamaRunner(processInfo) {
  return /\bollama runner --model\b/.test(processInfo.args);
}

function isOversizedStatusServer(processInfo) {
  return (
    /\bcheck-local-status\b/.test(processInfo.args) &&
    processInfo.rssMb >= STATUS_SERVER_RESTART_MIN_RSS_MB
  );
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function terminateRunner(runner) {
  if (!isAlive(runner.pid)) {
    return { pid: runner.pid, signal: null, status: "already_exited" };
  }

  process.kill(runner.pid, "SIGTERM");
  await sleep(1500);

  if (!isAlive(runner.pid)) {
    return { pid: runner.pid, signal: "SIGTERM", status: "terminated" };
  }

  process.kill(runner.pid, "SIGKILL");
  await sleep(500);

  return {
    pid: runner.pid,
    signal: "SIGKILL",
    status: isAlive(runner.pid) ? "still_alive" : "terminated",
  };
}

function postForce(port, name) {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path: "/force", method: "POST", timeout: 3000 },
      (res) => {
        res.resume();
        resolve({ name, port, ok: res.statusCode >= 200 && res.statusCode < 300, statusCode: res.statusCode });
      },
    );
    req.on("error", (error) => resolve({ name, port, ok: false, error: error.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ name, port, ok: false, error: "timeout" });
    });
    req.end();
  });
}

async function main() {
  const beforeFreeMemMb = freeMemMb();
  const processes = parsePs();
  const ollamaRunners = processes.filter(isOllamaRunner);
  const oversizedStatusServers = processes.filter(isOversizedStatusServer);
  const topConsumers = processes
    .slice()
    .sort((a, b) => b.rssKb - a.rssKb)
    .slice(0, 12)
    .map((item) => ({
      pid: item.pid,
      rssMb: item.rssMb,
      command: item.command,
      role: isOllamaRunner(item)
        ? "evictable_ollama_runner"
        : isOversizedStatusServer(item)
          ? "restartable_status_server"
          : "observe_only",
    }));

  const actions = [];
  if (execute) {
    for (const runner of ollamaRunners) {
      actions.push({ target: "ollama_runner", ...(await terminateRunner(runner)) });
    }
    if (restartStatusServer) {
      for (const statusServer of oversizedStatusServers) {
        actions.push({ target: "status_server", ...(await terminateRunner(statusServer)) });
      }
    }
  }

  const afterEvictionFreeMemMb = freeMemMb();
  const wakeResults = execute
    ? await Promise.all([
        postForce(10005, "foreground"),
        postForce(10007, "snapshot"),
      ])
    : [];

  await sleep(execute ? 2000 : 0);

  const report = {
    generatedAt: new Date().toISOString(),
    mode: execute ? "execute" : "dry_run",
    beforeFreeMemMb,
    afterFreeMemMb: freeMemMb(),
    afterEvictionFreeMemMb,
    evictableOllamaRunners: ollamaRunners.map((runner) => ({
      pid: runner.pid,
      rssMb: runner.rssMb,
      command: runner.command,
    })),
    oversizedStatusServers: oversizedStatusServers.map((statusServer) => ({
      pid: statusServer.pid,
      rssMb: statusServer.rssMb,
      command: statusServer.command,
    })),
    actions,
    wakeResults,
    topConsumers,
    recommendation: ollamaRunners.length
      ? execute
        ? "Ollama runners were evicted and CHECK workers were woken."
        : "Run with --execute to evict only ollama runner processes and wake CHECK workers."
      : oversizedStatusServers.length && !restartStatusServer
        ? "Run with --execute --restart-status-server to restart oversized stateless status-server processes and wake CHECK workers."
        : "No ollama runner process was present; inspect topConsumers and OS memory pressure.",
  };

  mkdirSync(outDir, { recursive: true });
  const reportPath = join(outDir, `memory-recovery-${Date.now()}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
