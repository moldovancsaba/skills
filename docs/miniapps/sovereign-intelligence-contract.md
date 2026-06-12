# Sovereign Miniapp Intelligence Contract

Canonical issue standard: https://github.com/sovereignsquad/general-design-system/issues/81

## Purpose

CHECK miniapps must operate as sovereign intelligence systems:

```text
datacards + flashcards
  -> research tasks
  -> web evidence
  -> opportunitycards
  -> candidates
  -> drafts and review cards
  -> public content cards
  -> public verification
  -> learning memory
  -> next research pass
```

The success metric is verified public miniapp content. A source-card pool, workflow-run count, publish attempt count, or repeated update of the same public ID is not success.

## Contract Runtime

The runtime contract is implemented in:

- `src/lib/miniapp-intelligence-contracts.ts`
- `src/app/api/miniapps/[miniappKey]/intelligence-contract/route.ts`
- `src/app/api/visitor/[visitorKey]/intelligence-contract/route.ts`

Destination mission runs store the resolved contract key and validation state in metadata:

- `miniappIntelligenceContractKey`
- `miniappIntelligenceContractValid`
- `miniappIntelligenceContractErrors`

## Required Contract Sections

Each miniapp declares:

- `domainProfile`: title, description, allowed content types, forbidden signals.
- `coverageGoals`: target public visible-card counts by category/geography.
- `researchPolicy`: free search providers, official-source requirement, crawl limits, timeouts.
- `promotionPolicy`: evidence, authority, candidate, and `0..1000` content-quality thresholds, public verification requirement.
- `failurePolicy`: retryable, terminal, and learning-memory codes.
- `verificationPolicy`: public API and visible-card counting rules.

## Capability Scopes (Contract Rule)

Miniapp capability checks are evaluated on explicit parent scope chains:

- `check`
- `check.miniapp`
- `check.miniapp.visitors`
- `check.miniapp.visitors.compare` for Compare
- `check.miniapp.visitors.external-miniapp` for External Miniapp

This means:

- compare/external-miniapp must inherit shared check and miniapp-level rules.
- compare/external-miniapp level rules apply at `check.miniapp.visitors.compare` and `check.miniapp.visitors.external-miniapp`.
- no issue can treat `External Miniapp` or `Compare` as independent from the parent `check`/`check.miniapp` contracts.

Implementation reference:

- `src/lib/visitor-capability-resolver.ts`

## Mandatory Invariants

- `promotionPolicy.successMetric` must be `verified_public_visible_cards`.
- `promotionPolicy.sourceCardInventoryIsSuccess` must be `false`.
- `promotionPolicy.minimumContentQualityScore` must be at least `500` for production publishing; candidates below this score stay in research/rework.
- `verificationPolicy.countDuplicateUpdatesAsNewCards` must be `false`.
- Retryable and terminal failure codes must not overlap.
- Invalid contracts fail closed with a `422` API response.

## Design System Requirement

All UI and operator surfaces that expose contract status, research state, opportunitycards, burst progress, or verification must use only the Sovereign Squad General Design System.

No parallel component library, custom visual language, or non-GDS interaction primitive is allowed.

Accessibility is mandatory:

- keyboard access
- visible focus states
- semantic HTML
- screen-reader labels and announcements
- contrast through GDS tokens
- reduced-motion support

## Compare Visitor Contract

The Compare visitor contract is `compare.visitor.sovereign@v1`.

Its initial coverage goals target verified public cards for:

- Shooting Ranges
- Sport Shooting Clubs
- Shooting Courses
- Competitions
- Hunting Associations

The contract explicitly forbids treating manually seeded source cards as the output. Source pages are evidence discovered by research tasks; they are not miniapp inventory.

### Compare Datacard Package Guidance

At startup and on maintenance, the Compare local intelligence model should start with these data-card clusters:

- `source-discovery`
  - Search seeds and proven sources (for example "shooting range", "target shooting", "hunting association")
- `category-rules`
  - Allowed and forbidden category terms per geography
- `quality-thresholds`
  - Minimum evidence + source authority + freshness constraints for promotion
- `learning-rules`
  - `forbid`, `suppress`, and `retry` rules produced by feedback and operator corrections
- `avoidance-rules`
  - Terms that must force `REWORK_REQUIRED` even when confidence is high (for example, birthday-themed, placeholder-only, fake/static content)

