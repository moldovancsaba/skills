# check Local AI Runtime SOP

This document defines the shipped operator-facing runtime sequence and rules for the local AI system.

It is subordinate to:

1. [docs/SSOT.md](/Users/chappie/.codex/worktrees/9d01/checklist/docs/SSOT.md)
2. [docs/SYSTEM_DESIGN_LLD.md](/Users/chappie/.codex/worktrees/9d01/checklist/docs/SYSTEM_DESIGN_LLD.md)
3. [docs/LOCAL_AI_PIPELINE.md](/Users/chappie/.codex/worktrees/9d01/checklist/docs/LOCAL_AI_PIPELINE.md)
4. [docs/LOCAL_AI_RUNTIME_HARDENING_LLD.md](/Users/chappie/.codex/worktrees/9d01/checklist/docs/LOCAL_AI_RUNTIME_HARDENING_LLD.md)

## 1. Runtime split

The local AI runtime is split into 4 long-running processes:

1. `guardian`
   - watchdog
   - memory governor
   - restart owner
2. `sync`
   - foreground queue worker
   - the only planner mutation lane
3. `snapshot-worker`
   - background read-model refresher
   - never claims planner queue jobs
4. `status-server`
   - observability and control surface
   - no business-state mutation

## 2. Foreground loop

The foreground loop is the main mutation loop.

Sequence:

1. start worker cycle
2. recover orphaned `RUNNING` jobs once after worker restart
3. read free memory and derive resource band
4. if free memory is below the hard foreground floor:
   - set state to `PAUSED_LOW_MEMORY`
   - wait in idle windows
   - retry later
5. if startup integrity scrub cooldown is due:
   - run startup integrity scrub
6. process pending system commands
7. set state to `PIPELINE_QUEUE`
8. recover stale `RUNNING` jobs with no progress timeout
9. claim exactly one runnable queue job
10. if no runnable job exists:
   - set state to `IDLE`
   - request a background queue-sync wakeup from `snapshot-worker`
   - rest for the idle interval
   - start the next cycle
11. if a job is claimed:
   - set `currentCompany`
   - set `activeTask`
   - start heartbeat
12. resolve execution profile for the job from:
   - job type
   - current memory band
   - attempt count
13. if no safe profile exists:
   - defer the job with cooldown
   - try another runnable job in the same cycle if possible
14. if a degraded or minimal profile exists:
   - run the job with that smaller profile
15. on success:
   - mark job complete
   - clear cooldown
   - record usage
16. on failure:
   - classify error
   - retry with cooldown or dead-letter into `FAILED + PARKED`
17. stop heartbeat
18. if work happened:
   - rest for the active interval
19. if no work happened:
   - rest for the idle interval
20. start the next cycle

## 3. Background loop

The background loop refreshes read models only when the machine and queue allow it.

Sequence:

1. start snapshot cycle
2. read free memory and derive resource band
3. if background memory policy does not allow snapshot work:
   - set state to `PAUSED_LOW_MEMORY`
   - wait
   - retry later
4. check foreground backlog
5. if any foreground jobs are `RUNNING` or `ACTIVE`:
   - set state to `PAUSED_FOREGROUND_BACKLOG`
   - wait
   - retry later
6. if background work is allowed:
   - refresh queue sync if due
   - refresh a bounded intelligence snapshot slice
   - run scheduled runtime verification if due
7. write snapshot progress
8. rest for the background active interval
9. repeat

Runtime verification contract:

1. scheduled runtime verification runs from `snapshot-worker`, not the foreground mutation lane
2. it checks:
   - worker health reachability
   - snapshot health reachability
   - status payload reachability
   - build identity agreement
   - worker/status truth agreement
   - stale running jobs
   - decomposition consistency
3. the latest report is persisted into global settings and exposed on `/local-ai`

## 4. Queue sync rules

The worker does not fully scan all companies every foreground cycle.

Rules:

1. foreground claim path only tries to claim runnable work directly
2. if no runnable job exists, foreground does not mutate queue topology
3. background snapshot work owns queue sync cadence
4. background worker may be force-woken by foreground claim miss
5. a full company queue sync runs only on a slower interval in the background lane
6. productive company work now immediately refreshes queue topology for the touched company only
7. if that direct touched-company refresh fails, the company is marked topology-dirty for background retry
8. `snapshot-worker` drains touched-company topology refreshes before the slower broad sync path
9. queue sync is what guarantees that:
   - new companies enter the queue
   - deleted companies lose queue work
   - changed companies get new or updated jobs

Coverage contract:

1. foreground stays claim-and-execute only
2. background queue sync guarantees eventual full company coverage

## 5. Company lifecycle rules

1. if a company has too few datacards, it stays inactive
2. if a company has datacards but too few flashcards:
   - bootstrap flashcard generation runs
   - research backfill may run for sparse companies
3. if a company has flashcards but task lane deficits:
   - task generation runs
4. if a company is healthy:
   - maintenance refresh
   - opportunity mining
   - feedback-pressure regeneration
5. if a company is deleted:
   - queue sync removes its planner jobs by cascade through the DB contract

## 6. Card creation and improvement rules

Flashcards:

1. candidate datacards are selected
2. novelty suppression prevents duplicates
3. research policy decides whether remote research is required
4. generation runs
5. editorial gate can downgrade weak copy
6. judging/rescoring runs
7. weakest-upstream lifecycle ceiling is enforced

Taskcards:

1. candidate flashcards are selected
2. task opportunity mining checks whether more actions are justified
3. novelty suppression prevents duplicates
4. generation runs
5. evaluation/rescoring runs
6. frontier recompute places tasks into planning lanes
7. weakest-upstream lifecycle ceiling is enforced

Maintenance improvement:

1. oldest eligible cards are refreshed first
2. linked sources are revisited
3. research policy may trigger fresh remote research
4. editorial cleanup and scoring updates run
5. refresh results are written back

## 7. Failure recovery rules

1. `RUNNING` jobs with no progress for 10 minutes are auto-failed
2. retryable jobs cool down with `scheduledAt`
3. terminal jobs become `FAILED + PARKED`
4. retry limits are bounded by job type
5. worker restart recovers orphaned `RUNNING` jobs back to `ACTIVE`
6. guardian kills stuck workers and restarts them
7. runtime verification failures persist operator-visible evidence, but do not mutate queue state directly

## 8. Memory and downgrade rules

The runtime protects stability first, but it no longer only defers heavy jobs.

Rules:

1. every job is assigned a runtime weight class:
   - `LIGHT`
   - `MEDIUM`
   - `HEAVY`
   - `BURST`
2. heavy and burst jobs may run in one of 3 profiles:
   - `full`
   - `degraded`
   - `minimal`
3. constrained memory causes heavy jobs to shrink before they are deferred
4. repeated low-memory attempts may convert a parent job into a bounded child slice with a persisted minimal profile
5. repeated low-memory attempts may also fan one oversized parent job into multiple bounded child slices with persisted selection offsets
6. minimal profiles reduce blast radius by:
   - lowering batch size
   - refreshing fewer cards
   - disabling research backfill when necessary
7. only when no safe profile exists does the job defer with cooldown

This prevents an always-too-heavy job from living forever in defer/retry limbo, even if the worker restarts between attempts.

## 9. Operator meaning of queue columns

Queue columns are internal urgency buckets:

1. `NOW`
   - urgent
   - should run before lower buckets
2. `SOON`
   - important but not first
3. `LATER`
   - lower urgency
4. `PARKED`
   - do not auto-run right now

These are not the planning lanes shown to users.

## 10. Rest timing

Foreground rest timing:

1. if at least one queue job ran:
   - rest 30 seconds
2. if zero queue jobs ran:
   - rest 5 minutes
3. if paused for low memory:
   - stay in 5-minute retry windows

## 11. Official operator reading

The simplest truthful operator summary is:

1. check memory
2. recover stale work
3. process commands
4. claim one job
5. shrink the job if memory is tight
6. execute the job
7. persist results
8. rest
9. repeat
10. refresh read-only snapshots separately in the background
11. persist scheduled runtime verification so the operator surface can prove the runtime still agrees with itself
