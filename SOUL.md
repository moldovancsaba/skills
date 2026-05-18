# CHECKLIST Soul

This file is a short AI-brain entrypoint for future agents and maintainers.

If you need the full operating rules, read in this order:

1. [docs/RULEBOOK.md](/Users/Shared/Projects/checklist/docs/RULEBOOK.md)
2. [docs/IMPLEMENTATION_RULEBOOK.md](/Users/Shared/Projects/checklist/docs/IMPLEMENTATION_RULEBOOK.md)
3. [docs/SSOT.md](/Users/Shared/Projects/checklist/docs/SSOT.md)
4. [docs/SYSTEM_DESIGN_LLD.md](/Users/Shared/Projects/checklist/docs/SYSTEM_DESIGN_LLD.md)
5. [HANDOVER.md](/Users/Shared/Projects/checklist/HANDOVER.md)

## What Future Work Must Remember

- local AI prepares, webapp reads
- hot product routes are projection-first
- server bootstrap beats post-mount fetch waterfalls
- payloads must be minimal and explicit
- non-critical hydration must be deferred
- stale prepared data is repaired by background ownership, not by turning the route into a repair engine
- when performance remains poor, profile before guessing

## Blunt Rule

If a new function looks simple but still loads slowly, do not assume “the database is slow.”

First ask:

- are we reading prepared data
- are we overfetching
- are we client-fetching what the server already knows
- are we hydrating too much
- are we recomputing in the webapp what local AI should have prepared
