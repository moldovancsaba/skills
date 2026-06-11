# Changelog

## Unreleased

### Fixed

- macOS local AI memory checks now use effective available memory, including safely reclaimable file-backed/speculative/purgeable pages, so ClassScout work does not stall on raw free-page readings when system pressure is acceptable.
- ClassScout local AI launch mode now keeps miniapp research jobs linear under memory pressure, preventing low-memory fan-out slices from competing for the same 16 GB host.
- destination workspace semantic-audit violations in the content-ops, review, and rulebook-runner surfaces
- unit board mutations now keep optimistic creates visible through transient write failures and automatically retry transient failures instead of removing cards silently
- board API write failure detection now broadens Atlas quota detection for quota/blocked-storage errors and enforces request timeouts on client calls

### Added

- candidate projection hardening for public miniapp and visitor candidate endpoints so internal pipeline fields are hidden by default while `includeInternal` remains available for trusted operator flows
- compare and visitor candidate APIs now drop projection-blocked items by default (`source-only`, weak source trust, inherited legacy/placeholder signals, and fake/static content), with `includeBlocked` available for operator-led diagnostics

### Changed

- local AI resource bands and hard-pause thresholds are environment-tunable, with the ClassScout host profile reserving more memory for Ollama, Codex, Remote Desktop, MongoDB, and Next.js.
- product architecture docs now define `check` as the platform, with Unit, Block, Module, Card, Miniapp, Webapp, and Local as canonical terms
- added a low-level `check` foundation plan for optional Block enablement, Miniapp parity, and safe migration from legacy profile/module naming
- repo guards and repository operating docs now treat `npm run db:generate` as an explicit verification step before lint and typecheck when Prisma schema definitions may have changed
- repo guards and repository operating docs now require `npm run build` before publish so missing production bundle dependencies are caught before merge
- sales opportunitycards now expose linked supporting Knowmore cards in the review surface instead of raw lineage IDs alone
- the `sales` workflow now reads prepared summary/search state through a dedicated sales summary read model instead of splitting those counts across separate client-side summary fetches

## v0.16.0 - 2026-05-15

This release completes the local AI planner rollout and ships the first full Local AI Quality Engine.

### Added

- deterministic planner queue taxonomy for bootstrap, maintenance, and quality work
- global oldest-first maintenance refresh with real rewrite, rescore, taxonomy, and source-refresh behavior
- source/datacard lifecycle contract that caps flashcard status by weakest upstream evidence
- persistent manual lane override cooldown for tactical tasks
- UI language bootstrap for first paint, including RTL `dir` handling
- canonical quality contract and observability surfaces
- research policy engine for create and refresh flows
- flashcard and task opportunity-mining jobs
- novelty suppression and duplicate-cluster checks before publish
- feedback-pressure model that influences recurring regeneration
- editorial quality gate for create and refresh paths
- regression scripts for planner, quality, research policy, novelty, feedback pressure, and editorial gate

### Changed

- queue authority is now explicit and planner-owned instead of relying on broad synthesis as the main operating model
- pipeline docs and low-level design now describe the shipped planner and quality engine instead of a target rollout
- release metadata is aligned on `0.16.0`

### Operational Outcome

- the local AI worker is deployed on the live local runtime and reports healthy status after the quality-engine rollout
# 2026-05-29

- shipped a first-class ClassScout operator home at `/{companyId}/classscout` with a canonical landing-summary API, bounded degraded/empty states, and normalized launch actions into Content Ops, Live Catalog Queue, Project Board, and Mission Control
- added ClassScout-aware sidebar visibility and count wiring through the company nav contract
- corrected ClassScout entry-point behavior so Content Ops launches the real review queue tab
