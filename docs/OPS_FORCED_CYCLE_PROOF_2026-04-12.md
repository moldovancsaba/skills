# Forced Cycle Proof — 2026-04-12

## Scope

- Triggered `POST http://127.0.0.1:10005/force` for each company (max wait 75s per company).
- Captured before/after counts for active flashcards and pending tasks.

## Results

Run timestamp: `2026-04-12T14:44:42.391Z`

1. `9c5d9ab5-182c-4d6a-9559-1749fb6c7698` (Soccer Performance Lab Inc)
- status: `failed` (request exceeded 75s)
- delta flashcards: `+8`
- delta tasks: `0`

2. `564caf3e-52e2-45f1-aed8-867e8c82a034` (Roland)
- status: `ok`
- delta flashcards: `0`
- delta tasks: `0`

3. `0a9e3565-7cc0-43de-9741-c617654ffb4f` (misisimi)
- status: `failed` (request exceeded 75s)
- delta flashcards: `+5`
- delta tasks: `0`

4. `0f769be4-59b4-4027-b0b8-8159eb734563` (Fortitude AI)
- status: `failed` (request exceeded 75s)
- delta flashcards: `0`
- delta tasks: `0`

## Interpretation

- Even when HTTP calls time out at the client threshold, worker-side processing can still complete and produce cards.
- End-to-end proof should therefore use both request status and database deltas/runtime metrics.
- This drove the follow-up reliability changes in this delivery:
  - long gateway timeout for `/checklistsync/force` and `/checklistsync/sync`
  - operations proof telemetry in Settings (queue depth, model success/failure, last successful full cycle)
  - daily reliability guardrail trigger for low-throughput windows
