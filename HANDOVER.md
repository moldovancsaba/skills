# check Handover

This handover is for future engineers and agents.
It is operational memory, not marketing.
It is part of the repository AI brain.

Professional operating rule:

- do not hallucinate
- do not soften explicit rules
- do not mask uncertainty with polished but vague language
- do not claim compliance when the implementation is only partial

`/Users/Shared/Projects/general-design-system` is the current checked-out General Design System source of truth for design, UI, and UX, and the governed upstream repository is `sovereignsquad/general-design-system`. Project-local files describe only implementation adapter details, migration state, validation commands, and approved exceptions.

Current GDS alignment:

- app version after GDS runtime hardening: `0.17.2`
- consumed GDS version/package: `@doneisbetter/gds@3.4.3`
- GDS package published: `2026-06-06T23:01:58.666Z`
- shared package install path: adopted through direct npm consumption of `@doneisbetter/gds`, which brings `@doneisbetter/gds-theme`, `@doneisbetter/gds-core`, and `@doneisbetter/gds-admin`
- root UI runtime: `src/components/providers.tsx` uses package-native `GdsProvider` plus GDS telemetry, confirmation, toast, notification, command, and overlay providers
- frontend import boundary: product code must import Mantine, Tabler, Recharts, and drag/drop peers only through `src/components/gds/*`
- drift gate: run `npm run audit:gds-boundary` before trusting UI changes; direct peer UI imports outside `src/components/gds/*` are forbidden
- frontend load reduction: `next.config.js` enables `experimental.optimizePackageImports` for GDS, Mantine, Tabler, and Recharts packages

Read first:

1. [docs/RULEBOOK.md](/Users/Shared/Projects/checklist/docs/RULEBOOK.md)
2. [docs/IMPLEMENTATION_RULEBOOK.md](/Users/Shared/Projects/checklist/docs/IMPLEMENTATION_RULEBOOK.md)
3. [docs/SSOT.md](/Users/Shared/Projects/checklist/docs/SSOT.md)
4. [docs/CANONICAL_TERMINOLOGY.md](/Users/Shared/Projects/checklist/docs/CANONICAL_TERMINOLOGY.md)
5. [docs/CHECK_FOUNDATION_LLD.md](/Users/Shared/Projects/checklist/docs/CHECK_FOUNDATION_LLD.md)
6. [DESIGN_SYSTEM.md](/Users/Shared/Projects/checklist/DESIGN_SYSTEM.md)

Prisma hygiene:

- after any branch switch, rebase, or detached checkout that changes `prisma/schema.prisma`, run `npm run db:generate` before trusting lint or typecheck
- the generated Prisma client is an operational dependency, not optional local cache noise
- if type errors claim Prisma models or enums are missing, verify generation drift before editing application code
- before commit or push, run `npm run build`; it is the only local guard here that proves the production import graph resolves

## Current Contract

