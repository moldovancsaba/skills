import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assertIncludes(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`${label}: expected ${needle}`);
  }
}

function assertPattern(source, pattern, label) {
  if (!pattern.test(source)) {
    throw new Error(`${label}: expected ${pattern}`);
  }
}

const adapters = read("src/lib/board-adapters.ts");
const route = read("src/app/api/board-items/route.ts");
const capabilityRoute = read("src/app/api/companies/[companyId]/capabilities/transaction/route.ts");
const docs = read("docs/INTELLIGENCE_UNIT_CONTROL_PLANE_LLD.md");

[
  '"unitBoard"',
  '"aiQueue"',
  '"goals"',
  '"topics"',
  '"data"',
  '"knowmore"',
  '"review"',
  '"tactical"',
  '"sales"',
].forEach((surface) => assertIncludes(adapters, surface, `adapter surface ${surface}`));

[
  'module: "unit-board"',
  'module: "pipeline"',
  'module: "goals"',
  'module: "topics"',
  'module: "data"',
  'module: "knowmore"',
  'module: "review"',
  'module: "tactical"',
  'module: "sales"',
].forEach((module) => assertIncludes(adapters, module, `adapter module ${module}`));

[
  "export function listBoardAdapters",
  "export function resolveBoardAdapterDiagnostics",
  "export function normalizeBoardTargetForModule",
  "export function adaptDomainRowToBoardCard",
  "export function buildBoardAdapterTelemetry",
  "board-adapter-module-fallback",
  "Unsupported board adapter combination resolved to read-only unit board fallback.",
].forEach((needle) => assertIncludes(adapters, needle, "adapter registry contract"));

assertPattern(route, /adapter:\s*\{\s*surface:\s*adapter\.surface/s, "board API exposes adapter surface");
assertIncludes(route, "diagnostics: adapter.diagnostics", "board API exposes diagnostics");
assertIncludes(route, "buildBoardAdapterTelemetry(adapter", "board API emits telemetry payload");
assertIncludes(route, "adapter.diagnostics", "board API write errors expose diagnostics");

[
  "version: string;",
  "resolutionSource:",
  "effectiveProfile:",
  "effectiveModules: string[];",
  "changedBy?:",
].forEach((needle) => assertIncludes(capabilityRoute, needle, "capability transaction response fields"));

[
  "Board adapter registry contract",
  "BOARD_ADAPTER_RESOLUTION",
  "board-adapter-module-fallback",
  "adapter.diagnostics",
].forEach((needle) => assertIncludes(docs, needle, "control-plane adapter documentation"));

console.log("Control-plane board adapter contract passed");
