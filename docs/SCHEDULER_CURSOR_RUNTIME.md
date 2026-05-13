# Scheduler Cursor Runtime Contract

Issue:
- `#107`

Status:
- `Delivered`

Current runtime note:
- superseded by the queue-owned scheduler model

Date:
- `2026-04-12`

## What shipped

This document describes the older company-cursor runtime that previously shipped.

It is no longer the active scheduler contract.

Anything below that references `/checklistsync/health`, cursor fields, or
`scheduler-selection` metrics is historical implementation detail, not the
current runtime surface.

The active scheduler contract is:

- queue-owned job selection
- one state-mutating worker process
- no direct watchdog-side business mutation loops
- bounded per-job execution instead of a monolithic company-cycle cursor

## Runtime behavior

### Selection

When the company-cycle lane selects a company:

1. the active company list is rotated from the persisted `nextCompanyId`
2. the first due company in that rotated order is selected
3. the worker immediately persists the next company pointer before the cycle runs

This matters because a watchdog restart now resumes from the next company instead of resetting back to the same tenant.

### Completion

When a company cycle completes:

- `lastCompletedCompanyId` is updated
- `lastCompletedAt` is updated
- `completedCycles` increments once
- `inFlightCompanyId` is cleared

### Idle state

If no company is due:

- the scheduler still persists the rotated order
- `nextDueCompanyId` and `nextDueAt` are written
- health can explain why no company was selected yet

## Health visibility

Historical endpoint note:

`/checklistsync/health` previously exposed:

- `scheduler.nextCompanyId`
- `scheduler.lastSelectedCompanyId`
- `scheduler.lastSelectedAt`
- `scheduler.lastCompletedCompanyId`
- `scheduler.lastCompletedAt`
- `scheduler.inFlightCompanyId`
- `scheduler.inFlightStartedAt`
- `scheduler.completedCycles`
- `scheduler.selectionOrderHead`
- `scheduler.nextDueCompanyId`
- `scheduler.nextDueAt`
- `scheduler.activeCompanyIds`

## Runtime metrics

The worker previously wrote scheduler events to runtime metrics:

- `scheduler-selection`
- `scheduler-cycle-complete`
- `scheduler-cycle-failed`

These events make restart behavior and company-order rotation auditable.

## Operational check

To verify the historical runtime contract:

1. read `GET /checklistsync/health`
2. confirm `scheduler.nextCompanyId` is populated
3. restart the worker
4. read health again
5. confirm the scheduler state survives the restart instead of clearing to `null`

## Relation to the decision record

This implementation is the runtime execution of:

- `docs/SCHEDULER_FAIRNESS_DECISION_RECORD.md`