- the full platform product name is `check`
- `Unit` means one company, organization, team, or intelligence operation
- `Block` means an optional product capability enabled inside a Unit
- `Module` means reusable functional machinery used by Blocks
- `Card` means the atomic work object managed by Modules and Blocks
- `Miniapp` means a public-facing app powered by a Unit
- `Webapp` means the B2B UI for operating `check`
- `Local` means the local AI service
- `Checklist` is an optional Block, not the platform name
- a Unit can run Sales without Checklist, Project without intelligence automation, and Miniapp Ops without treating the Miniapp as a Webapp screen
- the Sovereign Squad General Design System is the only approved product UI framework
- the shared app shell owns persisted UI language selection for `English`, `Hungarian`, `Spanish`, `Arabic`, and `Hebrew`
- visible UI language and company AI `allowedLanguages` policy are separate contracts and must not be conflated
- Mantine is an implementation peer only through GDS-owned provider/theme and `src/components/gds/*` compatibility modules
- `UnifiedCard` remains the only approved feature-level product card API while legacy surfaces are migrated to package-native GDS primitives
- `UnifiedCard` is the only approved feature-level product card API
- `UnifiedCardModal` is the only approved modal content shell for card content
- DS-owned `Text` and `Title` wrappers in `src/components/ui/typography.tsx` are the only approved general-purpose typography bridge for feature code
- first-class entity cards must expose canonical ICE visibly through the shared card header contract
- first-class entity detail surfaces must render the full persisted type-specific card payload through the shared `UnifiedCard` and `UnifiedCardModal` grammar; detail mode is not allowed to hide known entity fields behind summary-only assumptions
- typography is centrally defined in the theme and DS typography primitives only
- layout grammar is centrally defined in the shared shell/navigation primitives only
- interactions are centralized in the shared UI layer
- semantic tones are the only approved product color vocabulary
- ICE management is centralized through shared scoring contracts plus oldest-first maintenance and queue flows across upstream cards, knowledge, goals, and tasks
- score provenance is now part of the contract: agent score proposal, calibrated heuristic score, and final blended score must remain inspectable in persisted `scoreProfile` data
- score calibration now also has to consume company-specific accepted, declined, modified, and delivered history when deriving new-card impact and confidence
- task ease is now defined through delivery difficulty: dependencies, coordination burden, expertise requirement, time-to-value, and delivery history must inform the final ease signal
- the scoring-overhaul execution track is closed: factorized score traces, history-aware calibration, delivery-difficulty ease, relative-rank priority, precision-preserving tuple health, and bounded historical repair are all part of the normal live contract now
- tactical prioritization now uses the shared blended priority profile from `scoring-contract.js`; ICE remains visible, but placement also explains quality, urgency, freshness, human signal, risk, lifecycle state, and memory inputs
- canonical naming now treats `ChecklistTask` as the `taskcard` entity; `Tactical Board` is the board surface and must not be used as a card-type name
- frontier placement is relative-rank based inside the current candidate pool, with human anchors preserved ahead of AI-only ordering
- remaining score-health warnings are maintenance and observability work, not permission to reopen local or ad hoc scoring math
- Knowmore corrections are now first-class operator controls in the product surface: `PIN`, `HIDE`, `MARK_WRONG`, `REQUEST_REFRESH`, and `SUPPRESS_SOURCE`
- Knowmore health is now an explicit surface contract with `HEALTHY`, `STALE`, `DELAYED`, and `FAILED` states plus bounded repair actions
- repetitive local-AI work is represented as persisted `PipelineJob` queue records
- the webapp `AI Queue` is the primary HiTL steering surface for repetitive jobs
- worker scheduling supports explicit `AI_ONLY` and `HUMAN_GUIDED` modes
- the shipped webapp tweak surface is the `AI Queue` board, not a separate compact menu
- queue claiming now gives untouched jobs fairness priority and spreads initial claims across companies so repeated work from one company cannot starve another company's first synthesis pass indefinitely
- the deterministic planner is now the shipped runtime contract for company classification, lane refill, weakest-upstream ceilings, timeout handling, and oldest-first maintenance
- quality-engine jobs are now part of the shipped runtime contract for opportunity mining, novelty suppression, editorial gating, research policy, and feedback-pressure regeneration
- the next major runtime hardening track is documented separately in `docs/LOCAL_AI_RUNTIME_HARDENING_LLD.md`; it is the target design for strict foreground linearity, background isolation, low-memory degradation, and stale-work recovery
- the shipped foreground contract is now strict linear mode as well: one foreground worker lease, one claimed queue job, one active company context, and no parallel AI task execution in that mutation lane
- the shipped runtime step-by-step loop and recovery rules are now documented in `docs/LOCAL_AI_RUNTIME_SOP.md`
- the first major hardening slice is now shipped: snapshot refresh runs in a dedicated `snapshot-worker`, the foreground queue worker no longer shares that lane, and both lanes expose separate health/progress truth
- the next product-performance hardening slice is now projection-first webapp reads: the local AI side prepares company read models so the online app does not keep recomputing hot-route summary counts live
- the shipped follow-up slice now includes projection-backed planning summaries and projection-freshness telemetry for dashboard, tactical, and checklist surfaces
- the shipped follow-up slice now also includes server-side Unit workspace bootstrap from prepared projection data, so the first page response is no longer blocked on a client dashboard fetch
- the shipped follow-up slice now also includes server-side home/Webapp home bootstrap plus projection-backed home-card chart payloads, so the landing route no longer needs to pull full snapshot analytics documents on first load
- the shipped follow-up slice now also includes server-bootstrapped shell identity, so the authenticated sidebar can render immediately from the signed session cookie instead of waiting for a post-mount identity request
- the shipped follow-up slice now also defers home-card chart rendering until those cards approach the viewport, reducing up-front client chart work on the landing page
- the shipped Knowmore follow-up slice now also server-bootstraps the first page and uses database-level paging/filtering for knowledge rows, so the route no longer loads the full corpus and slices it in memory
- Knowmore pagination must preserve full-corpus predictive search and filtering semantics; do not reintroduce client-only slice filtering as a shortcut
- the immediate sibling audit also hardened Datacards and Topics: Datacards now uses the existing server loader for first paint, and Topics no longer loads the full company list just to resolve one company page shell
- the next follow-up slice also hardened Goals and reduced Datacard file-load cost: Goals now server-bootstrap instead of waiting on the old client waterfall, and Datacards now page uploaded files instead of loading the full file corpus on first paint
- the dashboard first response is now intentionally narrower: non-critical member and identity details are not supposed to sit on the critical product-summary path
- Miniapp workflow state must not be mounted on a generic Unit Home unless that Home is the Miniapp Ops surface; keep ClassScout, Compare, and other Miniapp telemetry confined to dedicated Miniapp Ops, review, or observability surfaces
- the shipped follow-up slice now also includes bounded cold-start projection backfill in `snapshot-worker`, so fresh or repaired environments do not sit indefinitely on missing product read models
- startup integrity scrub cooldown now persists across restarts instead of firing again on every guardian bounce
- planner telemetry now retries and degrades to best-effort on retryable Prisma write conflicts instead of failing the owning job
- the status server now exposes a lightweight `/health` probe and briefly caches expensive payload assembly
- wedged foreground work now has a 10-minute no-progress breaker; the worker is killed and the stale `RUNNING` job is auto-failed for later retry
- current human controls are drag/drop between queue columns, drag/drop reordering, and `Reset to AI Only`
- source-backed Knowmore cards now carry durable citation snapshots plus explicit conflict flags and summaries
- maintenance now includes oldest-first revisit jobs for unresolved modified candidates and declined high-potential candidates
- the webapp now exposes `Search & Answers`, `Observability`, and `Workflows` as first implementation slices for the next ideabank wave
- route-card grammar is now stricter: icon, metric, title, and optional short chart or short description only
- decorative route-card footer copy such as repeated “Access Layer” labels is not part of the live design system
- sidebar labels, route-card labels, and footer/legal meta must collapse into the approved typography roles instead of local size recipes
- ornamental all-caps button and badge defaults are not part of the live design system
- `Search & Answers` now supports entity filters, result counts, and grounded-answer confidence/evidence grouping
- first-class entity search results now open the canonical shared `/card/[uuid]` detail route rather than only module landing pages
- grounded answers now respect the active search entity-filter scope and expose that applied scope back to the operator
- grounded answers now visibly render their cited evidence cards inside the answer panel, not just summary text and counts
- grounded answers now render the named allowed scope layers in the answer panel so operators can verify the synthesis boundary at a glance
- Search & Answers now requires at least one explicitly selected layer and no longer silently falls back to all layers when the selection is empty
- Search & Answers now clears stale results and grounded answers immediately when layer selection changes, so the visible answer/result state cannot lag behind the active scope
- `Observability` now supports bounded queue repair actions and AI workload budget controls directly from the webapp mission-control surface
- workflow blueprints and enrichment waterfall policies are persisted system contracts, not local page-only state
- active workflow blueprints now become first-class `PipelineJob` records that the worker can claim and execute
- enrichment waterfall policy now influences runtime URL-intelligence provider selection for product and competitor research paths
- AI workload governance now persists `AiWorkloadUsage`, `BudgetPolicy`, and `BudgetEvent` records so queue, workflow, search/answer, and observability work can be attributed by company and feature
- task feedback now writes directly into the canonical worker feedback stream, so `DELIVER` reward propagation and lifecycle handling are not bypassed by the webapp task surface
- sales lead generation follows the same hard boundary: the hosted webapp may persist operator actions and queue intents, but all mining, scoring, ICE movement, enrichment, dedupe, and internet-search workload must happen in the local AI worker
- opportunitycards are task-like for scoring purposes: `weight` is the persisted effort alias, all write and repair paths must normalize through the shared task scoring contract, and `scoreProfile` must remain populated and inspectable instead of being dropped on manual webapp writes
- historical opportunitycard repair no longer depends only on an operator running a local script: the shared bounded repair module is executed by the worker integrity loop under a persisted global-setting version key, cursor, and status record so existing DB rows heal in authoritative bounded slices
- opportunity internet-search is now an explicit default requirement, not an optional tactic: the local AI worker must keep discovering possible company leads online, create them as `DRAFT` opportunitycards, and continue enrichment/refresh work afterward
- opportunity search now carries persisted per-company learning memory in `globalSetting`, preserves originating query/domain provenance on mined leads, and feeds operator `ACCEPT` / `DECLINE` outcomes back into search query/domain/term scoring so search quality improves from real usage
- opportunitycard lane placement now follows the same shared tactical relative-ranking discipline as the tactical board instead of fixed ICE thresholds: active sales cards are rebalanced company-by-company into the five horizons with blended-priority ordering, manual lane overrides preserved, and historical non-company brief rows plus active-declined drift repaired out of the visible board
- the hosted `sales` route now reads one prepared sales summary contract for counts and worker search-memory state via `IntelligenceSnapshot.webappProjection.salesSummary`; do not re-split those summary metrics across unrelated client endpoints
- opportunitycard detail mode must expose supporting knowledge as linked cards, not only raw lineage IDs
- flashcards now persist lineage family/cluster/origin fields alongside task lineage so duplicate suppression and future traceability are not task-only capabilities
- the active self-learning rollout is Apple-Silicon-native: `scripts/export-learning-datasets.mjs` exports the canonical training datasets, `training/` holds the rollout scaffolding, MLX / MLX-LM is the active fine-tuning path, and Ollama remains the runtime target after evaluation
- Unsloth, LLaMA-Factory, and Axolotl are parked research only right now; do not reopen them as active dependencies without an explicit architecture decision
- the internal admin-only `Evaluations` surface now also reads local `training/runs/*/run-manifest.json` plus optional `evaluation-report.json` files so MLX candidate runs are visible in-product, not only from the shell
- completed local learning runs can now be published from the Evaluations surface into the normal `OutcomeEvent` / observability ledger, so candidate progression is no longer filesystem-only
- `check` is a general intelligence platform with optional Blocks; vertical athlete, campaign-studio, or GTM-execution products do not belong in the core product contract unless explicitly promoted as governed Blocks
- the one allowed internal exception is `Evaluation Bench`, which may exist as an admin-only AI quality and regression surface under the observability/governance umbrella
- budget controls are operator-applied and reviewable: queue throttling, evaluation batching, and cache/reuse policy changes do not silently suppress critical evidence work

