import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

export const LANE = Object.freeze({
  SYSTEM_HEALTH: "SYSTEM_HEALTH",
  PLAYLIST: "PLAYLIST",
  HUMAN_APPROVED_BURST: "HUMAN_APPROVED_BURST",
  FORBIDDEN_BYPASS: "FORBIDDEN_BYPASS",
});

const RISK = Object.freeze({ LOW: "low", MEDIUM: "medium", HIGH: "high" });

const REQUIRED_FIELDS = [
  "id",
  "humanName",
  "entrypoint",
  "trigger",
  "lane",
  "mutatesBusinessContent",
  "mutatesRuntimeHealth",
  "requiresHumanApproval",
  "ownerDoc",
  "risk",
];

const SYSTEM_HEALTH_TERMS = [
  "audit",
  "build",
  "command",
  "diagnostic",
  "docs",
  "guardian",
  "health",
  "lifecycle",
  "lint",
  "memory",
  "migration",
  "profile",
  "release",
  "runtime",
  "semantic",
  "smoke",
  "snapshot",
  "status",
  "test",
  "verify",
];

const PLAYLIST_TERMS = [
  "agent",
  "answer",
  "backfill",
  "board",
  "bootstrap-compare",
  "card",
  "classscout",
  "compare",
  "destination",
  "enrichment",
  "evaluation",
  "feedback",
  "flashcard",
  "goal",
  "hashtag",
  "ingest",
  "knowmore",
  "nba",
  "opportunity",
  "publish",
  "repair",
  "research",
  "source",
  "task",
  "topic",
  "training",
  "visitor",
  "workflow",
];

const WEBAPP_READ_TERMS = [
  "analytics",
  "auth",
  "callback",
  "counts",
  "login",
  "logout",
  "nav",
  "observability",
  "session",
  "settings",
  "status",
  "trace",
];

const EXPLICIT = new Map([
  ["package:sync", { lane: LANE.PLAYLIST, mutatesBusinessContent: true, mutatesRuntimeHealth: true, risk: RISK.HIGH }],
  ["package:snapshot-worker", { lane: LANE.SYSTEM_HEALTH, mutatesBusinessContent: false, mutatesRuntimeHealth: true, risk: RISK.MEDIUM }],
  ["package:guardian", { lane: LANE.SYSTEM_HEALTH, mutatesBusinessContent: false, mutatesRuntimeHealth: true, risk: RISK.HIGH }],
  ["package:status", { lane: LANE.SYSTEM_HEALTH, mutatesBusinessContent: false, mutatesRuntimeHealth: false, risk: RISK.LOW }],
  ["package:maintenance:lifecycle", { lane: LANE.SYSTEM_HEALTH, mutatesBusinessContent: false, mutatesRuntimeHealth: true, risk: RISK.MEDIUM }],
  ["package:verify:lifecycle", { lane: LANE.SYSTEM_HEALTH, mutatesBusinessContent: false, mutatesRuntimeHealth: false, risk: RISK.LOW }],
  ["api:/api/customer-value/delivery", { lane: LANE.SYSTEM_HEALTH, mutatesBusinessContent: false, mutatesRuntimeHealth: false, risk: RISK.LOW }],
  ["api:/api/cron/destination-missions", { lane: LANE.PLAYLIST, mutatesBusinessContent: true, mutatesRuntimeHealth: false, risk: RISK.HIGH }],
  ["api:/api/destination-missions/daemon", { lane: LANE.PLAYLIST, mutatesBusinessContent: true, mutatesRuntimeHealth: false, risk: RISK.HIGH }],
  ["api:/api/destination-missions/daemon/health", { lane: LANE.SYSTEM_HEALTH, mutatesBusinessContent: false, mutatesRuntimeHealth: false, risk: RISK.LOW }],
  ["api:/api/commands", { lane: LANE.SYSTEM_HEALTH, mutatesBusinessContent: false, mutatesRuntimeHealth: true, risk: RISK.HIGH }],
  ["api:/api/bridge/ingress", { lane: LANE.PLAYLIST, mutatesBusinessContent: true, mutatesRuntimeHealth: false, risk: RISK.HIGH }],
  ["api:/api/local-ai/lane-events", { lane: LANE.SYSTEM_HEALTH, mutatesBusinessContent: false, mutatesRuntimeHealth: false, risk: RISK.LOW }],
  ["api:/api/miniapps/:miniappKey/intelligence-contract", { lane: LANE.SYSTEM_HEALTH, mutatesBusinessContent: false, mutatesRuntimeHealth: false, risk: RISK.LOW }],
  ["api:/api/miniapps/:miniappKey/ops/actions", { lane: LANE.PLAYLIST, mutatesBusinessContent: true, mutatesRuntimeHealth: true, risk: RISK.HIGH }],
  ["api:/api/pipeline-jobs", { lane: LANE.PLAYLIST, mutatesBusinessContent: true, mutatesRuntimeHealth: true, risk: RISK.HIGH }],
  ["bin:check-local-foreground-worker", { lane: LANE.PLAYLIST, mutatesBusinessContent: true, mutatesRuntimeHealth: true, risk: RISK.HIGH }],
  ["bin:check-local-snapshot-worker", { lane: LANE.SYSTEM_HEALTH, mutatesBusinessContent: false, mutatesRuntimeHealth: true, risk: RISK.MEDIUM }],
  ["bin:check-local-guardian", { lane: LANE.SYSTEM_HEALTH, mutatesBusinessContent: false, mutatesRuntimeHealth: true, risk: RISK.HIGH }],
  ["bin:check-local-status-server", { lane: LANE.SYSTEM_HEALTH, mutatesBusinessContent: false, mutatesRuntimeHealth: false, risk: RISK.LOW }],
  ["bin:check-local-lifecycle-maintenance", { lane: LANE.SYSTEM_HEALTH, mutatesBusinessContent: false, mutatesRuntimeHealth: true, risk: RISK.MEDIUM }],
  ["bin:check-local-lifecycle-verify", { lane: LANE.SYSTEM_HEALTH, mutatesBusinessContent: false, mutatesRuntimeHealth: false, risk: RISK.LOW }],
  ["script:scripts/sync.js", { lane: LANE.PLAYLIST, mutatesBusinessContent: true, mutatesRuntimeHealth: true, risk: RISK.HIGH }],
  ["script:scripts/customer-value-delivery.mjs", { lane: LANE.SYSTEM_HEALTH, mutatesBusinessContent: false, mutatesRuntimeHealth: false, risk: RISK.LOW }],
  ["script:scripts/local-runnable-inventory.mjs", { lane: LANE.SYSTEM_HEALTH, mutatesBusinessContent: false, mutatesRuntimeHealth: false, risk: RISK.LOW }],
]);

