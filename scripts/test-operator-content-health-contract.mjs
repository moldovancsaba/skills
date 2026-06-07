import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const lib = read("src/lib/operator-content-health.ts");
const route = read("src/app/api/operator/content-health/route.ts");
const page = read("src/app/operator/content-health/page.tsx");
const nav = read("src/app/client-nav.tsx");

assert.match(lib, /moldovancsaba@gmail\.com/, "operator library must define the requested special operator email");
assert.match(route, /CONTENT_HEALTH_OPERATOR_EMAIL/, "operator API must allow the configured special operator email");
assert.match(route, /isSuperAdminEmail/, "operator API must also allow SUPERADMIN recovery access");
assert.match(route, /Unauthorized/, "operator API must reject unauthenticated access");
assert.match(route, /Forbidden/, "operator API must reject unrelated authenticated users");

assert.match(lib, /CONTENT_HEALTH_DEFAULT_TIMEZONE = "Europe\/Budapest"/, "dashboard must default to the operator timezone");
assert.match(lib, /CONTENT_HEALTH_MAX_HOURS = 168/, "dashboard must bound expensive query windows");
assert.match(lib, /CREATED_SOURCES/, "dashboard must define created content sources");
assert.match(lib, /UPDATED_SOURCES/, "dashboard must define updated and feedback sources");
assert.match(lib, /mongoDate/, "raw Mongo aggregation must use extended JSON date literals");
assert.match(lib, /dateTrunc/, "aggregation must bucket activity by hour");
assert.match(lib, /ChecklistTask/, "task cards must be represented");
assert.match(lib, /Opportunitycard/, "opportunity cards must be represented");
assert.match(lib, /Feedback/, "feedback must be represented");
assert.match(lib, /DecisionEvent/, "audit decision events must be represented");
assert.match(lib, /OutcomeEvent/, "audit outcome events must be represented");

assert.match(page, /System Activity Dashboard/, "page must render the operator dashboard title");
assert.match(page, /New Created Content/, "page must render the created content chart");
assert.match(page, /Updated Cards And Feedback/, "page must render the updated activity chart");
assert.match(page, /stackId="activity"/, "charts must be stacked bar charts");
assert.match(page, /aria-live="polite"/, "dashboard status must be announced accessibly");
assert.match(page, /window\.setInterval\(loadDashboard, 60_000\)/, "dashboard must refresh periodically");

assert.match(nav, /System Activity/, "operator nav must expose the dashboard");
assert.match(nav, /moldovancsaba@gmail\.com/, "operator nav must scope the link to the requested email");

console.log("Operator content health contract passed.");
