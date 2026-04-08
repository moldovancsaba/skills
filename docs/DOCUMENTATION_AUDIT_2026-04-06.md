# Checklist Documentation Audit

Date: `2026-04-06`
Scope: repository documentation versus current codebase in `src/`, `prisma/`, and `package.json`
Status: audit complete, documentation is inconsistent and needs consolidation

## Executive Summary

The documentation set has significant drift.

The highest-risk problems are:

1. product version is documented as both `v0.1.0`, `v0.6.0`, and `v1.0`
2. production URLs point to multiple different domains
3. route maps and project structure descriptions do not match the current Next.js app
4. architecture and auth descriptions mix current behavior with older system history
5. some documents are active operational docs, while others are stale migration notes presented as current truth

The codebase currently presents the strongest source of truth for:

- app version: `0.6.0`
- framework: `Next.js 16.2.2`
- app title: `Checklist Marketing OS`
- route family: `/:companyId`, `/:companyId/data`, `/:companyId/knowmore`, `/:companyId/nba`
- current app structure: `src/app/[companyId]/...`

## Audit Method

Compared these docs against the repo:

- `README.md`
- `SPEC.md`
- `DESIGN_SYSTEM.md`
- `RELOCATION_README.md`
- `docs/ONBOARDING.md`
- `docs/PAPERCLIP-INTEGRATION.md`
- `docs/LOCAL_AI_PIPELINE.md`
- `docs/KNOWMORE_DELIVERY_PLAN.md`

Compared those against:

- `package.json`
- `src/app/**`
- `src/lib/**`
- `prisma/schema.prisma`

## Findings

### P0: Versioning is contradictory

Severity: critical

Conflicts:

- `README.md` declares current app version `v0.1.0`
- `SPEC.md` declares `Production (v1.0)`
- `package.json` version is `0.6.0`
- `prisma/schema.prisma` default release-related fields also reference `0.6.0`

Why it matters:

- operators cannot tell what is actually deployed
- release notes, support, and issue triage become unreliable
- downstream docs inherit the wrong assumptions

Recommended truth:

- treat `package.json` and release helpers as canonical for app version
- current documented version should be `v0.6.0` unless intentionally changed in code

### P0: Production URL and deployment identity are contradictory

Severity: critical

Conflicts:

- `README.md` points to `https://checklist.messmass.com`
- `docs/ONBOARDING.md` points to `https://checklist.messmass.com`
- `docs/PAPERCLIP-INTEGRATION.md` points to `https://checklist.messmass.com`
- `RELOCATION_README.md` points to `https://checklist-narimato.vercel.app`
- current live product used by the team is `https://checklist.sovereignsquad.com`

Why it matters:

- onboarding is error-prone
- integrators may call the wrong environment
- crawler and auth callback documentation can silently break

Recommended truth:

- define one canonical production URL
- define one optional preview/development URL policy
- remove hardcoded legacy domains from operational docs

### P0: Route and app-structure docs do not match the actual app

Severity: critical

Conflicts:

- `README.md` correctly includes `/:companyId/knowmore`
- `SPEC.md` omits `/:companyId/knowmore`
- `RELOCATION_README.md` describes an old structure with `dashboard`, `products`, `customers`, and `competitors` as the main route hierarchy
- actual current app includes:
  - `src/app/[companyId]/page.tsx`
  - `src/app/[companyId]/data/page.tsx`
  - `src/app/[companyId]/knowmore/page.tsx`
  - `src/app/[companyId]/nba/page.tsx`

Why it matters:

- contributors build against the wrong navigation model
- maintenance work gets routed to the wrong files
- future UX work will repeat the same inconsistency problems

Recommended truth:

- document the company-scoped route structure from `src/app/[companyId]/...`
- clearly separate company-scoped routes from global marketing/admin routes

### P1: Architecture docs mix current behavior with legacy history

Severity: high

Conflicts:

- `README.md` says `Next.js 16.2.2`
- `SPEC.md` says `Next.js 14`
- `SPEC.md` frames the local side as `Local (mvp-factory-control)` with a sync script on port `3001`
- other docs describe a looser local AI layer and shared database model without that same operational detail

Why it matters:

- engineering decisions get made on stale assumptions
- operational setup and debugging guidance become unreliable

Recommended truth:

- keep one current architecture document
- move historical migration notes into a clearly labeled archive section
- only document runtime details that still exist in code or deployment

### P1: Authentication documentation is stale

Severity: high

Conflicts:

- `SPEC.md` states `doneisbetter.com OAuth2 with PKCE`
- current code relies on environment-driven auth settings via:
  - `SSO_CLIENT_ID`
  - `SSO_CLIENT_SECRET`
  - `SSO_AUTH_URL`
  - `SSO_TOKEN_URL`
- `src/lib/auth.ts` also defaults `NEXT_PUBLIC_BASE_URL` to the old `messmass` domain

Why it matters:

- auth setup is a high-friction area
- stale provider branding creates avoidable deployment mistakes

Recommended truth:

- docs should describe auth as environment-configured SSO
- if a specific provider is still required, document it in exactly one place and keep the callback/base URL aligned

### P1: API documentation is partially stale

Severity: high

Conflicts:

- `README.md` documents endpoints that do not cleanly match current route files, including:
  - `/api/knowmore/actions`
  - `/api/knowmore/sync`
  - `/api/agent/local`
  - `/api/webhook/trigger`
- current `src/app/api` includes:
  - `companies`
  - `competitors`
  - `customers`
  - `data-files`
  - `feedback`
  - `knowmore`
  - `nba`
  - `products`
  - `release`
- `SPEC.md` still emphasizes `/health`, `/sync`, `/force` sync endpoints as active system endpoints

Why it matters:

- integrators and internal agents will target the wrong interfaces
- API consumers cannot trust the docs

Recommended truth:

- generate or maintain the API inventory directly from `src/app/api`
- mark non-webapp endpoints as external/local services if they are still supported

### P2: The design-system document is useful but not governed as canonical UI policy

Severity: medium

Conflicts:

- `DESIGN_SYSTEM.md` defines good component rules, but its page coverage table is already partly stale and tied to a previous migration wave
- it does not clearly distinguish:
  - design tokens
  - layout grammar
  - component ownership
  - migration status

Why it matters:

- teams will treat it as advisory instead of enforceable
- UI drift returns when page-level exceptions appear

Recommended truth:

- keep one LTS design-system doc
- split it into:
  - layout grammar
  - primitives/components
  - page-shell rules
  - banned legacy patterns
  - migration status

### P2: `RELOCATION_README.md` reads like current truth but is now a legacy handoff file

Severity: medium

Conflicts:

- outdated deployment URL
- outdated project structure
- outdated status table
- outdated next-task list
- stale commit reference

Why it matters:

- new contributors can easily follow the wrong plan
- old temporary migration notes are treated as current operating instructions

Recommended truth:

- either delete it or move it to `docs/archive/`
- if retained, relabel it explicitly as historical context

### P3: Formula and terminology are mostly compatible but not unified

Severity: low

Conflicts:

- `README.md`, `docs/ONBOARDING.md`, and `docs/LOCAL_AI_PIPELINE.md` describe ICE as:
  - `impact * (confidence / 10) * ease`
- `docs/PAPERCLIP-INTEGRATION.md` describes ICE as:
  - `Impact × (Confidence / 100) × Ease × 10`

These are mathematically equivalent, but the repo should use one presentation style.

Why it matters:

- low implementation risk
- medium cognitive overhead

Recommended truth:

- standardize all docs on one formula and one example set

## Canonical Source Recommendations

The repo needs explicit ownership by topic.

Recommended ownership:

- `README.md`
  - product overview
  - current status
  - current route map
  - current stack
  - current setup steps
- `SPEC.md`
  - current product and system specification only
  - no historical migration notes
  - no stale deployment assumptions
- `docs/ONBOARDING.md`
  - operator/developer setup
  - environments
  - bootstrapping
  - route and API quick reference
- `docs/LOCAL_AI_PIPELINE.md`
  - online/local contract only
- `DESIGN_SYSTEM.md`
  - UI grammar and component rules only
- `docs/PAPERCLIP-INTEGRATION.md`
  - integration contract only, if Paperclip is still active
- `RELOCATION_README.md`
  - archive or delete

## Recommended Remediation Plan

### Phase 1: stop the drift

1. Update `README.md` to match the current app version, domain, route map, and API inventory
2. Rewrite `SPEC.md` so it reflects the current shipped product instead of mixed current plus legacy state
3. Correct `docs/ONBOARDING.md` production URLs and auth language
4. Mark `RELOCATION_README.md` as legacy or move it to an archive folder

### Phase 2: establish documentation grammar

1. add a short documentation governance section to `README.md`
2. define canonical owner per document
3. require doc updates alongside route, API, schema, auth, and design-system changes

### Phase 3: reduce future entropy

1. derive route and API inventories from code where practical
2. add a lightweight documentation review checklist to PRs
3. remove obsolete product-history notes from active operational docs

## Recommended Immediate Edits

If only the highest-value fixes are made first, do these:

1. normalize all production URLs
2. normalize all version references to `v0.6.0`
3. update `SPEC.md` route map and framework version
4. archive `RELOCATION_README.md`
5. standardize the ICE formula wording

## Conclusion

The repo does not have a documentation grammar yet.

It has several individually useful documents, but they do not share a single canonical operating model. The result is exactly the failure mode you called out in the UI work: drift, duplication, and local hardcoding of assumptions.

The fastest durable fix is not to write more docs. It is to:

- reduce overlapping docs
- assign each document a single job
- align every active document with the actual codebase
- archive or remove historical notes that currently masquerade as current truth
