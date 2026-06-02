import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function assertContains(source, pattern, message) {
  assert.match(source, pattern, message);
}

function assertNotContains(source, pattern, message) {
  assert.doesNotMatch(source, pattern, message);
}

const permissionSource = read("src/lib/check-foundation/permissions-audit.ts");

for (const permission of [
  "unit.block.enable",
  "unit.block.disable",
  "card.create",
  "card.update",
  "local.job.retry",
  "miniapp.card.approve",
  "miniapp.card.publish",
  "miniapp.publish.rollback",
]) {
  assertContains(
    permissionSource,
    new RegExp(`"${permission.replaceAll(".", "\\.")}"`),
    `Unit permission matrix must include ${permission}.`,
  );
}

assertContains(
  permissionSource,
  /const ROLE_PERMISSION_MATRIX: Record<Role, UnitPermission\[]>/,
  "Permission policy must be centralized in a role-to-permission matrix.",
);
assertContains(
  permissionSource,
  /result: "allowed" \| "denied" \| "succeeded" \| "failed"/,
  "Permission audit events must record allowed, denied, succeeded, and failed outcomes.",
);
assertContains(
  permissionSource,
  /outcomeType: "UNIT_PERMISSION_CHECK"/,
  "Permission checks must emit canonical audit outcome events.",
);
assertContains(
  permissionSource,
  /statusCode\?: number/,
  "Denied permission checks must expose a fail-closed status code for API routes.",
);
assertContains(
  permissionSource,
  /throw error;/,
  "Denied permission checks and failed guarded mutations must throw instead of silently continuing.",
);
assertNotContains(
  permissionSource,
  /console\.log|console\.error/,
  "Permission/audit contract must not log raw permission payloads directly.",
);

const protectedRoutes = [
  {
    path: "src/app/api/pipeline-jobs/route.ts",
    pattern: /guardedUnitMutation/,
    message: "Pipeline queue mutations must use the permission/audit guard.",
  },
  {
    path: "src/app/api/companies/[companyId]/operations/[itemId]/[action]/route.ts",
    pattern: /guardedUnitMutation/,
    message: "Operations recovery mutations must use the permission/audit guard.",
  },
  {
    path: "src/app/api/units/[unitId]/miniapps/[miniappId]/cards/[cardId]/approve/route.ts",
    pattern: /assertUnitPermission/,
    message: "Miniapp card approval must assert Unit permission.",
  },
  {
    path: "src/app/api/units/[unitId]/miniapps/[miniappId]/cards/[cardId]/publish/route.ts",
    pattern: /assertUnitPermission/,
    message: "Miniapp card publish must assert Unit permission.",
  },
  {
    path: "src/app/api/units/[unitId]/miniapps/[miniappId]/content/[contentId]/refresh/route.ts",
    pattern: /assertUnitPermission/,
    message: "Miniapp content refresh must assert Unit permission.",
  },
];

for (const route of protectedRoutes) {
  assertContains(read(route.path), route.pattern, route.message);
}

const docs = [
  read("docs/CHECK_FOUNDATION_LLD.md"),
  read("docs/CHECK_FOUNDATION_HANDOVER.md"),
].join("\n");

assertContains(
  docs,
  /permissions-audit\.ts/,
  "Foundation documentation must reference the permission/audit contract.",
);
assertContains(
  docs,
  /permission|audit/i,
  "Foundation documentation must describe permission and audit behavior.",
);

console.log("check foundation permission/audit contract passed.");