## Files That Matter Most

Frontend:

- [src/components/providers.tsx](/Users/Shared/Projects/checklist/src/components/providers.tsx)
- [src/app/globals.css](/Users/Shared/Projects/checklist/src/app/globals.css)
- [src/lib/semantic-theme.ts](/Users/Shared/Projects/checklist/src/lib/semantic-theme.ts)
- [src/lib/ui-state.ts](/Users/Shared/Projects/checklist/src/lib/ui-state.ts)
- [src/lib/ui-interactions.ts](/Users/Shared/Projects/checklist/src/lib/ui-interactions.ts)
- [src/components/ui/typography.tsx](/Users/Shared/Projects/checklist/src/components/ui/typography.tsx)
- [src/components/ui/unified-card.tsx](/Users/Shared/Projects/checklist/src/components/ui/unified-card.tsx)
- [src/components/ui/unified-card-modal.tsx](/Users/Shared/Projects/checklist/src/components/ui/unified-card-modal.tsx)
- [src/components/ui/app-shell.tsx](/Users/Shared/Projects/checklist/src/components/ui/app-shell.tsx)
- [src/app/[companyId]/pipeline/page.tsx](/Users/Shared/Projects/checklist/src/app/[companyId]/pipeline/page.tsx)
- [scripts/semantic-audit.mjs](/Users/Shared/Projects/checklist/scripts/semantic-audit.mjs)