function titleCase(value) {
  return String(value).replace(/[-_:/]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (char) => char.toUpperCase());
}

function walk(dir, predicate) {
  if (!existsSync(dir)) return [];
  const output = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) output.push(...walk(fullPath, predicate));
    else if (!predicate || predicate(fullPath)) output.push(fullPath);
  }
  return output;
}

function includesAny(value, terms) {
  const normalized = value.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

function packageScripts() {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  return Object.entries(pkg.scripts || {}).map(([name, command]) => ({
    id: `package:${name}`,
    humanName: `Package Script: ${titleCase(name)}`,
    entrypoint: `package.json#scripts.${name}`,
    command,
    trigger: "manual",
  }));
}

function binScripts() {
  return walk(join(ROOT, "bin"), (file) => !file.endsWith(".md")).map((file) => {
    const rel = relative(ROOT, file);
    const name = rel.split("/").pop();
    return { id: `bin:${name}`, humanName: `Local Runner: ${titleCase(name)}`, entrypoint: rel, trigger: "manual" };
  });
}

function topLevelScripts() {
  return walk(join(ROOT, "scripts"), (file) => /\.(js|mjs|cjs|ts)$/.test(file))
    .filter((file) => !relative(ROOT, file).startsWith("scripts/lib/"))
    .filter((file) => !relative(ROOT, file).startsWith("scripts/scratch/"))
    .map((file) => {
      const rel = relative(ROOT, file);
      return { id: `script:${rel}`, humanName: `Script: ${titleCase(rel.replace(/^scripts\//, ""))}`, entrypoint: rel, trigger: "manual" };
    });
}

function apiRoutes() {
  return walk(join(ROOT, "src/app/api"), (file) => file.endsWith("route.ts")).map((file) => {
    const rel = relative(ROOT, file);
    const routePath = rel.replace(/^src\/app/, "").replace(/\/route\.ts$/, "").replace(/\[([^\]]+)\]/g, ":$1");
    return { id: `api:${routePath}`, humanName: `API Route: ${routePath}`, entrypoint: rel, trigger: routePath.includes("/cron/") ? "cron" : "api" };
  });
}

