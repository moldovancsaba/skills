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
assert.match(projection, /export type ProjectionMetadata/, "webapp projection adapter must expose metadata contract");
assert.match(projection, /export function getProjectionFreshness/, "webapp projection adapter must normalize freshness");
assert.match(projection, /export function buildProjectionMetadata/, "webapp projection adapter must expose metadata normalization");
assert.match(projection, /export function normalizeWebappProjection/, "webapp projection adapter must normalize projection payloads");
assert.match(snapshotWorker, /webappProjection\s*=\s*{/, "Local snapshot worker must write webappProjection");
assert.match(snapshotWorker, /projectionType:\s*"companyWebappProjection"/, "Local projection writer must stamp projectionType");
assert.match(snapshotWorker, /sourceRunId:/, "Local projection writer must stamp sourceRunId");
assert.match(snapshotWorker, /inputWatermark:/, "Local projection writer must stamp inputWatermark");
assert.match(snapshotWorker, /recordCount:/, "Local projection writer must stamp recordCount");
assert.match(snapshotWorker, /checksumProjectionPayload/, "Local projection writer must stamp checksum");
assert.match(snapshotWorker, /stalenessStatus:\s*"FRESH"/, "Local projection writer must stamp stalenessStatus");
assert.match(snapshotWorker, /errorState:\s*null/, "Local projection writer must stamp errorState");
assert.match(readModel, /const EMPTY_COUNTS/, "read model must expose empty missing-projection counts");
assert.doesNotMatch(readModel, /buildCountsFromSnapshot/, "read model must not reconstruct counts from legacy snapshot fields");
assert.doesNotMatch(readModel, /dataIngressCount|topicSynthesisCount|knowmoreCount|strategicGoalsCount|tacticalBoardCount|reviewGatewayCount/, "read model must not use legacy count fields as fallback truth");
assert.doesNotMatch(readModel, /observabilitySummary|readQueueTotal/, "read model must not override projection counts from observability");

console.log("projection contract guard OK");
