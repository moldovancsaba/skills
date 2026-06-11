#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function fail(message) {
  console.error(`GDS runtime feedback contract failed: ${message}`);
  process.exit(1);
}

const providers = read("src/components/providers.tsx");
const feedback = read("src/lib/gds-operation-feedback.tsx");
const observability = read("src/app/[companyId]/observability/page.tsx");
const localAi = read("src/app/local-ai/page.tsx");

for (const provider of ["GdsConfirmProvider", "GdsToastProvider", "GdsTelemetryProvider", "CommandRegistryProvider"]) {
  if (!providers.includes(provider)) {
    fail(`root providers must mount ${provider}.`);
  }
}

for (const hook of ["useGdsConfirm", "useGdsToasts", "useGdsTelemetry"]) {
  if (!feedback.includes(hook)) {
    fail(`runtime feedback adapter must use ${hook}.`);
  }
}

for (const operation of ["confirmDestructive", "notifyActionComplete", "notifyError", "telemetry.emit"]) {
  if (!feedback.includes(operation)) {
    fail(`runtime feedback adapter must call ${operation}.`);
  }
}

if (!observability.includes("useGdsRuntimeOperationFeedback")) {
  fail("observability actions must use the GDS runtime operation feedback adapter.");
}

if (!observability.includes("useCommandLauncher") || !observability.includes("registerCommands")) {
  fail("observability runtime actions must be registered with the GDS command registry.");
}

for (const action of [
  "SYNC_QUEUE",
  "ESCALATE_SCORE_REPAIR",
  "RECOVER_FAILED_JOBS",
  "BUDGET_THROTTLE_QUEUE",
  "BUDGET_BATCH_EVALUATIONS",
  "BUDGET_CACHE_REUSE",
]) {
  if (!observability.includes(action)) {
    fail(`observability action ${action} must remain wired.`);
  }
}

const nativeDialogPattern = /\b(window\.)?(confirm|alert|prompt)\s*\(/;
for (const [path, content] of [
  ["src/app/[companyId]/observability/page.tsx", observability],
  ["src/app/local-ai/page.tsx", localAi],
]) {
  const match = content.match(nativeDialogPattern);
  if (match) {
    fail(`${path} must not use native browser dialogs; found ${match[0]}.`);
  }
}

console.log("GDS runtime feedback contract OK.");
