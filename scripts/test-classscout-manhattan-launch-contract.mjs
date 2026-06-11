import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

const contractSource = read("src/lib/miniapp-intelligence-contracts.ts");
const blueprintSource = read("src/lib/visitor-blueprints.ts");
const bootstrapSource = read("src/lib/visitor-bootstrap.ts");
const qualityGateSource = read("src/lib/visitor-quality-gate.ts");

for (const token of [
  "classscout.visitor.sovereign@v1",
  "Manhattan",
  "Birthday Parties",
  "Drop-In Activities",
  "Family Events",
  "Meetup Groups",
  "Arts",
  "STEM",
  "Music",
  "Sports",
]) {
  assert.match(contractSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `ClassScout contract must include ${token}`);
}

assert.match(contractSource, /classscout-manhattan-arts/, "ClassScout coverage must include Manhattan arts coverage.");
assert.match(contractSource, /classscout-manhattan-stem/, "ClassScout coverage must include Manhattan STEM coverage.");
assert.match(contractSource, /provider profile without public contact path/, "ClassScout contract must reject provider profiles without contact paths.");

for (const token of [
  "getDefaultVisitorBlueprint",
  "getDefaultVisitorTaxonomy",
  "classscout-manhattan-launch@v1",
  "CLASSSCOUT_REQUIRED_PROVIDER_EVIDENCE",
  "name",
  "category",
  "borough",
  "neighborhood",
  "ageRanges",
  "programType",
  "shortDescription",
  "website",
  "image",
  "sourceUrl",
]) {
  assert.match(blueprintSource, new RegExp(token), `ClassScout default taxonomy must define ${token}`);
}

assert.match(bootstrapSource, /getDefaultVisitorBlueprint\("classscout-new-york"\)/, "Bootstrap must reuse the ClassScout default blueprint.");
assert.match(bootstrapSource, /getDefaultVisitorTaxonomy\("classscout-new-york"\)/, "Bootstrap must reuse the ClassScout default taxonomy.");
assert.match(qualityGateSource, /readEvidenceField/, "Quality gate must resolve required evidence from facts, metadata, and public payloads.");
assert.match(qualityGateSource, /missing_launch_profile_evidence/, "ClassScout launch gate must block incomplete public profiles.");

assert.match(qualityGateSource, /const publicPayload = asRecord\(metadata\.publicDraftPayload\) \?\? asRecord\(facts\.publicDraftPayload\)/, "Quality gate must inspect publicDraftPayload for launch evidence.");
assert.match(qualityGateSource, /name:\s*\["name",\s*"title",\s*"provider"\]/, "Quality gate must accept provider/name aliases.");
assert.match(qualityGateSource, /website:\s*\["website",\s*"url",\s*"sourceUrl"\]/, "Quality gate must accept website/contact aliases.");
assert.match(qualityGateSource, /image:\s*\["image",\s*"coverImageUrl",\s*"imageUrl"\]/, "Quality gate must accept image aliases.");
assert.match(qualityGateSource, /blockingReasons\.push\("source_only_not_public_listing"\)/, "Source-only content must block public listing.");
assert.match(qualityGateSource, /reviewReasons\.push\("missing_required_evidence"\)[\s\S]*blockingReasons\.push\("missing_launch_profile_evidence"\)/, "ClassScout missing profile evidence must be review-visible and blocking.");

console.log("ClassScout Manhattan launch contract passed.");
