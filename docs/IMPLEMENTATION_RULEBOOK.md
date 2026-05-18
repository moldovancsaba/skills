# CHECKLIST Implementation Rulebook

This document defines how new product functions must be implemented in CHECKLIST.

It exists because the same failure pattern has already repeated:

- the local AI side prepared useful data
- the webapp still read too much live state
- the route then felt slow, fragile, and harder to operate than it should

This rulebook is the corrective contract for future work.

It is subordinate to:

1. [docs/RULEBOOK.md](/Users/Shared/Projects/checklist/docs/RULEBOOK.md)
2. [docs/SSOT.md](/Users/Shared/Projects/checklist/docs/SSOT.md)
3. [docs/SYSTEM_DESIGN_LLD.md](/Users/Shared/Projects/checklist/docs/SYSTEM_DESIGN_LLD.md)

## 1. Purpose

Every new mini-app, module, dashboard, workflow surface, or support surface must be built so that:

- the machine stays operational under memory pressure
- the online webapp reads prepared data quickly
- hot routes do not behave like a second analytics engine
- client hydration stays bounded
- future agents can repeat the pattern without guesswork

## 2. Non-Negotiable Principles

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

Decide which kind of surface it is:

- hot product route
- cold/admin route
- operator/runtime route
- background local-AI-only support surface

This decision changes the allowed architecture.

### Step 2. Define the authority boundary

Write down:

- what the webapp is allowed to read
- what the webapp is allowed to write
- what the local AI system must compute
- what must never be recomputed in the webapp

If this is unclear, implementation is not ready.

### Step 3. Define the read model

For any hot product route, define:

- projection owner
- persisted location
- minimum payload contract
- freshness field
- fallback shape

Examples:

- `IntelligenceSnapshot.webappProjection`
- planning summary sub-projection
- compact chart series inside the product projection

### Step 4. Define invalidation and repair

Every prepared read model must have a refresh path.

Required questions:

- what marks the projection dirty
- who repairs it
- when it is repaired
- how operators can see if it is stale

### Step 5. Build the server bootstrap

If the route is hot:

- create a server loader
- read the prepared projection there
- render the first useful response from that data

Do not make the client discover its own first payload if the server already has enough context.

### Step 6. Keep the client path narrow

The client may:

- refresh secondary panels
- submit interactions
- update local filters
- load below-the-fold extras

The client must not:

- own the first summary truth for a hot route
- fetch multiple summary endpoints on mount unless there is no justified server path

### Step 7. Instrument the route

For hot authenticated routes:

- emit `Server-Timing`
- expose named timing steps under profiling mode
- make it possible to diagnose auth, membership, projection, fallback, and rendering costs separately

### Step 8. Verify the whole path

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
2. The route is classified as hot, cold, operator, or background.
3. A read model exists for hot product data.
4. The first useful response is server-bootstrapped where appropriate.
5. The route payload is minimal and explicit.
6. The client does not own the first summary truth unnecessarily.
7. Non-critical hydration is deferred.
8. Dirtying and repair of prepared data are defined.
9. Profiling exists for meaningful hot authenticated routes.
10. Docs and AI-brain files were updated with the change.

## 7. Blunt Rule

If a future mini-app loads slowly and the explanation is “it’s just reading from the database,” assume the architecture is still wrong until proven otherwise.

In CHECKLIST, fast product routes should usually mean:

- the local AI side already prepared the right shape
- the server rendered the first useful state
- the browser only hydrated what matters first
