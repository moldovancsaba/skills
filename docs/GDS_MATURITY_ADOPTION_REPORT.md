# GDS Maturity Adoption Report

Generated: 2026-06-07
Package: `@doneisbetter/gds@3.4.3`
Manifest: `gds-adoption.json` schema version 1
Source registry: `getGdsRecommendedMaturityCapabilities()`

This report is the check-owned backlog for GDS maturity adoption. It reads the upstream GDS capability registry as the product contract and maps each capability to local evidence, remaining gaps, and a guarded next-issue template. It does not create GitHub issues automatically.

## Scan Counts

- capabilities: 7
- adopted: 3
- in-progress: 4
- planned: 0
- not-started: 0
- exceptions: 0

## Capability Status Backlog

| Capability | Local status | Upstream issue | Local evidence | Remaining gap |
| --- | --- | ---: | --- | --- |
| `admin-delivery` | in-progress | 240 | `src/components/gds/reporting.tsx`; `src/app/[companyId]/analytics/analytics-client.tsx` | Migrate remaining admin/resource manager surfaces to package-native admin contracts and expand form/table state coverage. |
| `runtime-feedback` | adopted | 241 | `src/lib/gds-operation-feedback.tsx`; `scripts/test-gds-runtime-feedback.mjs` | Upstream reason-required destructive confirmations are still needed for full parity. |
| `foundation-surfaces` | in-progress | 242 | `src/components/ui/app-shell.tsx`; `scripts/test-gds-app-shell-adapters.mjs` | Replace temporary primitives, typography, card, chart, and drag/drop barrels as GDS package exports land. |
| `global-readiness` | in-progress | 243 | `src/lib/ui-i18n.tsx`; `src/lib/gds-locale-bootstrap.generated.ts`; `scripts/test-gds-runtime-provider.mjs` | Expand route-copy coverage, text expansion checks, and RTL mobile visual smoke coverage. |
| `adoption-governance` | adopted | 244 | `gds-adoption.json`; `scripts/verify-gds-adoption.mjs`; `scripts/verify-gds-compliance.mjs`; `scripts/test-gds-strict-enforcement.mjs` | Continue reducing approved adapter count and expiring native-dialog strict exceptions as package-native replacements land. |
| `theme-operations` | in-progress | 245 | `src/components/providers.tsx`; `src/lib/semantic-theme.ts`; `scripts/test-gds-style-contract.mjs` | Move remaining theme overrides and semantic chart mappings into upstream GDS theme contracts. |
| `product-system` | adopted | 246 | `docs/GDS_MATURITY_ADOPTION_REPORT.md`; `scripts/test-gds-maturity-adoption.mjs` | Optional GitHub issue sync remains manual until owner, scope, dependencies, and primitive mapping are present. |

## Issue Creation Guard

Any future GDS adoption issue created from this report must include:

- owner
- scoped route or adapter boundary
- acceptance criteria
- dependencies
- GDS primitive mapping
- rollback plan
- deterministic verification command

No vague umbrella issues should be generated from this report. If a capability is partially adopted, the next issue must name the exact remaining adapter or surface and the package-native GDS contract that will replace it.

## Verification

Run:

```bash
npm run test:gds-maturity-adoption
npm run verify:gds-compliance
npm run audit:docs
npm run build
```
