# Project Board Governance and Delivery Contracts

Canonical reference: [https://github.com/sovereignsquad/general-design-system/issues/81](https://github.com/sovereignsquad/general-design-system/issues/81)

## Scope

This document governs how `checklist` delivery issues are organized, sequenced, and executed from this repository.
It applies to:

- all open and future issues that touch delivery
- external-miniapp/compare visitor operations
- miniapp, runtime, webapp, and local-ai workstreams that require production sequencing

## Project Board Structure

The canonical board (organization/project v2) uses these status buckets:

- `IDEABANK (SOMEDAY)` — research-only hypotheses.
- `Roadmap (LATER)` — approved ideas waiting for planning.
- `Backlog (SOONER)` — prepared and ready for execution planning.
- `Todo (NEXT)` — currently committed for execution.
- `In Progress (NOW)` — actively being implemented.
- `Review (ALMOST)` — implementation done, waiting for verification/peer review.
- `Done` — completed and verified in delivery scope.
- `Declined (NEVER)` — explicitly rejected and archived.

Project hygiene rules:

- Any issue in `IDEABANK (SOMEDAY)` is **not** active work.
- A ticket with `board-hygiene` / `project-refactor` labels must be used for one-time cleanup work only.
- `Ideabank`, `ideabank`, and unrelated vertical work does not enter this board as active product work.

## Issue Canonical Body (required)

Every delivery issue must define, at minimum, the following sections in its body:

- Objective
- Architecture
- Runtime flow
- Contracts
- APIs
- Pseudo-code
- UX states
- Accessibility
- Observability
- Retries/timeouts
- Rollback/recovery
- Testing
- Documentation
- Dependencies
- Execution order
- Edge cases
- Operational behavior

If a section is not relevant, it must state `N/A` with a short reason.

## Sequencing and Dependencies

### Execution order

- `Execution Order` is the primary sequencing field for each issue.
- The value is a numeric sequence value (for example `1`, `2`, `3`, ...).
- Parent and umbrella issues should have execution values that allow child issues to execute immediately after.

### Dependencies

- Dependency statements must be explicit and actionable:
  - `Depends on: #123`
  - `Blocks: #456`
- Cross-epic dependencies should be linked with clear rationale in one bullet list.
- No issue may be moved to `Todo (NEXT)` unless required blockers are marked `Done`/`Closed`.

### Board/Issue alignment

- The board status controls execution surface visibility.
- Issue labels are supporting metadata, not a replacement for status transitions.
- Parent issues must keep a current child list so execution is independently verifiable.

## Milestones and dependencies

- Milestones represent bounded delivery plans and should include only issues that share a meaningful completion definition.
- If an issue moves out of scope, archive it with a clear status and dependency note.
- Avoid mixing unrelated epics in a single milestone unless required by an explicit parent epic.

## Completion Definition

An issue is complete only when:

- all sections above are present and complete,
- local tests/lint/build are valid for impacted surfaces,
- observability exists for retries/recovery where mutations/queues are touched,
- rollback or replay behavior is documented and validated,
- docs/handover artifacts are updated in the same PR or change.

## Review Checklist

Before closing:

- `Execution Order` exists and is coherent with parent/chaining.
- dependencies are current and machine-trackable.
- status transition to `Done` has a verification signal (checks / tests / acceptance notes).
- board field values reflect actual state.
