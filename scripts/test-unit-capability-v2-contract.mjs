import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const files = {
  capabilities: readFileSync(join(ROOT, "src/lib/intelligence-unit-capabilities.ts"), "utf8"),
  settings: readFileSync(join(ROOT, "src/app/api/companies/[companyId]/settings/route.ts"), "utf8"),
  settingsPage: readFileSync(join(ROOT, "src/app/[companyId]/settings/page.tsx"), "utf8"),
  nav: readFileSync(join(ROOT, "src/app/api/companies/[companyId]/nav/route.ts"), "utf8"),
  docs: readFileSync(join(ROOT, "docs/INTELLIGENCE_UNIT_CONTROL_PLANE_LLD.md"), "utf8"),
};

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

assert(/type\s+UnitCapabilityPayloadV2/.test(files.capabilities), "v2 capability payload type must exist");
assert(/type\s+UnitCapabilitiesEnvelope/.test(files.capabilities), "v2 capability envelope type must exist");
assert(/schemaVersion:\s*2/.test(files.capabilities), "v2 envelope must use schemaVersion 2");
assert(/normalizeUnitCapabilitiesPayloadForWrite/.test(files.capabilities), "v2 write normalizer must exist");
assert(/parseUnitCapabilitiesEnvelope/.test(files.capabilities), "v2 envelope parser must exist");
assert(/parseUnitCapabilitiesV3Envelope/.test(files.capabilities), "v3-to-v2 compatibility projection must exist");
assert(/UNIT_PROFILE_COMPATIBILITY/.test(files.capabilities), "profile compatibility matrix must exist");
assert(/previewUnitProfileMigration/.test(files.capabilities), "profile migration preview helper must exist");
assert(/DENIED_MODULES_BY_WEBAPP_PROFILE/.test(files.capabilities), "profile denied-module policy must be explicit");

assert(/unitCapabilitiesV2/.test(files.settings), "settings API must expose or accept unitCapabilitiesV2");
assert(/normalizeUnitCapabilitiesPayloadForWrite/.test(files.settings), "settings PATCH must normalize v2 writes");
assert(/capability_transaction_required/.test(files.settings), "settings PATCH must reject legacy unitCapabilities writes");
assert(/webapp:\s*{[\s\S]*profile:[\s\S]*modules:[\s\S]*profileLabel:/.test(files.settings), "settings response must include webapp profile contract");
assert(/profileCompatibility/.test(files.settings), "settings response must expose profile compatibility");
assert(/profileMigration/.test(files.settings), "settings API must support profile migration dry-run/apply payloads");
assert(/buildModuleMatrixRows/.test(files.settingsPage), "settings UI must derive module matrix rows");
assert(/lockReason/.test(files.settingsPage), "module matrix must expose lock reasons");
assert(/Pending module diff/.test(files.settingsPage), "module matrix must render pending diff preview");

assert(/capabilitiesVersion/.test(files.nav), "nav response must include capabilitiesVersion");
assert(/webapp:\s*{[\s\S]*profile:[\s\S]*modules:[\s\S]*profileLabel:/.test(files.nav), "nav response must include webapp profile contract");
assert(/routeTargets/.test(files.nav), "nav response must include routeTargets for profile-owned routes");

assert(/unitCapabilitiesV2/.test(files.docs), "docs must describe unitCapabilitiesV2");
assert(/webapp\.routeTargets\.classscout/.test(files.docs), "docs must describe ClassScout route targets on nav");

if (failures.length > 0) {
  console.error("Unit capability v2 contract failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Unit capability v2 contract passed.");
