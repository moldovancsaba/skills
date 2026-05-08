import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const PORT = 3105;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const COMPANY_ID = process.env.SMOKE_COMPANY_ID || "9c5d9ab5-182c-4d6a-9559-1749fb6c7698";

const routes = [
  "/",
  "/login",
  "/auth",
  "/privacy",
  "/terms",
  `/${COMPANY_ID}`,
  `/${COMPANY_ID}/data`,
  `/${COMPANY_ID}/knowmore`,
  `/${COMPANY_ID}/goals`,
  `/${COMPANY_ID}/nba`,
  `/${COMPANY_ID}/tactical`,
  `/${COMPANY_ID}/topics`,
];

function acceptableStatus(status) {
  return status >= 200 && status < 400;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${BASE_URL}/login`, { redirect: "manual" });
      if (acceptableStatus(response.status)) return;
    } catch {}
    await delay(500);
  }
  throw new Error("Timed out waiting for Next.js server to become ready.");
}

async function fetchRoute(pathname) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    redirect: "manual",
    headers: {
      "user-agent": "semantic-smoke-suite",
    },
  });

  if (!acceptableStatus(response.status)) {
    throw new Error(`${pathname} returned ${response.status}`);
  }
}

const server = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["next", "start", "-p", String(PORT)],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT),
    },
    stdio: "pipe",
  },
);

let startupLogs = "";
server.stdout.on("data", (chunk) => {
  startupLogs += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  startupLogs += chunk.toString();
});

try {
  await waitForServer();
  for (const route of routes) {
    await fetchRoute(route);
  }
  console.log(`Route smoke passed for ${routes.length} routes.`);
} catch (error) {
  console.error("Route smoke failed.");
  console.error(startupLogs.trim());
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  server.kill("SIGTERM");
  await delay(300);
}
