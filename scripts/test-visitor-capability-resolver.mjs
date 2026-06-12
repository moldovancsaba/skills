import assert from "node:assert/strict";

const resolver = await import("../src/lib/visitor-capability-resolver.ts");

const {
  expandVisitorCapabilityParentChain,
  resolveVisitorCapability,
  resolveVisitorCapabilityForVisitorKey,
  resolveVisitorCapabilityScopeForVisitorKey,
} = resolver;

assert.deepEqual(
  expandVisitorCapabilityParentChain("check.miniapp.visitors.compare"),
  ["check", "check.miniapp", "check.miniapp.visitors", "check.miniapp.visitors.compare"],
  "Compare scope must inherit every parent level in order.",
);

assert.deepEqual(
  expandVisitorCapabilityParentChain("check.miniapp.visitors.compare"),
  ["check", "check.miniapp", "check.miniapp.visitors", "check.miniapp.visitors.compare"],
  "Compare scope must inherit every parent level in order.",
);

assert.equal(
  resolveVisitorCapabilityScopeForVisitorKey("compare"),
  "check.miniapp.visitors.compare",
  "compare visitorKey must resolve to the Compare visitor product scope.",
);

assert.equal(
  resolveVisitorCapabilityScopeForVisitorKey("compare-new-york"),
  "check.miniapp.visitors.compare",
  "compare visitorKey variants must resolve to the Compare visitor product scope.",
);

const compareCapability = resolveVisitorCapabilityForVisitorKey("compare");
assert.equal(compareCapability.scope, "check.miniapp.visitors.compare");
assert(compareCapability.rules.some((rule) => rule.id === "stable-card-identity"), "check-level identity rule must be inherited.");
assert(compareCapability.rules.some((rule) => rule.id === "visitor-category-affinity"), "visitor-level affinity rule must be inherited.");
assert(compareCapability.rules.some((rule) => rule.id === "compare-shooting-taxonomy"), "Compare product rule must be present.");
assert(!compareCapability.rules.some((rule) => rule.id === "compare-family-taxonomy"), "Compare rules must not leak into Compare.");

const overrideCapability = resolveVisitorCapability("check.miniapp.visitors.compare", [
  {
    id: "shared-rule",
    scope: "check.miniapp.visitors",
    version: "v1",
    appliesTo: ["base"],
    precedence: 300,
  },
  {
    id: "shared-rule",
    scope: "check.miniapp.visitors.compare",
    version: "v2",
    appliesTo: ["compare"],
    precedence: 400,
  },
]);

assert.equal(overrideCapability.rules.length, 1, "child rule with same id must override parent rule.");
assert.equal(overrideCapability.rules[0]?.scope, "check.miniapp.visitors.compare");
assert.equal(overrideCapability.rules[0]?.version, "v2");
assert.deepEqual(overrideCapability.diagnostics, ["Rule shared-rule from check.miniapp.visitors.compare overrides check.miniapp.visitors."]);

assert.throws(
  () => resolveVisitorCapability("check.miniapp.visitors.unknown"),
  /Unsupported visitor capability scope/,
  "unknown scopes must fail closed.",
);

console.log("visitor capability resolver contract passed.");