Pattern-service adapter inventory:

- app shell and page header: [src/components/ui/app-shell.tsx](/Users/Shared/Projects/checklist/src/components/ui/app-shell.tsx)
- product card and modal shell: [src/components/ui/unified-card.tsx](/Users/Shared/Projects/checklist/src/components/ui/unified-card.tsx), [src/components/ui/unified-card-modal.tsx](/Users/Shared/Projects/checklist/src/components/ui/unified-card-modal.tsx)
- metric/progress card and empty/state block surfaces: [src/components/ui/app-shell.tsx](/Users/Shared/Projects/checklist/src/components/ui/app-shell.tsx)
- typography bridge: [src/components/ui/typography.tsx](/Users/Shared/Projects/checklist/src/components/ui/typography.tsx)
- semantic tone, state, and interaction adapters: [src/lib/semantic-theme.ts](/Users/Shared/Projects/checklist/src/lib/semantic-theme.ts), [src/lib/ui-state.ts](/Users/Shared/Projects/checklist/src/lib/ui-state.ts), [src/lib/ui-interactions.ts](/Users/Shared/Projects/checklist/src/lib/ui-interactions.ts)
- data toolbar/responsive data view, auth shell, and article/docs shell do not yet have one shared adapter file; that is known backlog, not alternate authority