This structure is not a second-card type system; it is an operational content source for local intelligence planning and maintenance loops.

## External Miniapp Compatibility Contract

The External Miniapp visitor contract is `external-miniapp.visitor.sovereign@v1`.

It preserves the existing visitor/class workflow while aligning it to the same public verification and learning-memory rules.

The Manhattan launch profile, taxonomy, gate behavior, rollback path, and verification commands are documented in `docs/miniapps/external-miniapp-manhattan-launch-contract.md`.

## Research Task Planner

The planner is implemented in `src/lib/miniapp-research-planner.ts`.

It converts datacards, flashcards, learning memory, public verification status, and the active sovereign contract into deterministic `miniapp_research_task` queue records. These records are internal work items stored in `DestinationSourceDocument` with `check://miniapp-research-task/...` identities. The planner does not create SOURCE cards.

Planner behavior:

- New research tasks start as `QUEUED`.
- Existing non-exhausted task status and attempt counts are preserved during replanning.
- Tasks carry `sourceCardInventoryIsSuccess: false` and `verified_public_visible_cards` metadata.
- Priority is deterministic: `0.45 * coverage_gap + 0.25 * source_diversity + 0.20 * historical_success + 0.10 * freshness`.
- Blocked datacard domains and blocking learning-memory source terms are excluded from generated queries.

Planner APIs:

- `POST /api/visitor/[visitorKey]/research/tasks/plan` requires admin membership and accepts `companyId`, optional `destinationKey`, `targetVisibleCards`, and `limit`.
- `GET /api/visitor/[visitorKey]/research/tasks` requires company membership and returns queued tasks for burst workers and operator surfaces.

## External Miniapp Manhattan Source Import

The External Miniapp Manhattan source import lane is implemented in `src/lib/external-miniapp-source-import.ts`, `src/lib/external-miniapp-source-import-server.ts`, and `POST /api/visitor/[visitorKey]/sources/import`.

Import format:

```json
{
  "companyId": "company-id",
  "destinationKey": "external-miniapp",
  "dryRun": true,
  "importBatchId": "external-miniapp-manhattan-2026-06-11",
  "leads": [
    {
      "url": "https://provider.example/classes",
      "title": "Provider name",
      "category": "STEM",
      "neighborhood": "Upper West Side",
      "extractionHints": ["Look for age ranges and registration URLs."],
      "tags": ["robotics"],
      "sourceUrls": ["https://provider.example/register"]
    }
  ]
}
```

Operational behavior:

- The route requires admin membership and defaults to `dryRun: true`.
- Each request is capped at 500 leads.
- Writes go through `createVisitorSourceDatacard`, so repeated imports upsert by canonical URL.
- Source datacards carry Manhattan launch metadata: `coverageGoalIds`, `geography`, `neighborhoods`, `tags`, and `importBatchId`.
- Official and government sources default to `trusted`; directories and calendars default to `usable`; social sources default to `weak`; adult-only/travel-guide signals become `blocked`.
- `autoPublishEligible` remains `false`; source imports seed research and review, not direct public publishing.

Rollback:

- Bad imports can be located by `importBatchId`.
- Individual source rows can be updated to `trustTier: "blocked"` with `blockedReasons`, or deleted through existing source maintenance tools if the whole batch is wrong.
- Because imports upsert by canonical URL, rerunning a corrected batch replaces the datacard metadata without creating duplicate source rows.

## Evidence Runtime

The evidence runtime is implemented in `src/lib/miniapp-evidence-runtime.ts`.

It consumes queued research tasks, searches free provider surfaces, fetches result pages with hard timeouts, scores evidence, and persists internal `miniapp_evidence_artifact` records. Evidence artifacts are not SOURCE cards and are not public content. They are proof inputs for opportunitycard and candidate promotion.

Runtime behavior:

- Runs only `QUEUED`, `FAILED`, or `NO_RESULTS` tasks.
- Marks each task `RUNNING` before network work starts.
- Uses free provider fallback across DuckDuckGo HTML and Bing RSS/HTML.
- Honors contract `timeoutMs`, `maxResultsPerTask`, and `maxDomainRetries`.
- Writes `FOUND_EVIDENCE`, `NO_RESULTS`, `FAILED`, or `EXHAUSTED` back to the task.
- Stores `authorityScore`, `relevanceScore`, HTTP status, final URL, title, snippet, and page text excerpt on each artifact.

