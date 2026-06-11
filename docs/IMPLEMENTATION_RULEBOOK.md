# check Implementation Rulebook

This document defines how new product functions must be implemented in `check`.

It exists because the same failure pattern has already repeated:

- the local AI side prepared useful data
- the webapp still read too much live state
- the route then felt slow, fragile, and harder to operate than it should

This rulebook is the corrective contract for future work.

It is subordinate to:

1. [docs/RULEBOOK.md](/Users/Shared/Projects/checklist/docs/RULEBOOK.md)
2. [docs/SSOT.md](/Users/Shared/Projects/checklist/docs/SSOT.md)
3. [docs/SYSTEM_DESIGN_LLD.md](/Users/Shared/Projects/checklist/docs/SYSTEM_DESIGN_LLD.md)
4. [docs/CHECK_FOUNDATION_LLD.md](/Users/Shared/Projects/checklist/docs/CHECK_FOUNDATION_LLD.md)
5. [docs/CHECK_FOUNDATION_HANDOVER.md](/Users/Shared/Projects/checklist/docs/CHECK_FOUNDATION_HANDOVER.md)

## 1. Purpose

Every new Block, Module, Miniapp, workspace, board, workflow surface, or support surface must be built so that:

- the machine stays operational under memory pressure
- the online webapp reads prepared data quickly
- hot routes do not behave like a second analytics engine
- client hydration stays bounded
- future agents can repeat the pattern without guesswork

## 2. Non-Negotiable Principles

### 2.0 Mandatory General Design System rule

All UI, UX, and frontend implementation must exclusively use the Sovereign Squad General Design System.

Authoritative source:

- local checkout: `/Users/Shared/Projects/general-design-system`
- upstream repository: `sovereignsquad/general-design-system`

Rules:

- no parallel component libraries
- no local visual systems
- no local token systems
- no non-GDS interaction primitives
- no page-specific typography, spacing, color, radius, elevation, motion, or layout grammar outside the GDS contract
- no raw Mantine default styling as product design unless wrapped, themed, or explicitly approved by the GDS contract
- no UI state may ship without keyboard, screen-reader, focus, contrast, reduced-motion, and semantic HTML coverage where applicable

Every new product function with UI must define its GDS components, UX states, accessibility behavior, and any approved exception before implementation.

### 2.0.0.1 Miniapp public shell rule

Miniapp/public routes must use the GDS public shell family for shell, navigation, footer, and public-flow state behavior.

Current adapter:

- `src/components/gds/public-miniapp-shell.tsx`

Rules:

- use `PublicShell`, `PublicNav`, `PublicBrandFooter`, and `PublicFlowShell` through the adapter unless the route has a documented exception
- mobile navigation mode must come from GDS, not route-local state or page-specific mobile menus
- public/Miniapp nav items must be explicit, typed, and safe for long labels and external links
- Compare is the first migrated proof surface; ClassScout and broader public flows should follow after the adapter is verified

### 2.0.1 Mandatory destination-daemon policy model

Miniapp mission automation must use one shared destination-daemon contract across all Miniapps.

Rules:

- daemon orchestration is destination-generic and must not hardcode one Miniapp as the control path
- per-Unit daemon limits must resolve through `company.workerConfig.destinationDaemonPolicy` with `defaults` and `miniapps` overrides
- runtime precedence must remain deterministic:
1. explicit API override
2. per-miniapp Unit policy
3. shared environment fallback defaults
- Miniapp-specific maintenance behavior must be plugged in through destination maintenance adapters, not by branching daemon ownership logic
- new Miniapps must inherit the same daemon defaults and policy flow used by existing Miniapps unless an explicit rulebook exception is approved

### 2.0.2 Delivery governance and issue quality

Delivery issues must follow:

- issue standard:
  - [general-design-system #81](https://github.com/sovereignsquad/general-design-system/issues/81)
- issue template in `.github/ISSUE_TEMPLATE/feature-delivery.yml`
- board governance contract in [docs/PROJECT_BOARD_GOVERNANCE.md](/Users/Shared/Projects/checklist/docs/PROJECT_BOARD_GOVERNANCE.md)

Every issue must define, at minimum, all of the following:

- architecture
- runtime flow
- contracts
- APIs
- pseudo-code
- UX states
- accessibility
- observability
- retries and timeouts
- rollback/recovery
- testing
- documentation
- dependencies
- execution order (numeric sequencing)
- edge cases
- operational behavior

### 2.1 Local AI prepares, webapp reads

If a product surface needs aggregated, ranked, counted, scored, summarized, or trend-shaped data:

- the local AI side should prepare it ahead of time
- the webapp should read the prepared result

The webapp must not become the place where large business summaries are recomputed on page load.

### 2.2 Hot routes are projection-first

For any route that should feel immediate:

- read a persisted projection first
- render from that projection first
- only use bounded fallback logic when the projection is missing

Forbidden hot-path pattern:

- many per-company live count queries
- broad `Promise.all` fan-out against large tables
- full snapshot-document overfetch when only a small summary is needed

### 2.3 Server-first bootstrap beats post-mount fetches

If the server already knows enough to render the first useful screen:

- render it on the server
- pass the result down as initial props

Do not default to:

- blank shell
- client mount
- fetch three APIs
- then finally show the page

### 2.4 The shell counts too

Do not optimize only the main content and ignore the authenticated shell.

The shell must also avoid unnecessary client waterfalls:

- bootstrap identity from signed server-readable session state where possible
- do not force the sidebar to wait on post-mount identity fetches when the cookie already contains enough

### 2.5 Payload discipline matters

Even when the database is fast, the route can still be slow if the payload is sloppy.

Rules:

- select only the fields the route needs
- do not include full large documents by habit
- do not ship full analytics history if the page only needs a compact chart series
- trim response shape to the route contract, not the database shape

### 2.5.1 Pagination must preserve full-corpus truth

Pagination is allowed and often required on large product surfaces.

But pagination must not weaken search or filtering correctness.

Rules:

- page in the database whenever the corpus is large
- apply search/filter predicates before paging
- keep predictive search scoped to the full eligible corpus, not just the currently visible page
- never implement "pagination" by loading the full corpus and slicing in memory on a hot route

### 2.6 Defer non-critical client work

Prepared data is not enough if the browser still does too much work immediately.

Rules:

- non-critical panels should not block first response
- defer heavy client rendering when the content is below the fold or not needed for first interaction
- charts, membership widgets, and decorative analytics should not outrank primary product comprehension

### 2.7 Freshness repair belongs to the background system

If prepared data becomes stale:

- mark it dirty
- repair it through local AI background ownership
- do not turn the hot route into the repair engine

### 2.8 Profile before guessing

Once the obvious architectural issues are removed, further performance work must be evidence-driven.

Rules:

- add route profiling before speculative trimming
- emit `Server-Timing` on hot authenticated routes
- expose named timing steps when profiling is requested
- prefer measured fixes to intuition-driven churn

## 3. Required Build Sequence For New Functions

Every new product function must go through this sequence.

### Step 1. Classify the function

Decide what is being built:

- Block
- Module
- Card family
- Miniapp
- Miniapp Ops surface
- Webapp workspace
- Local-only runtime feature

Then decide which kind of surface it is:

- hot product route
- cold/admin route
- operator/runtime route
- background local-AI-only support surface

This decision changes the allowed architecture.

### Step 2. Define Block and Unit scope

Write down:

- which Unit owns the data
- which Block enables the behavior
- which Modules are required
- which Card types are read or written
- whether the feature must work without the Checklist Block
- whether a disabled Block hides, freezes, or preserves the data

If this is unclear, implementation is not ready.

### Step 3. Define the authority boundary

Write down:

- what the webapp is allowed to read
- what the webapp is allowed to write
- what the local AI system must compute
- what must never be recomputed in the webapp

If this is unclear, implementation is not ready.

### Step 4. Define the read model

For any hot product route, define:

- projection owner
- persisted location
- minimum payload contract
- freshness field
- fallback shape
- Block key or Miniapp key when applicable

Examples:

- `IntelligenceSnapshot.webappProjection`
- planning summary sub-projection
- compact chart series inside the product projection
- server-bootstrapped paged corpus views where the hot path still needs direct entity rows, such as Knowmore
- Miniapp landing summary contract for ClassScout or Compare

### Step 5. Define invalidation and repair

Every prepared read model must have a refresh path.

Required questions:

- what marks the projection dirty
- who repairs it
- when it is repaired
- how operators can see if it is stale

### Step 6. Build the server bootstrap

If the route is hot:

- create a server loader
- read the prepared projection there
- render the first useful response from that data

Do not make the client discover its own first payload if the server already has enough context.

### Step 7. Keep the client path narrow

The client may:

- refresh secondary panels
- submit interactions
- update local filters
- load below-the-fold extras

The client must not:

- own the first summary truth for a hot route
- fetch multiple summary endpoints on mount unless there is no justified server path

### Step 8. Instrument the route

For hot authenticated routes:

- emit `Server-Timing`
- expose named timing steps under profiling mode
- make it possible to diagnose auth, membership, projection, fallback, and rendering costs separately

### Step 9. Verify the whole path

Before calling the work complete:

- lint
- typecheck
- build
- docs audit
- semantic audit
- verify the route still uses prepared data in the intended path

## 4. Required Patterns

### 4.1 For hot product reads

Required:

- projection-first data source
- server bootstrap
- bounded fallback
- minimal select payloads
- deferred non-critical client work

Forbidden:

- full-document snapshot includes when only a summary is needed
- loading the first view by chaining client fetches after mount
- broad live recomputation in the route handler

### 4.2 For product charts

Required:

- compact chart series prepared ahead of time when the chart is a summary widget
- lazy rendering if many charts appear on one route

Forbidden:

- full analytics-history payloads on hot routes when only mini-trend lines are shown
- eager hydration of dozens of charts at first paint without need

### 4.3 For identity and membership

Required:

- bootstrap basic session identity from signed cookie/session when possible
- keep membership and admin-only data off the first product response unless the route truly needs it

Forbidden:

- treating all identity concerns as critical-path data

### 4.4 For route APIs

Required:

- explicit response contract
- narrow field selection
- projection normalization through shared adapters
- profiling hooks on important authenticated routes

Forbidden:

- “return the whole DB object and let the client pick what it wants”

## 5. Required Documentation Updates

When you add or materially change a future product function, update the governing docs in the same work when the contract changes.

Minimum update targets when relevant:

- [docs/RULEBOOK.md](/Users/Shared/Projects/checklist/docs/RULEBOOK.md)
- [docs/SSOT.md](/Users/Shared/Projects/checklist/docs/SSOT.md)
- [docs/SYSTEM_DESIGN_LLD.md](/Users/Shared/Projects/checklist/docs/SYSTEM_DESIGN_LLD.md)
- this file
- [README.md](/Users/Shared/Projects/checklist/README.md)
- [HANDOVER.md](/Users/Shared/Projects/checklist/HANDOVER.md)
- [AGENT.md](/Users/Shared/Projects/checklist/AGENT.md)

If the work changes agent behavior, also update:

- [agents/README.md](/Users/Shared/Projects/checklist/agents/README.md)
- any repo-local skill contract if present

## 6. Implementation Checklist

Before shipping a new function, confirm all of these:

1. The authority boundary is explicit.
2. The Unit, Block, Module, Card, Miniapp, Webapp, and Local terms are used correctly.
3. The feature does not accidentally require an unrelated Block.
4. The route is classified as hot, cold, operator, or background.
5. A read model exists for hot product data.
6. The first useful response is server-bootstrapped where appropriate.
7. The route payload is minimal and explicit.
8. The client does not own the first summary truth unnecessarily.
9. Non-critical hydration is deferred.
10. Dirtying and repair of prepared data are defined.
11. Profiling exists for meaningful hot authenticated routes.
12. Docs and AI-brain files were updated with the change.

## 7. Blunt Rule

If a future Block, Module, or Miniapp loads slowly and the explanation is “it’s just reading from the database,” assume the architecture is still wrong until proven otherwise.

In `check`, fast product routes should usually mean:

- the local AI side already prepared the right shape
- the server rendered the first useful state
- the browser only hydrated what matters first