System:

- [docs/SSOT.md](/Users/Shared/Projects/checklist/docs/SSOT.md)
- [docs/SYSTEM_DESIGN_LLD.md](/Users/Shared/Projects/checklist/docs/SYSTEM_DESIGN_LLD.md)
- [docs/LOCAL_AI_PLANNER_LLD.md](/Users/Shared/Projects/checklist/docs/LOCAL_AI_PLANNER_LLD.md)
- [docs/LOCAL_AI_QUALITY_ENGINE_LLD.md](/Users/Shared/Projects/checklist/docs/LOCAL_AI_QUALITY_ENGINE_LLD.md)
- [docs/LOCAL_AI_RUNTIME_HARDENING_LLD.md](/Users/Shared/Projects/checklist/docs/LOCAL_AI_RUNTIME_HARDENING_LLD.md)
- [docs/LOCAL_AI_RUNTIME_SOP.md](/Users/chappie/.codex/worktrees/9d01/checklist/docs/LOCAL_AI_RUNTIME_SOP.md)
- [docs/LOCAL_SELF_LEARNING_SYSTEM.md](/Users/Shared/Projects/checklist/docs/LOCAL_SELF_LEARNING_SYSTEM.md)
- [src/lib/pipeline-queue.js](/Users/Shared/Projects/checklist/src/lib/pipeline-queue.js)
- [scripts/lib/pipeline-jobs.js](/Users/Shared/Projects/checklist/scripts/lib/pipeline-jobs.js)
- [scripts/export-learning-datasets.mjs](/Users/Shared/Projects/checklist/scripts/export-learning-datasets.mjs)

## Do Not Reintroduce

- raw feature-level `Paper` surfaces
- raw feature-level `Card` surfaces for product-owned cards
- raw feature-level DOM wrappers where approved Mantine/DS primitives should be used
- feature-level `className` hooks
- raw Mantine `Text` / `Title` imports in feature code
- legacy color aliases like `blue`, `brand`, `orange`, `green`, `purple`, `teal`
- ad hoc text sizing and custom title scales in feature code
- local transition or hover systems for product surfaces
- alternative card shells
- “one-off” visual exceptions without updating the rulebook and audit
- athlete/coaching products, content-studio products, and GTM-execution products in Webapp navigation or core `check` docs unless explicitly promoted as governed Blocks

## Mandatory Update Rule

If you change any of these:

- stack
- theme
- card primitives
- modal shell rules
- typography primitives
- semantic tones
- state semantics
- interaction primitives
- AI pipeline stages
- scoring rules
- worker queue contract
- scheduling mode contract

Then you must update in the same work:

1. [docs/RULEBOOK.md](/Users/Shared/Projects/checklist/docs/RULEBOOK.md)
2. the directly affected contract doc
3. this handover

## Done Means

The work is not done until:

