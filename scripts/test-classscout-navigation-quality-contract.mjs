import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const routes = read("src/lib/classscout-routes.ts");
const landing = read("src/lib/classscout-landing.ts");
const home = read("src/components/classscout-home.tsx");
const unitPanel = read("src/components/destination-classscout-unit-panel.tsx");
const nav = read("src/app/client-nav.tsx");
const docs = read("docs/INTELLIGENCE_UNIT_CONTROL_PLANE_LLD.md");

assert.match(routes, /type\s+ClassScoutEntryPointIntent/, "ClassScout route policy must define entry point intents.");
assert.match(routes, /resolveClassScoutEntryPoint/, "ClassScout route policy must expose an entry point resolver.");
assert.match(routes, /intent === "open-content-ops"[\s\S]*preservesDeepLink:\s*true/, "Content Ops must remain an explicit deep link.");
assert.match(routes, /intent === "open-live-catalog"[\s\S]*preservesDeepLink:\s*true/, "Live Catalog must remain an explicit deep link.");
assert.match(routes, /intent === "open-mission-control"[\s\S]*preservesDeepLink:\s*true/, "Mission Control must remain an explicit deep link.");
assert.match(routes, /targetDestination:\s*routes\.landingRoute[\s\S]*preservesDeepLink:\s*false/, "Generic ClassScout launches must resolve to the canonical home.");
assert.match(routes, /accessibleLabel/, "Entry-point classification must carry accessible labels.");

assert.match(landing, /entryPoints/, "Landing summary must expose entry-point classifications.");
assert.match(landing, /sourceSurface:\s*"destination-classscout-unit-panel"[\s\S]*intent:\s*"open-app-home"/, "Landing summary must inventory the unit-panel home entry.");

assert.match(unitPanel, /resolveClassScoutEntryPoint/, "Unit panel must consume the canonical entry-point policy.");
assert.match(unitPanel, /intent:\s*"open-app-home"/, "Unit panel primary launch must target the canonical ClassScout home.");
assert.match(unitPanel, /aria-label=\{homeEntry\.accessibleLabel\}/, "Unit panel primary launch must preserve an accessible label.");
assert.match(unitPanel, /CLASSSCOUT_ENTRY_POINT_OPEN/, "Unit panel launch telemetry must be recorded.");

assert.match(home, /CLASSSCOUT_HOME_LOADED/, "ClassScout home load telemetry must use the canonical event name.");
assert.match(home, /CLASSSCOUT_ACTION_OPEN/, "ClassScout action telemetry must use the canonical event name.");
assert.match(home, /degradedSources/, "ClassScout home telemetry must include degraded source slices.");

assert.match(nav, /key:\s*webappProfile === "CLASSSCOUT" \? "classscout"/, "Sidebar item key must remain profile-specific.");
assert.match(nav, /pathname\.startsWith\(`\$\{itemHrefBase\}\/`\)/, "Sidebar active state must cover descendant ClassScout routes.");
assert.match(nav, /PIPELINE_ROUTE_SELECT/, "Sidebar route selection telemetry must remain enabled.");

assert.match(docs, /ClassScout Entry-Point Migration/, "Docs must describe the entry-point migration.");
assert.match(docs, /ClassScout Navigation Quality/, "Docs must describe navigation quality guarantees.");

console.log("ClassScout navigation quality contract passed.");