Runtime API:

- `POST /api/visitor/[visitorKey]/research/tasks/run-once` requires admin membership and accepts `companyId`, optional `destinationKey`, optional `taskId`, and `maxTasks`.

## Opportunity Lifecycle

The opportunity lifecycle is implemented in `src/lib/miniapp-opportunity-lifecycle.ts`.

It promotes strong `miniapp_evidence_artifact` records into miniapp opportunitycards stored as metadata on destination candidates. This intentionally does not use the sales opportunitycard table and does not create SOURCE cards.

Promotion behavior:

- Evidence must satisfy the active contract's `minimumEvidenceScore`, `minimumSourceAuthorityScore`, `minimumCandidateScore`, and `minimumContentQualityScore`.
- Solid evidence becomes a destination candidate with `visitorCandidateState: "OPPORTUNITY_CANDIDATE"`.
- Weak evidence is marked `REWORK_REQUIRED` on the evidence artifact, with blocking reasons such as `content_quality_below_contract` preserved for learning and replanning.
- Candidate metadata carries the sovereign contract key, quality gate scores, classification seed, and `sourceCardInventoryIsSuccess: false`.
- New candidates enter the destination workflow as `DISCOVERED`; extraction, scoring, review, publish, and public verification remain separate gates.

Opportunity APIs:

- `GET /api/visitor/[visitorKey]/research/opportunities` requires company membership and lists promoted miniapp opportunitycards.
- `POST /api/visitor/[visitorKey]/research/opportunities/promote` requires admin membership and accepts `companyId`, optional `destinationKey`, and `limit`.

## Promotion Gates

Promotion gates are implemented in `src/lib/miniapp-promotion-gates.ts`.

They validate miniapp opportunity candidates before review preparation or publishing can treat them as usable content candidates.

Gate behavior:

- Enforces contract evidence, source authority, candidate score, and `0..1000` content-quality thresholds.
- Enforces contract forbidden signals.
- Runs the Compare public projection gate for Compare visitor candidates.
- Writes `NEEDS_REVIEW` only when blocking reasons are empty.
- Writes `REWORK_REQUIRED` when a candidate is weak, source-only, fake/static, missing required public projection assets, or otherwise blocked.
- Records review-preparation gaps such as `facts_snapshot_needed` and `draft_payload_needed` without treating them as publish success.

## Publish Quality Gate

The content loop is:

1. Research new website opportunities such as camps, classes, courses, drop-ins, events, and provider profiles.
2. Promote strong evidence to destination candidates.
3. Improve or rework candidates until the `contentQualityScore` reaches the active contract threshold.
4. Prepare review cards only for candidates that meet the threshold.
5. Publish approved review cards only when `contentQualityScore >= minimumContentQualityScore`.

For External Miniapp and the other sovereign miniapps, the default production floor is `500/1000`. The publish bridge re-checks this threshold immediately before sending content to the website and returns `content_quality_below_contract` with status `422` when the score is too low.

Gate API:

- `POST /api/visitor/[visitorKey]/research/gates/evaluate` requires admin membership and accepts `companyId`, optional `destinationKey`, optional `candidateId`, and `limit`.

## Burst Controller

The target-based burst controller is implemented in `src/lib/miniapp-burst-controller.ts`.

It runs the sovereign loop in order:

1. Public verification.
2. Research planning.
3. Free search and evidence runtime.
4. Evidence-to-opportunity promotion.
5. Promotion gates.
6. Public verification again.

The controller continues only while `verified_public_visible_cards` is below the target. Source documents, research tasks, evidence artifacts, opportunitycards, candidates, updates, and attempts never satisfy the target by themselves.

Burst behavior:

- Default target is 100 visible public cards, or the contract coverage total when larger.
- `maxCycles` bounds a single HTTP run so operators and daemons can call it repeatedly without hanging a request.
- When the target is not reached before the cycle bound, the controller returns `max_cycles_reached_before_target` and `recommendedNextDelayMs`.
- State is persisted in `GlobalSetting` under `miniapp_burst_controller:<companyId>:<visitorKey>`.

Burst APIs:

- `POST /api/visitor/[visitorKey]/research/burst/run` requires admin membership and accepts `companyId`, optional `destinationKey`, `targetVisibleCards`, `maxCycles`, and `tasksPerCycle`.
- `GET /api/visitor/[visitorKey]/research/burst/state` requires company membership and returns the last controller state.

## Learning Memory

Miniapp learning memory is implemented in `src/lib/miniapp-learning-memory.ts`.

It converts runtime failures and gate blockers into planner-readable rules stored in `GlobalSetting` under `miniapp_learning_memory:<companyId>:<visitorKey>`.

Learning behavior:

- `NO_RESULTS` and `FAILED` research tasks create `expand_query` rules.
- `EXHAUSTED` research tasks create `retry_later` rules with `domain_retry_budget_exhausted`.
- Promotion gate blockers create `suppress_domain` or `lower_priority` rules.
- The research planner combines existing visitor feedback memory with miniapp learning memory on every planning pass.

Learning APIs:

- `GET /api/visitor/[visitorKey]/research/learning` requires company membership and returns current learning rules.
- `POST /api/visitor/[visitorKey]/research/learning/sync` requires admin membership and syncs latest task/gate failures into memory.

## Proof Harness

The proof harness is `scripts/verify-sovereign-miniapp-intelligence.mjs` and is exposed as:

```bash
npm run verify:sovereign-miniapp-intelligence
```

It verifies:

- sovereign contract invariants
- research planner contract
- free search and evidence runtime contract
- opportunity lifecycle contract
- promotion gate contract
- target-based burst controller contract
- learning-memory contract
- TypeScript compilation

The harness also statically checks that the stack targets verified public cards, supports the 100-card burst target, and keeps `sourceCardInventoryIsSuccess` false.

## Operator Console

The GDS-only operator console is implemented through:

- `src/lib/miniapp-ops-console.ts`
- `src/app/api/miniapps/[miniappKey]/ops/snapshot/route.ts`
- `src/app/api/miniapps/[miniappKey]/ops/actions/route.ts`
- `src/components/visitor-ops-workspace.tsx`

Snapshot API:

- `GET /api/miniapps/[miniappKey]/ops/snapshot?companyId=<companyId>`
- Requires company membership.
- Returns contract status, public visible-card target progress, burst state, research tasks, evidence artifacts, miniapp opportunitycards, promotion gates, learning memory, blocker summaries, available actions, diagnostics, and correlation metadata.

Actions API:

- `POST /api/miniapps/[miniappKey]/ops/actions`
- Requires admin membership.
- Background worker calls may authenticate with the configured bearer secret, so `/api/miniapps` must stay in the session-proxy public-prefix allowlist and the route must enforce Admin or background auth itself.
- Supports `replan`, `run_burst`, `run_evidence`, `promote_opportunities`, `evaluate_gates`, `sync_learning`, `retry_task`, `pause_burst`, `resume_burst`, `suppress_domain`, and `override_suppression`.
- Returns structured `ok`, `code`, `retryable`, `diagnostics`, and `correlationId` fields.

Console behavior:

- Shows `verified_public_visible_cards` as the primary target progress.
- Shows that SOURCE inventory is not success.
- Represents loading, empty, active, blocked, exhausted, complete, failed, retrying, and paused states through GDS primitives.
- Announces errors and completed actions with `aria-live`.
- Requires confirmation for pause/suppressive controls.
- Uses local GDS primitives (`PageShell`, `PageHeader`, `MetricCard`, `Notice`, `EmptyState`, `UnifiedCard`) and existing tokenized Mantine controls only.

## Operational Behavior

When a miniapp starts a destination mission:

1. Resolve the contract by miniapp or destination key.
2. Validate the contract.
3. Store contract key and validation state in mission metadata.
4. Downstream research, opportunity, burst, and operator UI work reads the stored key.

If a contract is invalid:

- API routes return `422`.
- Operator UI must show a GDS error state.
- Autonomous research/publish work must fail closed.

## Verification

Run:

```bash
npm run test:sovereign-miniapp-contract
npm run test:miniapp-health
npm run test:lifecycle-topology
```

Expected result:

- contract module exports the schema and validator
- Compare and External Miniapp contracts exist
- source-card inventory is rejected as a success metric
- contract routes enforce membership
- mission metadata stores contract identity