- code is updated
- docs are updated
- `npm run lint` passes
- `npm run audit:docs` passes
- `npm run audit:semantic` passes
- `npx tsc --noEmit` passes
- `npm run build` passes

## Pipeline Queue Notes

- The worker now consumes persisted queue jobs before the broader synthesis cycle.
- The planner and quality engine are the authoritative queue families now; legacy `COMPANY_SYNTHESIS` and `FULL_MAINTENANCE` remain compatibility paths, not the main operating model.
- The shipped foreground worker now enforces singleton linear execution through a local lock file lease plus one-job claim limits. Do not loosen that without updating the runtime hardening docs and the SOP in the same change.
- The duplicate full-company queue sync that used to happen before every claim has been removed. The shipped foreground worker no longer performs inline shard or global queue sync on claim miss. If claim returns no runnable job, foreground force-wakes `snapshot-worker` and leaves queue-topology refresh to the background lane.
- `snapshot-worker` owns bounded intelligence snapshot refresh. Do not move snapshot refresh back into `sync.js`; that would reintroduce the exact starvation problem this hardening slice removed.
- `snapshot-worker` also owns scheduled runtime verification. The latest verification report is persisted, exposed by `status-server`, and rendered on `/local-ai`.
- `snapshot-worker`, `guardian`, and `status-server` are support processes only. They must not become alternate queue runners or parallel AI mutation lanes.
- productive queue work now refreshes queue topology for the touched company directly; if that direct refresh fails, the company falls back into a topology-dirty background retry queue owned by `snapshot-worker`.
- the same touched-company pattern now also matters for product projections: company list/dashboard/nav should prefer `IntelligenceSnapshot.webappProjection`, with background/local-AI refresh owning projection freshness instead of hot-route live fan-out.
- after those shipped read-model and server-bootstrap slices, further dashboard slowness should be attacked with authenticated live-route profiling (`Server-Timing` plus `npm run profile:webapp`), not blind payload trimming.
- future mini-app work must follow `docs/IMPLEMENTATION_RULEBOOK.md`; do not repeat the pattern where prepared data exists but the webapp still rebuilds or overfetches live state on hot routes.
- future Block, Module, and Miniapp work must also follow `docs/CHECK_FOUNDATION_LLD.md`; do not add product behavior without explicit Unit, Block, Module, Card, Webapp, Local, and Miniapp boundaries.
- Human drag-and-drop on the `AI Queue` board switches jobs into `HUMAN_GUIDED` mode.
- `Reset to AI only` clears manual queue influence and returns scheduling to autonomous control.
- Score-health alert repair is now expressed through persisted queue/repair intents; the local AI worker is the only authority that escalates queue work through the shared queue contract.
- Workflow edits, Knowmore repair actions, and Observability repair actions now enqueue persisted worker commands instead of executing queue authority in app routes.
- Destination mission action routes now enqueue `DESTINATION_MISSION_DAEMON` work through `src/lib/destination-mission-queue.ts`; do not reintroduce ClassScout/Compare discovery, extraction, scoring, preparation, persistence, or mission-state execution inside Webapp API routes.
- Topic/source/file ingress routes no longer derive authoritative scores in the webapp layer; they persist raw rows and let the local AI system score them later.
- Frontier recompute assigns tactical columns by relative blended-priority rank, not raw ICE alone, while preserving manual human drag/drop anchors.
- Historical flashcard, task, and opportunitycard rescoring must continue through the bounded `scripts/repair-ice-scores.js` path or the shared worker-owned repair module behind it; do not replace them with one-off bulk rewrites.
- The Refiner now owns duplicate-cluster tagging and split-aware task refinement in addition to merge/suppress/enrich behavior. Do not collapse it back into text-only rewriting.
- Budget governor is observability-first: usage/cost values are estimates unless explicitly marked actual, and controls are recorded as events/policies rather than hidden scheduling overrides.
- Future autonomous implementation selection must ignore ideabank-only items unless an operator explicitly promotes them into an active delivery column first.

## 2026-06-03 Active GitHub Issue / Board Notes

