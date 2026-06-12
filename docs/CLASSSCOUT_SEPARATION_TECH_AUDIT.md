# ClassScout Separation Tech Audit

Generated: 2026-06-12

## Scope

This audit covers `/Users/Shared/Projects/checklist` only. It checks code, comments, docs, scripts, tests, package scripts, and runtime references for ClassScout artifacts left behind after the standalone ClassScout repository became the operational home.

## Summary

ClassScout is still present in checklist as real runtime code, not only comments or stale documentation.

Scan result:

- 156 files reference ClassScout terms.
- 24 files are directly named for ClassScout.
- 132 files contain indirect ClassScout references through shared miniapp, destination, visitor, docs, tests, or API infrastructure.

Checklist should not delete everything in one sweep. Some references are still part of shared miniapp compatibility with Compare, Trainers, and AthleteIQ. The cleanup should remove direct ClassScout runtime first, then genericize shared infrastructure where it currently defaults to ClassScout.

## Direct Runtime Leftovers

These are the highest-confidence ClassScout leftovers in checklist:

- `src/app/[companyId]/classscout/page.tsx`
- `src/app/[companyId]/classscout/visitor-ops/page.tsx`
- `src/app/api/classscout/landing/route.ts`
- `src/app/api/classscout/landing-summary/route.ts`
- `src/app/api/classscout/refresh-lane/sync/route.ts`
- `src/app/api/classscout/refresh-lane/tick/route.ts`
- `src/components/classscout-home.tsx`
- `src/components/destination-classscout-unit-panel.tsx`
- `src/lib/classscout-landing.ts`
- `src/lib/classscout-routes.ts`
- `src/lib/classscout-source-import.ts`
- `src/lib/classscout-source-import-server.ts`
- `src/lib/classscout-publish-verification.ts`
- `src/lib/destination-classscout.ts`
- `src/lib/destination-classscout-maintenance.ts`

Disposition: remove or replace after standalone ClassScout parity is proven for each behavior. Do not preserve these as new checklist abstractions unless Compare or another miniapp uses the same shape.

## Package Scripts Left Behind

These scripts keep checklist operationally responsible for ClassScout:

- `test:classscout-surface`
- `test:classscout-publish-verification`
- `test:classscout-navigation-quality`
- `test:classscout-rulebook-workspace`
- `test:classscout-manhattan-launch`
- `test:classscout-source-import`
- `verify:classscout-golden-path`
- `test:classscout-runtime-quality`

Disposition: remove after the direct runtime files are removed, or replace with generic miniapp tests if the same invariant is still needed for checklist.

## Comment And Documentation Smells

These references show stale ClassScout-specific assumptions:

- `src/lib/classscout-source-import.ts`
  - Comment: `Keep this category list aligned with the ClassScout Manhattan launch contract.`
  - Behavior: source import hardcodes Manhattan geography, `classscout-manhattan-*` goal ids, `classscout-manhattan-launch` tags, and extraction hints that say `Manhattan launch coverage only.`
- `docs/miniapps/classscout-manhattan-launch-contract.md`
  - Entire document is now historical. ClassScout launch and source ingestion live in the standalone ClassScout repo.
- `docs/miniapps/sovereign-intelligence-contract.md`
  - Contains `ClassScout Compatibility Contract` and `ClassScout Manhattan Source Import` sections that point to checklist implementation files.
- `scripts/test-lifecycle-topology.js`
  - Asserts `ClassScout must keep the legacy rulebook mission kind`.
- `docs/CHECK_FOUNDATION_HANDOVER.md`
  - Mentions legacy `/classscout` fallback and ClassScout landing-summary APIs.
- `docs/INTELLIGENCE_UNIT_CONTROL_PLANE_LLD.md`
  - Contains ClassScout route, refresh-lane, navigation, and runtime sections that are now standalone ClassScout concerns.

Disposition: archive or rewrite these after runtime removal. The docs should point to the standalone ClassScout repo instead of documenting checklist ownership.

## Shared Infrastructure References

These are not automatically removable. They need genericization because checklist still uses miniapp and destination concepts:

- `src/lib/check-foundation/miniapp-registry.ts`
- `src/lib/check-foundation/miniapp-route-guard.ts`
- `src/lib/check-foundation/destination-daemon-policy.ts`
- `src/lib/check-foundation/unit-packages.ts`
- `src/lib/destination-mission-runner.ts`
- `src/lib/destination-maintenance-adapters.ts`
- `src/lib/destination-publish-bridge.ts`
- `src/lib/destination-workflow-contract.ts`
- `src/lib/destination-mission-contract.ts`
- `src/lib/miniapp-intelligence-health.ts`
- `src/app/api/destination-*`
- `src/app/api/companies/*`

Disposition: keep until direct ClassScout runtime is gone, then remove `classscout` as a checklist-owned miniapp option or turn it into an external integration entry with no local ClassScout code path.

## Highest-Risk Separation Gaps

1. `src/app/[companyId]/page.tsx` still imports `ClassScoutHome` and falls back to ClassScout when no supported miniapp exists.
2. `src/app/api/companies/[companyId]/nav/route.ts` imports `resolveClassScoutRoutes`, keeping ClassScout navigation alive inside checklist.
3. `src/app/api/visitor/[visitorKey]/sources/import/route.ts` imports ClassScout Manhattan source import modules.
4. `src/app/api/destination-review/live-listings/route.ts` imports `destination-classscout` live listing helpers and explicitly rejects non-ClassScout destination keys.
5. `src/app/api/destination-missions/runs/[id]/verification-tick/route.ts` imports ClassScout publish verification and only allows `destinationKey=classscout`.

## Recommended Cleanup Order

1. Replace direct ClassScout company routes with a generic retired/external-miniapp redirect or a 410-style compatibility response.
2. Remove ClassScout landing, routes, home component, and refresh-lane APIs from checklist.
3. Remove ClassScout source import API and modules from checklist. Source import now belongs in standalone ClassScout.
4. Remove ClassScout live-listing and publish-verification modules from checklist after destination review routes stop importing them.
5. Remove package scripts and ClassScout-only test scripts.
6. Rewrite docs to say ClassScout is external/standalone and link to the ClassScout repo.
7. Genericize remaining shared destination code so it does not default to ClassScout when no miniapp exists.

## Do Not Remove Yet

- Generic destination mission APIs that still serve Compare.
- Generic visitor source graph and visitor capability infrastructure.
- Miniapp registry infrastructure until Compare, Trainers, and AthleteIQ behavior is verified.
- Shared docs that mention ClassScout only as an example, until product direction confirms whether external miniapps should still be referenced.

## Bottom Line

There is substantial ClassScout residue in checklist. The biggest issue is not comments; it is live runtime ownership. The source import path is the clearest stale Manhattan-specific code and should be among the first removals after a compatibility decision for `POST /api/visitor/[visitorKey]/sources/import`.