function classify(item) {
  const explicit = EXPLICIT.get(item.id);
  if (explicit) return explicit;
  const text = `${item.id} ${item.entrypoint} ${item.command || ""}`.toLowerCase();
  const isApi = item.id.startsWith("api:");
  const isPackage = item.id.startsWith("package:");
  const isScript = item.id.startsWith("script:");

  if (text.includes("burst")) return { lane: LANE.HUMAN_APPROVED_BURST, mutatesBusinessContent: true, mutatesRuntimeHealth: false, requiresHumanApproval: true, risk: RISK.HIGH };
  if (isApi && (text.includes("/cron/") || text.includes("/destination-missions/daemon"))) {
    return { lane: LANE.FORBIDDEN_BYPASS, mutatesBusinessContent: true, mutatesRuntimeHealth: false, risk: RISK.HIGH, migrationTarget: "Convert direct runtime execution to queue-owned Playlist Lane work." };
  }
  if (includesAny(text, PLAYLIST_TERMS)) {
    return { lane: LANE.PLAYLIST, mutatesBusinessContent: true, mutatesRuntimeHealth: text.includes("pipeline") || text.includes("queue"), risk: isApi || isScript ? RISK.MEDIUM : RISK.HIGH };
  }
  if (isApi && (text.includes("/api/companies") || text.includes("/api/units") || text.includes("/api/webhook") || text.includes("/api/checklist") || text.includes("/api/data-files") || text.includes("/api/entities") || text.includes("/api/events") || text.includes("/api/industries") || text.includes("/api/intelligence") || text.includes("/api/search"))) {
    return { lane: LANE.PLAYLIST, mutatesBusinessContent: true, mutatesRuntimeHealth: text.includes("pipeline") || text.includes("operations"), risk: RISK.MEDIUM };
  }
  if (isApi && (includesAny(text, WEBAPP_READ_TERMS) || text.includes("/api/oauth") || text.includes("/api/communication"))) {
    return { lane: LANE.SYSTEM_HEALTH, mutatesBusinessContent: false, mutatesRuntimeHealth: text.includes("auth") || text.includes("settings") || text.includes("observability"), risk: RISK.LOW };
  }
  if (isScript && (text.includes("mlx") || text.includes("learning") || text.includes("candidate") || text.includes("seed") || text.includes("scrub") || text.includes("migrate") || text.includes("inspect") || text.includes("list_collections") || text.includes("debug"))) {
    const mutatesBusinessContent = text.includes("learning") || text.includes("candidate") || text.includes("seed") || text.includes("scrub") || text.includes("migrate");
    return {
      lane: mutatesBusinessContent ? LANE.PLAYLIST : LANE.SYSTEM_HEALTH,
      mutatesBusinessContent,
      mutatesRuntimeHealth: text.includes("migrate") || text.includes("scrub") || text.includes("inspect"),
      risk: RISK.HIGH,
    };
  }
  if (includesAny(text, SYSTEM_HEALTH_TERMS) || isPackage) {
    return { lane: LANE.SYSTEM_HEALTH, mutatesBusinessContent: false, mutatesRuntimeHealth: includesAny(text, ["guardian", "maintenance", "memory", "runtime", "snapshot", "status", "sync"]), risk: includesAny(text, ["delete", "scrub", "migrate"]) ? RISK.HIGH : RISK.LOW };
  }
  return { lane: LANE.FORBIDDEN_BYPASS, mutatesBusinessContent: isApi || isScript, mutatesRuntimeHealth: false, risk: RISK.HIGH, migrationTarget: "Classify explicitly before this runnable action is used in production." };
}

export function buildLocalRunnableInventory() {
  return [...packageScripts(), ...binScripts(), ...topLevelScripts(), ...apiRoutes()]
    .map((item) => ({ ...item, ...classify(item), requiresHumanApproval: Boolean(classify(item).requiresHumanApproval), ownerDoc: "docs/LOCAL_AI_RUNTIME_SOP.md" }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function validateLocalRunnableInventory(items = buildLocalRunnableInventory()) {
  const failures = [];
  const ids = new Set();
  for (const item of items) {
    for (const field of REQUIRED_FIELDS) if (item[field] === undefined || item[field] === null || item[field] === "") failures.push(`${item.id || "(missing id)"} missing required field: ${field}`);
    if (ids.has(item.id)) failures.push(`duplicate runnable id: ${item.id}`);
    ids.add(item.id);
    if (!Object.values(LANE).includes(item.lane)) failures.push(`${item.id} has invalid lane: ${item.lane}`);
    if (!Object.values(RISK).includes(item.risk)) failures.push(`${item.id} has invalid risk: ${item.risk}`);
    if (item.lane === LANE.SYSTEM_HEALTH && item.mutatesBusinessContent) failures.push(`${item.id} is System Health but mutates business content`);
    if (item.lane === LANE.HUMAN_APPROVED_BURST && !item.requiresHumanApproval) failures.push(`${item.id} is Burst lane but does not require human approval`);
    if (item.lane === LANE.FORBIDDEN_BYPASS && !item.migrationTarget) failures.push(`${item.id} is forbidden bypass but has no migration target`);
  }
  return failures;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const inventory = buildLocalRunnableInventory();
  const failures = validateLocalRunnableInventory(inventory);
  const counts = inventory.reduce((acc, item) => ({ ...acc, [item.lane]: (acc[item.lane] || 0) + 1 }), {});
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), counts, items: inventory }, null, 2));
  if (process.argv.includes("--strict") && failures.length > 0) {
    console.error("\nLocal runnable inventory validation failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
}