- Canonical quality reference remains `sovereignsquad/general-design-system#81`; UI and UX delivery must use the General Design System only.
- Current active refactor parents on the repository project board are `#400 Three-Lane Runtime Stabilization` and `#402 CHECK Foundation Refactor`.
- Issue `#370 Queue: Playlist Lane mutation authority` has local implementation evidence and should be moved to `Review (ALMOST)` once the GitHub GraphQL rate limit resets.
- The `#370` evidence comment already exists: `https://github.com/sovereignsquad/checklist/issues/370#issuecomment-4607616319`.
- The failed board mutation was not an implementation failure. The blocker was GitHub GraphQL rate limiting: `API rate limit exceeded for user ID 2206999`.
- Evidence to add or preserve on `#370`: miniapp ops actions now enqueue normal operator mutation requests through `src/lib/miniapp-ops-queue.ts`; only worker-secret calls execute `executeMiniappOpsAction` directly; visitor research actions are mapped into persisted `PipelineJob` payloads in `scripts/lib/pipeline-jobs.js`; route inventory classifies `/api/miniapps/:miniappKey/ops/actions` as mutating `PLAYLIST` and `/api/miniapps/:miniappKey/intelligence-contract` as read-only `SYSTEM_HEALTH`.

## 2026-06-06 GitHub Project Board Handover

This section captures the GitHub repository project-board work for the high-value reliability/product deliverables.

Canonical issue-quality reference:

- `sovereignsquad/general-design-system#81`
- All UI, UX, and frontend work in these issues must use `sovereignsquad/general-design-system` only.
- Accessibility is mandatory.
- Issues must remain implementation-ready, not umbrella placeholders.

Active project board:

- Owner: `sovereignsquad`
- Repository: `sovereignsquad/checklist`
- Project: `{checklist} - From IDEA to LIVE`
- Project number: `3`
- Status field target: `Todo (NEXT)`
- Status option id: `f75ad846`
- Required board field update: set Status to `Todo (NEXT)` and set `Execution Order` to the sequence below.

GitHub API status:

- GitHub GraphQL rate limit reached `remaining: 0`.
- Observed reset: `2026-06-06T19:01:38Z`.
- REST issue reads still worked; GraphQL project mutations did not.
- GraphQL quota reset at `2026-06-06T19:02:23Z` with `remaining: 5000`.
- Board mutations were applied after reset and verified from project item field values.

Top-10 high-value reliability/product deliverables to keep represented on the board:

1. `#450 Runtime: Worker Progress Contract - Explicit Active Job Telemetry`
   - Project item id: `PVTI_lADOEEuBB84BToX-zgu65sU`
   - Execution Order: `1`
   - Rationale: fixes operator truth for active work and removes queue fallback inference.
2. `#362 Local Runtime: Memory Steward process inventory - classify CHECK, dev, Ollama, database, and unknown processes`
   - Project item id: `PVTI_lADOEEuBB84BToX-zguWy-M`
   - Execution Order: `2`
   - Rationale: creates read-only process ownership and memory visibility.
3. `#363 Local Runtime: Memory Steward policy planner - memory bands, safe actions, and deterministic cleanup ordering`
   - Project item id: `PVTI_lADOEEuBB84BToX-zguWzCI`
   - Execution Order: `3`
   - Rationale: converts inventory and pressure into explainable non-destructive plans.
4. `#364 Local Runtime: Ollama lifecycle steward - single service policy, idle model unload, and generation-safe guards`
   - Project item id: `PVTI_lADOEEuBB84BToX-zguWzHI`
   - Execution Order: `4`
   - Rationale: addresses high-memory local model risk without breaking active generation.
5. `#365 Local Runtime: Guardian Memory Steward executor - guarded cleanup, recovery, and audit trail`
   - Project item id: `PVTI_lADOEEuBB84BToX-zguWzKs`
   - Execution Order: `5`
   - Rationale: gives Guardian the only approved execution path for guarded cleanup.
6. `#366 UI: Local Memory Steward operations surface - GDS-only memory, process, Ollama, and cleanup visibility`
   - Project item id: `PVTI_lADOEEuBB84BToX-zguWzQM`
   - Execution Order: `6`
   - Rationale: makes memory pressure and safe actions visible to operators.
