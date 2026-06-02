# check Foundation LLD

This document defines the target low-level foundation for `check`.

It is subordinate to:

1. [docs/RULEBOOK.md](/Users/Shared/Projects/checklist/docs/RULEBOOK.md)
2. [docs/SSOT.md](/Users/Shared/Projects/checklist/docs/SSOT.md)
3. [docs/SYSTEM_DESIGN_LLD.md](/Users/Shared/Projects/checklist/docs/SYSTEM_DESIGN_LLD.md)
4. [docs/CANONICAL_TERMINOLOGY.md](/Users/Shared/Projects/checklist/docs/CANONICAL_TERMINOLOGY.md)

## 1. Purpose

`check` is a platform for Units.

Each Unit can enable any combination of Blocks. A Unit does not need the Checklist Block to use Sales, Project, or Miniapp workflows.

The purpose of this design is to make the system rock solid by separating:

- product language from legacy implementation names
- Block enablement from Module implementation
- Webapp reads from Local computation
- public Miniapps from Webapp operator surfaces
- reusable card/board technology from product-specific business logic

## 2. Canonical Product Model

```text
check
  -> Unit
    -> enabled Blocks
      -> required Modules
        -> Cards
    -> optional Miniapps
  -> Webapp
  -> Local
```

Canonical terms:

- `check`: full platform
- `Unit`: company, organization, team, or intelligence operation
- `Block`: optional product capability enabled for a Unit
- `Module`: reusable functional area used by Blocks
- `Card`: atomic managed object
- `Miniapp`: public-facing app powered by a Unit
- `Webapp`: B2B operator UI
- `Local`: local AI service

## 3. Block Contract

A Block is a product capability, not a route bundle.

Every Block must declare:

- `blockKey`
- display name
- purpose
- required Modules
- optional Modules
- owned Card types
- allowed Local job families
- required Webapp routes
- read-model contract
- permission policy
- enablement dependencies
- disabled-state behavior

Target type:

```ts
type BlockDefinition = {
  blockKey: "checklist" | "sales" | "project" | "miniapp";
  name: string;
  requiredModules: ModuleKey[];
  optionalModules: ModuleKey[];
  ownedCardTypes: CardType[];
  localJobFamilies: string[];
  routes: Array<{ path: string; kind: "home" | "workspace" | "board" | "inspector" }>;
  projectionKey?: string;
  permissions: {
    view: string[];
    operate: string[];
    administer: string[];
  };
};
```

Initial Blocks:

- `Checklist Block`
- `Sales Block`
- `Project Block`
- `Miniapp Block`

Rules:

- Blocks are enabled per Unit
- Modules may be shared by multiple Blocks
- disabling a Block must not delete its data
- enabling a Block must not silently enable unrelated business logic
- Webapp must render only enabled Block entry points

## 4. Module Contract

A Module is reusable implementation capability.

Every Module must declare:

- `moduleKey`
- Card types it owns or reads
- write authority
- read authority
- route ownership
- Local dependency
- projection dependency
- whether it can run without the Checklist Block

Target examples:

```ts
type ModuleDefinition = {
  moduleKey:
    | "data"
    | "topics"
    | "goals"
    | "review"
    | "knowmore"
    | "tactical"
    | "analytics"
    | "queue"
    | "search"
    | "observability"
    | "workflows";
  ownedCardTypes: CardType[];
  localRequired: boolean;
  hotRoute: boolean;
  projectionRequired: boolean;
};
```

Rule:

- Modules are not product strategy. They are reusable machinery.

## 5. Card Contract

Every Card type must define:

- stable ID
- public ID where user-facing
- Unit ownership
- Block ownership or Module ownership
- lifecycle states
- score fields if applicable
- lineage fields if generated
- source/evidence references if knowledge-backed
- feedback/outcome behavior

Target Card families:

- `datacard`
- `topiccard`
- `goalcard`
- `reviewcard`
- `flashcard`
- `taskcard`
- `opportunitycard`
- `projectcard`
- `logiccard`

Rules:

- Card UI must use the shared card grammar
- Card persistence must not invent one-off score math
- generated Cards must preserve lineage and evidence where applicable
- Project Block `projectcards` must not inherit intelligence lifecycle rules by default

## 6. Unit Capability Contract

The Unit capability payload should move from Block-first thinking to Block-first thinking.

Current implementation may still store `webappProfile` and `modules`.

Target payload:

```json
{
  "schemaVersion": 3,
  "blocks": {
    "checklist": { "enabled": true },
    "sales": { "enabled": false },
    "project": { "enabled": true },
    "miniapp": {
      "enabled": true,
      "miniapps": {
        "classscout": { "enabled": true },
        "compare": { "enabled": false }
      }
    }
  },
  "modules": {
    "data": true,
    "knowmore": true,
    "queue": true
  }
}
```

Migration rule:

- read path must normalize legacy v2 payloads into the v3 Block model
- write path should persist v3 only after compatibility adapters are present
- Webapp route guards should consume normalized effective capabilities, not raw storage
- Local job creation should consume Block enablement before Module availability

## 7. Webapp Contract

Webapp is the B2B UI for operating `check`.

Webapp may:

- read prepared projections
- render Unit, Block, Module, Card, and Miniapp Ops surfaces
- persist user edits
- persist operator intent
- persist feedback and review outcomes

Webapp must not:

- perform Local-owned scoring
- perform Local-owned enrichment
- mine leads from the internet
- execute heavy Miniapp content creation
- rebuild hot summaries live when projections exist

Rules:

- every hot Block Home must have a read model
- every Block Home must have disabled, empty, partial, degraded, and ready states
- route labels must use canonical terms

## 8. Local Contract

Local is the AI service.

Local owns:

- research
- enrichment
- scoring
- dedupe
- card generation
- queue execution
- Miniapp mission execution
- content refresh
- evidence verification
- learning from signals
- projection refresh

Local must remain:

- queue-owned
- observable
- recoverable
- bounded by retry and timeout policy
- isolated from Webapp request latency

Rules:

- Local jobs must declare which Unit and Block they serve
- retryable failures must not hot-loop
- stale work must be recoverable
- heavy event history belongs in local audit storage

## 9. Miniapp Contract

A Miniapp is a public-facing app powered by a Unit.

Examples:

- `ClassScout`
- `Compare`

Miniapp Ops is the Webapp workspace that operates a Miniapp.

Every Miniapp must define:

- `miniappKey`
- public app authority
- Unit ownership
- Mission types
- Rulebook fields
- candidate/evidence/draft/packet lifecycle
- publish contract
- verify contract
- maintenance contract
- learning contract

Rules:

- Miniapps are not Webapp screens
- Miniapp content creation must run through Local
- Miniapp publish and verification must be explicit
- ClassScout-specific rules must live behind a Miniapp adapter
- Compare must use the same Miniapp foundation without copy-paste ClassScout logic

## 10. Read-Model Foundation

Every enabled Block should have one clear summary contract.

Target projection shape:

```ts
type UnitProjection = {
  unitId: string;
  generatedAt: string;
  blocks: Record<string, BlockProjection>;
  modules: Record<string, ModuleProjection>;
  nav: {
    enabledBlocks: string[];
    enabledModules: string[];
  };
};
```

Rules:

- Webapp reads Block projections first
- Local refreshes projections
- missing content projections block, rework, or show an explicit non-content UI state; they must not use fallback text filling
- stale projections are repaired in background

## 11. Implementation Plan

Phase 1: language foundation

- update docs to use `check`, Unit, Block, Module, Card, Miniapp, Webapp, Local
- keep legacy implementation names listed as migration aliases
- update project-board issue templates and issue wording as work touches them

Phase 2: typed registry foundation

- add Block registry
- add Module registry
- add Miniapp registry
- expose normalized capability resolver returning effective Blocks and Modules
- keep legacy `webappProfile` compatibility on read

Implemented Block and Module registry files:

- `src/lib/check-foundation/registry-data.json`
- `src/lib/check-foundation/registry.ts`
- `src/lib/check-foundation/capabilities-v3.ts`
- `src/lib/check-foundation/card-registry-data.json`
- `src/lib/check-foundation/card-registry.ts`
- `src/lib/check-foundation/miniapp-registry-data.json`
- `src/lib/check-foundation/miniapp-registry.ts`
- `src/lib/check-foundation/permissions-audit.ts`
- `src/lib/check-foundation/unit-packages-data.json`
- `src/lib/check-foundation/unit-packages.ts`

Registry contract test:

```bash
npm run test:check-foundation-registry
```

Card registry contract test:

```bash
npm run test:check-foundation-cards
```

Miniapp registry contract test:

```bash
npm run test:check-foundation-miniapps
```

Unit package contract test:

```bash
npm run test:check-foundation-packages
```

Golden-path verification command:

```bash
npm run verify:classscout-golden-path -- --companyId <companyId> [--strict]
npm run verify:compare-golden-path -- --companyId <companyId> [--strict]
```

Foundation regression harness:

```bash
npm run verify:check-foundation
npm run verify:check-foundation -- --block project
npm run verify:check-foundation -- --miniapp compare --companyId <companyId>
```

Capability resolver contract:

- `resolveEffectiveUnitCapabilities` returns effective enabled Blocks, Modules, Miniapps, source, and warnings
- `normalizeUnitCapabilitiesForStorage` emits a normalized v3 payload for future persistence
- legacy v2 profile/module payloads remain readable through the adapter

Phase 3: route and navigation hardening

- change nav assembly to Block-first, Module-second
- ensure Units can run Sales without Checklist
- ensure Units can run Project without intelligence Modules
- ensure Miniapp Ops is separate from public Miniapps

Current implementation note:

- `src/lib/board-adapters.ts` now resolves `board-items` to Project Block (`unitBoard`) only
- `/{companyId}/unit-board` no longer accepts cross-module board remapping tokens for runtime behavior

Phase 4: Local job attribution

- add `blockKey` and optional `miniappKey` to queue job metadata where missing
- ensure Local schedules jobs from enabled Blocks
- ensure Local does not create Miniapp work when Miniapp Block is disabled

Phase 5: projection hardening

- add Block-level projection sections
- add stale/degraded/ready state per Block
- remove route logic that infers product meaning from module presence alone

Current implementation note:

- `GET /api/companies/{companyId}/blocks/summary` now returns canonical per-Block readiness and health slices
- `GET /api/companies/{companyId}/operations` now returns aggregated operational items for Local jobs, Miniapp review/publish pressure, and stale read-model signals

Phase 6: Miniapp parity

- restore ClassScout content creation and maintenance through the Miniapp foundation
- bring Compare to the same Miniapp workflow pattern
- keep Miniapp adapters isolated

Current implementation note:

- `src/lib/destination-publish-bridge.ts` now supports both `classscout` and `compare` through the same review-publish bridge contract
- `src/lib/check-foundation/miniapp-registry.ts` now ships a working Compare adapter (status + publish flow) using the shared bridge
- canonical Miniapp workflow APIs now exist at:
  - `POST /api/units/{unitId}/miniapps/{miniappId}/missions`
  - `GET /api/units/{unitId}/miniapps/{miniappId}/missions`
  - `GET /api/units/{unitId}/miniapps/{miniappId}/candidates`
  - `POST /api/units/{unitId}/miniapps/{miniappId}/cards/{cardId}/approve`
  - `POST /api/units/{unitId}/miniapps/{miniappId}/cards/{cardId}/publish`
  - `POST /api/units/{unitId}/miniapps/{miniappId}/content/{contentId}/refresh`
- `GET /api/visitor/{visitorKey}/candidates`
  - returns a public-safe projection by default and only includes raw/internal runtime fields when `includeInternal=true` or `mode=internal`
  - for visitorKey `compare`, blocked projection rows are filtered out by default (`source-only`, weak/blocked source, inherited legacy/placeholder signals, static fake content)
- Local destination daemon and queue lane now evaluate both `classscout` and `compare` with the same default execution policy model, establishing the baseline for future miniapps in this family
- queue activation for destination daemon is now derived from active mission definitions/runs generically, reducing hardcoded single-miniapp coupling

Phase 7: cleanup and rename

- rename UI copy first
- add type aliases second
- rename storage/schema fields only after compatibility migrations and backfills exist
- remove old docs language after code no longer depends on it

## 12. Rock-Solid Foundation Checks

Before a Block is considered production-ready:

- Block can be enabled and disabled per Unit
- Block has a clear Home or Workspace
- Block has a projection or explicit reason why it is cold/admin only
- Block works without unrelated Blocks
- Webapp writes only user intent and allowed edits
- Local owns all heavy computation
- failures produce visible states
- retry/recovery behavior is documented
- Cards use shared card grammar
- board usage goes through shared board contracts
- tests cover disabled, empty, degraded, and ready states

Before a Miniapp is considered production-ready:

- Mission can be configured
- Local can run it
- candidates persist evidence
- Packets can be reviewed
- publish is explicit
- verify is explicit
- maintenance refresh works
- corrections feed learning
- public app authority is not hidden inside Webapp

## 13. Non-Goals

This foundation does not require:

- immediate repository rename
- immediate Prisma schema rename from `Company` to `Unit`
- immediate route rename from `companyId` to `unitId`
- replacing all legacy implementation names in one unsafe sweep
- making every Module available to every Block

The first goal is a stable vocabulary and adapter-backed architecture. Physical renames should happen only when the compatibility path is safe.
