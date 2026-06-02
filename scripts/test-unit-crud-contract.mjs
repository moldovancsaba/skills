import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const settingsRoute = readFileSync("src/app/api/companies/[companyId]/settings/route.ts", "utf8");
const settingsPage = readFileSync("src/app/[companyId]/settings/page.tsx", "utf8");
const companiesRoute = readFileSync("src/app/api/companies/route.ts", "utf8");
const unitCrud = readFileSync("src/lib/unit-crud.ts", "utf8");

assert.match(settingsRoute, /export async function DELETE/, "Unit settings route must expose DELETE for Unit deletion");
assert.match(settingsRoute, /verifyMembership\(request,\s*companyId,\s*"ADMIN"\)/, "Unit delete/update must require admin membership");
assert.match(settingsRoute, /normalizeUnitName/, "Unit settings route must normalize rename input");
assert.match(settingsRoute, /interactionType:\s*"UNIT_RENAME"/, "Unit rename must be audited");
assert.match(settingsRoute, /interactionType:\s*"UNIT_DELETE"/, "Unit delete must be audited");
assert.match(settingsRoute, /deleteUnitData\(prisma,\s*companyId\)/, "Unit settings route must use shared full-data delete helper");

assert.match(companiesRoute, /deleteUnitData\(prisma,\s*id\)/, "SUPERADMIN delete must use shared full-data delete helper");
assert.doesNotMatch(companiesRoute, /checklistTask\.deleteMany[\s\S]*flashcard\.deleteMany[\s\S]*user\.deleteMany[\s\S]*company\.delete/, "SUPERADMIN delete must not use the old partial delete sequence");

assert.match(unitCrud, /Prisma\.dmmf\.datamodel\.models/, "Unit delete helper must derive company-owned models from Prisma schema");
assert.match(unitCrud, /prisma\.feedback\.deleteMany/, "Unit delete helper must remove indirect task feedback before task rows");
assert.match(unitCrud, /delegate\.deleteMany\(\{\s*where:\s*\{\s*companyId\s*\}/, "Unit delete helper must delete all companyId-owned models");

assert.match(settingsPage, /Unit Identity/, "Settings page must expose Unit identity controls");
assert.match(settingsPage, /Rename Unit/, "Settings page must expose rename action");
assert.match(settingsPage, /Delete Unit/, "Settings page must expose delete action");
assert.match(settingsPage, /JSON\.stringify\(updates\)/, "Settings page must PATCH only changed Unit settings fields");
assert.doesNotMatch(settingsPage, /JSON\.stringify\(\{\s*\.\.\.companySettings,\s*\.\.\.updates\s*\}\)/, "Settings page must not resend unitCapabilities during ordinary settings PATCH");

console.log("Unit CRUD contract passed.");
