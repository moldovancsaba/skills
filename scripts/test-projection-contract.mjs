import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const projection = readFileSync("src/lib/webapp-projection.ts", "utf8");
const readModel = readFileSync("src/lib/company-read-model.ts", "utf8");
const contract = readFileSync("docs/WEBAPP_BOUNDARY_CONTRACT.md", "utf8");
const snapshotWorker = readFileSync("scripts/lib/intelligence-snapshot.js", "utf8");

assert.match(contract, /Each projection must include:/, "boundary contract must define projection metadata requirements");
assert.match(contract, /projectionType/, "contract must require projectionType metadata");
assert.match(contract, /generatedAt/, "contract must require generatedAt metadata");
assert.match(projection, /export type ProjectionFreshness/, "webapp projection adapter must expose freshness contract");
assert.match(projection, /export function getProjectionFreshness/, "webapp projection adapter must normalize freshness");
assert.match(projection, /export function normalizeWebappProjection/, "webapp projection adapter must normalize projection payloads");
assert.match(snapshotWorker, /webappProjection\s*=\s*{/, "Local snapshot worker must write webappProjection");
assert.match(snapshotWorker, /generatedAt:\s*new Date\(\)\.toISOString\(\)/, "Local projection writer must stamp generatedAt");
assert.match(readModel, /const EMPTY_COUNTS/, "read model must expose empty missing-projection counts");
assert.doesNotMatch(readModel, /buildCountsFromSnapshot/, "read model must not reconstruct counts from legacy snapshot fields");
assert.doesNotMatch(readModel, /dataIngressCount|topicSynthesisCount|knowmoreCount|strategicGoalsCount|tacticalBoardCount|reviewGatewayCount/, "read model must not use legacy count fields as fallback truth");

console.log("projection contract guard OK");
