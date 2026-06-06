"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const statusServerPath = path.join(__dirname, "status-server.js");
const source = fs.readFileSync(statusServerPath, "utf8");

assert.match(source, /collectMemoryStewardSnapshot/, "status payload must include the memory steward");
assert.match(source, /reduceRuntimeHealth/, "status payload must include unified runtime health");
assert.match(source, /managedServices/, "status payload must include managed service state");
assert.match(source, /queueCircuitBreakers/, "status payload must include queue circuit breakers");
assert.match(source, /id="view-runtime"/, "command center must expose the Runtime view");
assert.match(source, /id="runtime-health-incidents"/, "Runtime view must render health incidents");
assert.match(source, /id="runtime-service-list"/, "Runtime view must render managed services");
assert.match(source, /id="runtime-breaker-list"/, "Runtime view must render queue circuit breakers");
assert.match(source, /id="runtime-log-pressure"/, "Runtime view must render log pressure");
assert.match(source, /Array\.isArray\(data\.logPressure\)/, "Runtime view must support the status API logPressure array contract");
assert.match(source, /id="runtime-memory-actions"/, "Runtime view must render memory actions");
assert.match(source, /data-job-action='fail'/, "Runtime job rows must expose fail action controls");
assert.match(source, /data-job-action='park'/, "Runtime job rows must expose park action controls");
assert.match(source, /data-job-action='retry'/, "Runtime job rows must expose retry action controls");
assert.match(source, /data-service-action='restart'/, "Runtime service rows must expose restart controls");
assert.match(source, /data-service-action='wake'/, "Runtime service rows must expose wake controls");
assert.match(source, /data-breaker-action='retry'/, "Runtime breaker rows must expose retry controls");
assert.match(source, /document\.addEventListener\("click"/, "Runtime actions must use delegated click handling");
assert.match(source, /req\.url === "\/api\/jobs\/action"/, "status server must route runtime job actions");
assert.match(source, /req\.url === "\/api\/services\/action"/, "status server must route service actions");
assert.match(source, /req\.url === "\/api\/circuit-breakers\/action"/, "status server must route circuit breaker actions");
assert.doesNotMatch(source, /onclick=\\?"runJobAction/, "generated runtime rows must not use inline runJobAction handlers");

console.log("runtime console contracts passed");
