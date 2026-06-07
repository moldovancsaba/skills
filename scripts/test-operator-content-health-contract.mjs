import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const lib = read("src/lib/operator-content-health.ts");
const route = read("src/app/api/operator/content-health/route.ts");
const cronRoute = read("src/app/api/cron/operator-content-health/route.ts");
const page = read("src/app/operator/content-health/page.tsx");
const nav = read("src/app/client-nav.tsx");
const proxy = read("src/proxy.ts");
const runnableInventory = read("scripts/local-runnable-inventory.mjs");

assert.match(lib, /moldovancsaba@gmail\.com/, "operator library must define the requested special operator email");
assert.match(route, /CONTENT_HEALTH_OPERATOR_EMAIL/, "operator API must allow the configured special operator email");
assert.match(route, /isSuperAdminEmail/, "operator API must also allow SUPERADMIN recovery access");
assert.match(route, /Unauthorized/, "operator API must reject unauthenticated access");
assert.match(route, /Forbidden/, "operator API must reject unrelated authenticated users");
assert.match(route, /Cache-Control": "no-store"/, "operator API responses must not be cached");
assert.match(route, /Dashboard unavailable/, "operator API must return a controlled failure payload");

assert.match(lib, /CONTENT_HEALTH_DEFAULT_TIMEZONE = "Europe\/Budapest"/, "dashboard must default to the operator timezone");
assert.match(lib, /CONTENT_HEALTH_MAX_HOURS = 168/, "dashboard must bound expensive query windows");
assert.match(lib, /CONTENT_HEALTH_AGGREGATION_MAX_TIME_MS = 10_000/, "dashboard aggregations must have a bounded Atlas runtime");
assert.match(lib, /CONTENT_HEALTH_SNAPSHOT_COLLECTION = "OperatorContentHealthSnapshot"/, "dashboard must persist hourly operator snapshots");
assert.match(lib, /CONTENT_HEALTH_BASELINE_DAYS = 7/, "dashboard must compare against a 7 day baseline");
assert.match(lib, /persistDashboardSnapshots/, "dashboard must write hourly snapshots");
assert.match(lib, /buildHealthEvaluation/, "dashboard must evaluate anomalies and health status");
assert.match(lib, /sameHourYesterday/, "dashboard must compare against the same hour yesterday");
assert.match(lib, /sevenDayAverage/, "dashboard must expose baseline averages");
assert.match(lib, /shouldNotify/, "dashboard must expose alert-ready notification state");
assert.match(lib, /resolveTimezone/, "dashboard must validate timezone input");
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
assert.match(page, /Board cards/, "page must chart board-card activity");
assert.match(page, /Review packets/, "page must chart review-packet activity");
assert.match(page, /Hashtag feedback/, "page must chart hashtag feedback activity");
assert.match(page, /Operator Health/, "page must render the operator health summary");
assert.match(page, /Baseline Trend/, "page must render baseline trend comparison");
assert.match(page, /Anomaly Detection/, "page must render anomaly detection results");

assert.match(nav, /System Activity/, "operator nav must expose the dashboard");
assert.match(nav, /moldovancsaba@gmail\.com/, "operator nav must scope the link to the requested email");

assert.match(cronRoute, /verifyBackgroundJobSecret/, "cron route must require background job authentication");
assert.match(cronRoute, /lane:\s*"SYSTEM_HEALTH"/, "cron route must report System Health lane ownership");
assert.match(cronRoute, /CONTENT_HEALTH_MAX_HOURS/, "cron route must refresh the full bounded snapshot window by default");
assert.match(cronRoute, /Operator content health snapshots refreshed/, "cron route must return an operational refresh message");
assert.match(proxy, /\/api\/cron\/operator-content-health/, "cron route must bypass session proxy and rely on bearer auth");
assert.match(runnableInventory, /api:\/api\/cron\/operator-content-health", \{ lane: LANE\.SYSTEM_HEALTH/, "cron route must be classified as a System Health runnable");

console.log("Operator content health contract passed.");