7. `#367 Quality: Local Memory Steward verification - chaos tests, release gates, docs, and rollback proof`
   - Project item id: `PVTI_lADOEEuBB84BToX-zguWzVc`
   - Execution Order: `7`
   - Rationale: makes steward delivery releasable with deterministic proof.
8. `#318 Operations: Runtime Action Console - retry/replay/recover/rollback UI control surface`
   - Project item id: `PVTI_lADOEEuBB84BToX-zguTP5M`
   - Execution Order: `8`
   - Rationale: gives customers and operators safer recovery controls for runtime work.
9. `#242 Runtime: Workflow orchestration - ClassScout acquisition, drafting, and review job family`
   - Project item id: `PVTI_lADOEEuBB84BToX-zgt243s`
   - Execution Order: `9`
   - Rationale: product-value path for durable destination workflow execution.
10. `#254 Runtime: Candidate attempt loop - bounded reject, retry, and advance executor for rulebook missions`
    - Project item id: `PVTI_lADOEEuBB84BToX-zgt4S_o`
    - Execution Order: `10`
    - Rationale: product-value path for autonomous mission progress after weak candidates.

Known board mutation status:

- The 10 issues above were added to project `3`.
- Project item ids were resolved through low-cost per-issue GraphQL queries before the rate limit was exhausted.
- On `2026-06-06T19:02Z`, all 10 items were updated to `Status = Todo (NEXT)`.
- On `2026-06-06T19:02Z`, all 10 items were updated to the execution order listed above.
- Verification query confirmed every item had `Status = Todo (NEXT)` and the expected `Execution Order`.
- Board completion is no longer deferred.

Suggested GraphQL mutation shape after reset:

```graphql
mutation($projectId:ID!, $itemId:ID!, $fieldId:ID!, $optionId:String!) {
  updateProjectV2ItemFieldValue(input:{
    projectId:$projectId,
    itemId:$itemId,
    fieldId:$fieldId,
    value:{singleSelectOptionId:$optionId}
  }) {
    projectV2Item { id }
  }
}
```

Use the analogous `number` value mutation for the `Execution Order` field. Resolve field ids again after the rate limit resets instead of guessing.

Local delivery evidence already collected before this handover update:

- `npm run test:runtime-hardening` passed.
- `npm run test:runtime-chaos` passed.
- `npm run lint` passed.
- `npm run build` passed.
- Final release commit: `9df492f Harden worker progress telemetry`.
- Final app version: `0.17.1`.
- Commit `9df492f` was pushed to `origin/main`.
- Local foreground, snapshot, and status services were restarted after push.
- Final `npm run verify:runtime` passed with `13/13` checks.
- Local runnable inventory was cleaned to `Forbidden 0` by explicitly classifying:
  - `api:/api/customer-value/delivery`
  - `api:/api/destination-missions/daemon/health`
  - `script:scripts/customer-value-delivery.mjs`
- Local status API was reachable at `http://127.0.0.1:10006/api/status`.
- CHECK local processes were observed running: `check-local-guardian`, `check-local-foreground`, `check-local-snapshot`, and `check-local-status`.
- Memory Steward status was reachable and initially showed `resourceBand: CRITICAL` during the audit; after runtime restart/recovery it reported `resourceBand: HEALTHY` with about `3.1GB` free.
- Evidence to add or preserve on `#372`: destination mission run action routes `discover-candidates`, `extract-candidate`, `score-candidate`, `prepare-candidate`, `execute-next-attempt`, and `execute-until-blocked` now return queued Playlist receipts through `src/lib/destination-mission-queue.ts`; direct ClassScout/Compare runtime helper imports are forbidden by `scripts/test-intent-api-no-execution.mjs` and `scripts/test-three-lane-route-contracts.mjs`.
- Proof commands from this slice: `npm run audit:local-runnables`, `npm run test:intelligence-unit-refactor`, `npm run test:local-execution-lanes`, `npm run test:three-lane-routes`, `npm run test:miniapp-ops-console`, `npm run test:unit-capability-v2`, `npm run lint`, and `npm run build`.
- Next issue candidate after `#370`: continue `#372 Direct execution migration` only with route-by-route evidence. Do not invent broad cleanup tickets; each follow-up must name the route, the mutation authority, the expected queue intent, retry/timeout behavior, recovery path, and contract test.
