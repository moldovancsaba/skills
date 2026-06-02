import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const files = {
  verification: readFileSync(join(ROOT, "src/lib/classscout-publish-verification.ts"), "utf8"),
  route: readFileSync(join(ROOT, "src/app/api/destination-missions/runs/[id]/verification-tick/route.ts"), "utf8"),
  docs: readFileSync(join(ROOT, "docs/INTELLIGENCE_UNIT_CONTROL_PLANE_LLD.md"), "utf8"),
};

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

assert(/type\s+PublishVerification/.test(files.verification), "publish verification contract type must exist");
for (const status of ["queued", "verified", "not_found", "schema_mismatch", "image_invalid", "timeout"]) {
  assert(files.verification.includes(`"${status}"`), `verification status ${status} must be modeled`);
}
assert(/listClassScoutLiveListings/.test(files.verification), "verification must poll ClassScout public listing surface");
assert(/PUBLISHED_VERIFIED/.test(files.verification), "verified publish must move mission to PUBLISHED_VERIFIED");
assert(/FAILED_RECOVERABLE/.test(files.verification), "failed verification must block as recoverable failure");
assert(/publishVerificationHistory/.test(files.verification), "verification attempts must be persisted in metadata history");
assert(/runClassScoutPublishVerificationTick/.test(files.route), "verification-tick route must call runtime verifier");
assert(/verifyMembership\(request,\s*companyId,\s*"ADMIN"\)/.test(files.route), "verification tick must require admin membership");
assert(/destinationKey must be classscout/.test(files.route), "verification tick must be ClassScout-scoped");
assert(/verification-tick/.test(files.docs), "docs must describe verification tick endpoint");

if (failures.length > 0) {
  console.error("ClassScout publish verification contract failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("ClassScout publish verification contract passed.");

