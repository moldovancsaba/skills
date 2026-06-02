import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const files = {
  routes: readFileSync(join(ROOT, "src/lib/classscout-routes.ts"), "utf8"),
  landing: readFileSync(join(ROOT, "src/lib/classscout-landing.ts"), "utf8"),
  landingApi: readFileSync(join(ROOT, "src/app/api/classscout/landing/route.ts"), "utf8"),
  classscoutPage: readFileSync(join(ROOT, "src/app/[companyId]/classscout/page.tsx"), "utf8"),
  classscoutHome: readFileSync(join(ROOT, "src/components/classscout-home.tsx"), "utf8"),
  clientNav: readFileSync(join(ROOT, "src/app/client-nav.tsx"), "utf8"),
  refreshSync: readFileSync(join(ROOT, "src/app/api/classscout/refresh-lane/sync/route.ts"), "utf8"),
  refreshTick: readFileSync(join(ROOT, "src/app/api/classscout/refresh-lane/tick/route.ts"), "utf8"),
  maintenance: readFileSync(join(ROOT, "src/lib/destination-classscout-maintenance.ts"), "utf8"),
  docs: readFileSync(join(ROOT, "docs/INTELLIGENCE_UNIT_CONTROL_PLANE_LLD.md"), "utf8"),
};

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

assert(/type\s+ClassScoutRouteContract/.test(files.routes), "ClassScout route contract type must exist");
assert(/resolveClassScoutEntryPoint/.test(files.routes), "ClassScout entry-point resolver must exist");
assert(/landingRoute:\s*`\/\$\{string\}\/classscout`/.test(files.routes), "landing route must be canonical /{companyId}/classscout");
assert(/reviewRoute:\s*`\/\$\{string\}\/review`/.test(files.routes), "review route ownership must remain generic");
assert(/opsRoute:\s*`\/\$\{string\}\/review\?tab=ops`/.test(files.routes), "ops route ownership must remain generic review ops");
assert(/observabilityRoute:\s*`\/\$\{string\}\/observability`/.test(files.routes), "observability route ownership must remain generic");

for (const field of ["liveListings", "reviewPackets", "learning", "missionControl", "routeTargets", "fetchHealth"]) {
  assert(files.landing.includes(field), `ClassScout landing read model must include ${field}`);
}
assert(/entryPoints/.test(files.landing), "ClassScout landing read model must include entry-point classifications");
assert(/Promise\.all/.test(files.landing), "ClassScout landing read model must compose sources in parallel");
assert(/unavailableSections/.test(files.landing), "ClassScout landing read model must preserve partial-failure visibility");
assert(/getClassScoutLandingSummary/.test(files.landingApi), "canonical landing API must use the shared landing summary builder");
assert(/getClassScoutLandingSummary/.test(files.classscoutPage), "ClassScout route must server-load the landing summary");
assert(/initialSummary/.test(files.classscoutHome), "ClassScout home must accept server-loaded initial summary");
assert(/\/api\/classscout\/landing/.test(files.classscoutHome), "ClassScout home refresh must use the canonical landing API");
assert(/fetchHealth/.test(files.classscoutHome), "ClassScout home must render canonical degraded-source health");
assert(/key:\s*webappProfile === "CLASSSCOUT" \? "classscout"/.test(files.clientNav), "sidebar item key must be profile-specific for ClassScout");
assert(/classscout:\s*data\.counts\?\.classscout/.test(files.clientNav), "sidebar must carry optional ClassScout badge count");

assert(/type\s+ClassScoutRefreshCandidate/.test(files.maintenance), "refresh lane must define candidate contract");
assert(/idempotencyKey/.test(files.maintenance), "refresh candidates must expose idempotency keys");
assert(/selectClassScoutRefreshCandidates/.test(files.refreshSync), "sync endpoint must expose candidate selection");
assert(/runClassScoutRefreshLaneTick/.test(files.refreshTick), "tick endpoint must execute the refresh lane");
assert(/verifyMembership\(request,\s*companyId,\s*"ADMIN"\)/.test(files.refreshTick), "refresh tick must require admin membership");

assert(/\/api\/classscout\/landing/.test(files.docs), "docs must describe canonical ClassScout landing API");
assert(/\/api\/classscout\/refresh-lane/.test(files.docs), "docs must describe ClassScout refresh lane APIs");

if (failures.length > 0) {
  console.error("ClassScout surface contract failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("ClassScout surface contract passed.");
