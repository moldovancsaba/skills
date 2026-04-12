# Scheduler Fairness Decision Record

Issue:
- `#106`

Status:
- `Accepted`

Date:
- `2026-04-12`

## Why this exists

ChecklistSync is a multi-company local AI worker. A worker can look healthy while still under-delivering if:

- startup always begins from the same company
- restarts reset progress to the same company
- heavy companies consume most of the cycle budget
- fairness is not measured directly

This document turns that risk into a concrete scheduler contract that later implementation issues can deliver.

## Decision summary

Checklist should use a `persistent rotating company cursor` with `per-company serial work`, `bounded slice sizes`, and `starvation telemetry`.

That means:

1. every scheduler pass starts from the next company after the last completed company, not from the first company in the list
2. one company gets one bounded cycle slice at a time
3. after a company finishes its slice, the cursor advances and the next company becomes first in line
4. restarts resume from persisted scheduler state instead of resetting to company index `0`
5. fairness is measured per company, not inferred from global health

## Pattern comparison

### Pattern A: fixed-order serial scan

How it works:
- worker reads companies in a stable order every time
- each pass starts from the first company

Pros:
- simple to reason about
- easy to implement

Cons:
- restart bias strongly favors the same early companies
- heavy companies at the top delay everyone else
- looks healthy even when late companies are starved

Checklist fit:
- `Rejected`

### Pattern B: pure round-robin

How it works:
- worker rotates companies in sequence
- each company gets one turn before the sequence repeats

Pros:
- easy fairness model
- easy starvation reasoning
- naturally limits tenant favoritism

Cons:
- if state is not persisted, restarts still reset bias
- equal turns do not always mean equal delivery when companies have very different backlog shapes

Checklist fit:
- `Partially accepted`
- good base behavior, but not enough on its own

### Pattern C: weighted fair queue

How it works:
- companies receive turns based on weights such as overdue work, stale cards, or backlog size

Pros:
- balances fairness with business urgency
- can accelerate neglected or high-value companies

Cons:
- easier to overfit
- harder to debug
- can silently drift into favoritism if weights are not observable

Checklist fit:
- `Accepted later`
- this should be a follow-on evolution after plain fairness is stable and measurable

### Pattern D: deficit / token-bucket fairness

How it works:
- each company accumulates tokens over time
- expensive work spends tokens
- starved companies keep accumulating capacity until they get scheduled

Pros:
- strong anti-starvation behavior
- handles uneven cost per company better than plain round-robin

Cons:
- more complex than Checklist needs right now
- requires stable cost accounting first

Checklist fit:
- `Future option`
- useful only after runtime cost telemetry is trustworthy

## Chosen policy for Checklist

Checklist should implement `persistent rotating round-robin first`, then layer `small fairness boosts` only after metrics prove the base contract is stable.

The chosen policy is:

1. `Persistent rotating cursor`
   - store the next company pointer in durable scheduler state
   - on startup and restart, resume from the stored pointer

2. `One bounded company slice`
   - each company gets one bounded pass through the configured lanes
   - lane batch sizes stay small so no single company monopolizes runtime

3. `No same-company restart reset`
   - if the worker dies mid-loop, the next start resumes from the next due company, not the first configured company

4. `Cooldown applies after completion`
   - a company becomes due again only after it finishes its slice and its company cooldown expires

5. `Fairness before weighting`
   - backlog size alone must not reorder the base loop yet
   - weighted acceleration is allowed only after fairness telemetry is shipped

## Startup and restart contract

### Startup

On worker boot:

1. load the active company list
2. load persisted scheduler cursor and last-completed company metadata
3. begin from the next company after the last completed one
4. if the saved company no longer exists, advance to the next valid active company

### Restart

On crash or watchdog restart:

1. do not reset the cursor to the first company
2. resume from the next due company
3. preserve partial-cycle telemetry from the interrupted run
4. record a structured `scheduler-restart-resume` event

### Active list changes

If companies are added, removed, or deactivated:

- preserve relative rotation order for still-active companies
- insert new companies after the current cursor window, not always at the front
- remove invalid cursor targets cleanly and advance to the next valid company

## Fairness telemetry contract

Fairness must be proven with per-company signals.

Required metrics:

- `lastCompanyCycleStartedAt`
- `lastCompanyCycleCompletedAt`
- `lastLaneCompletionAt` per lane
- `companiesSeenInWindow`
- `fullCompanyCyclesCompletedPerHour`
- `cardsCreatedPerCompanyPerHour`
- `cardsUpdatedPerCompanyPerHour`
- `maxCompanyGapMinutes`
- `meanCompanyGapMinutes`
- `oldestDueCompanyAgeMinutes`
- `restartResumeCompanyId`

Required health views:

- company last processed timestamp
- company last fully completed timestamp
- company card creation totals by hour
- company starvation warning if no full cycle completes inside threshold

## Starvation thresholds

Checklist is an always-on client delivery engine. A company must not disappear behind a healthy global light.

Initial thresholds:

- `warning`: no full company cycle for `6 hours`
- `critical`: no full company cycle for `12 hours`
- `investigate`: one company receives `3x` more full cycles than another active company over the same 24-hour window without an explicit weighted policy

These are operating thresholds, not permanent product truths. They should be tuned after runtime evidence accumulates.

## Why this is the right first move

This approach is intentionally conservative:

- simple enough to trust
- observable enough to audit
- strong enough to prevent restart bias
- compatible with later weighting, decay, and business-priority policies

Checklist does not need sophisticated queue theory first. It needs a fairness contract that operators can verify every day.

## Implementation follow-through

This decision record feeds:

- `#107` persistent rotating cursor and fair company start order
- `#105` runtime consistency and watchdog restart semantics
- later fairness weighting work once telemetry proves the base loop

## Definition of done for the follow-on implementation

The implementation should be considered complete only when:

- restarts do not reset to the first company
- company order rotates across completed cycles
- health and metrics expose company-level gaps
- starvation thresholds can be detected automatically
- operations can explain why a given company ran when it did
