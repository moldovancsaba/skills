# checklist: absolute system specification
v2.0.0 — deterministic, auditable, multi-tenant intelligence system

## 1. core execution model

### 1.1 orchestration loop
the trinity engine runs as a continuous, autonomous supervisor:
```
loop forever:
  companies = selectCompaniesWeighted() // round-robin + priority boost
  for company in companies:
    if acquireLock(company):
      runCycle(company)
      releaseLock(company)
```

### 1.2 cycle stages (the pipeline)
every cycle follows a linear, non-branching progression:
1. **SCRUBBING**: research harvest and source ingestion.
2. **WRITING**: drafting of flashcards and task items (nba).
3. **JUDGING**: structural audit and factual grounding verification.
4. **MAINTENANCE**: memory distillation, pruning, and hashtag reconciliation.

**requirements**:
- every stage MUST be idempotent.
- every stage MUST define a clear commit point.
- every operation MUST include the `cycleRunId`.

## 2. locking & concurrency control (mutual exclusion)

### 2.1 lock schema
```json
{
  "key": "lock:company:${id}",
  "ownerId": "worker-uuid",
  "cycleRunId": "uuid",
  "acquiredAt": "timestamp",
  "expiresAt": "timestamp",
  "renewalCount": 0
}
```

### 2.2 acquisition
acquisition MUST be a single atomic operation:
- **condition**: `key missing OR expiresAt < now OR ownerId == currentOwner`.
- **concurrency**: retry once on duplicate-key race (50–200ms jitter). fail → skip company.

### 2.3 renewal
renewal MUST be validated:
- **condition**: `ownerId == currentOwner AND cycleRunId == currentCycleRunId AND expiresAt > now`.
- **failure**: if renewal fails, the worker MUST abort the cycle immediately.

### 2.4 release
- **condition**: `ownerId == currentOwner AND cycleRunId == currentCycleRunId`.

### 2.5 authoritative clock
all time-based operations (expiry, retries, windows) MUST use the **database server time**. workers MUST NOT rely on local system time.

## 3. state machine & transition protection

### 3.1 transition table
| from | to | trigger |
|------|----|---------|
| `DRAFT` | `CHECKED` | writer success |
| `CHECKED` | `VERIFIED` | judge success |
| `CHECKED` | `DRAFT` | judge soft reject |
| `CHECKED` | `REVIEW` | judge fatal reject / axiom violation |
| `CHECKED` | `DECLINED` | judge duplication check |
| `VERIFIED` | `ACTIVE` | system activation |
| `ANY` | `REVIEW` | fatal system error |
| `ANY` | `ARCHIVED` | explicit human/system rule |

### 3.2 illegal transition protection
every update MUST verify:
- `currentStatus == expectedPreviousStatus`.
updates with mismatched status are rejected to prevent stale state overwrites.

## 4. stale worker protection (cycle anchoring)
all database writes MUST include the `cycleRunId`.
a write is valid only if:
- `entity.companyId == tenantCtx.companyId`
- `lock.ownerId == workerId`
- `lock.cycleRunId == cycleRunId`
- `entity.status == expectedPreviousStatus`

## 5. transaction boundaries
every stage commit MUST be atomic:
- status update
- retry metadata
- telemetry
**rollback**: if any part fails, the entire transaction MUST rollback.

## 6. idempotency & deduplication

### 6.1 fingerprinting
`fingerprint = sha256(companyId + entityId + stage + promptHash + canonicalInput)`

### 6.2 hard constraints
- `unique(companyId, canonicalContentHash)`
- `unique(companyId, entityId, stage, fingerprint)`
- `unique(companyId, nbaItemId, brainVersion, draftType)`

## 7. source ingestion (ground truth)

### 7.1 canonicalization
`canonicalSourceText(raw)` logic:
- use production-grade html-to-text parser.
- decode html entities.
- collapse whitespace.
- trim edges.

### 7.2 deduplication
- `canonicalContentHash = sha256(canonicalContent)`.
- if `companyId + canonicalContentHash` exists, skip ingestion.

## 8. citation verification (grounding)

### 8.1 claim-level structure
```json
{
  "claim": "string",
  "citations": [
    {
      "sourceId": "uuid",
      "startOffset": number,
      "endOffset": number,
      "quote": "exact substring"
    }
  ]
}
```

### 8.2 validation pass
verification logic: `canonicalText.substring(startOffset, endOffset) === quote`.
- **rules**: every factual claim MUST have ≥1 verified citation.
- **failure**: missing or invalid citation → reject card.
- **versioning**: store `canonicalizerVersion` with every source.

## 9. memory system (the canon)

### 9.1 schema & hierarchy
entries include: `memoryEntryId`, `scope` (CARD|TOPIC|GLOBAL), `sourceSignalId`, `entityId`, `weightFinal`, `status` (ACTIVE|SUPERSEDED|PRUNED|CONFLICT).

### 9.2 temporal decay
- formula: `weight = weightInitial * exp(-lambda * days)`.
- constant: `lambda = ln(2)/30 ≈ 0.0231`.

### 9.3 conflict precedence
- `CARD > TOPIC > GLOBAL`.
- same scope: newest wins.
- unresolved conflict: mark `CONFLICT`, exclude from injection, flag `REVIEW`.

### 9.4 poisoning protection
if a memory entry causes a >20% increase in rejection rate or repeated conflicts, mark as `SUSPECT` and exclude.

## 10. prompt & model provenance

### 10.1 metadata
every entity MUST store: `promptName`, `promptVersion`, `promptHash`, `modelName`, `modelVersion`, `temperature`, `createdByRunId`, `fingerprint`.

### 10.2 statistical rollback
rollback prompt if:
- `rejectionRate_new >= rejectionRate_prev * 1.2`
- AND `n >= 50` AND `prev_n >= 50`.

## 11. retry & failure policy
- **retryable**: timeout, json parse, network.
- **fatal**: logic violation, validation failure.
- **backoff**: `delay = 2^retryCount * 5min + jitter(0–60s)`.
- **poison queue**: `retryCount >= 3` → `REVIEW`.

## 12. tenant isolation (fail-closed)
- **enforcement**: `tenantCtx` required in every service function. missing → throw fatal.
- **safety**: explicit `companyId` filter mandatory; middleware validates presence.
- **audit**: log every fatal violation with `userId`, `companyId`, `operation`, and `queryHash`.

## 13. topic scheduling & fairness
- `maxCardsPerTopicPerCycle = 10`.
- `maxSourcesPerTopicPerCycle = 20`.
- priority boost awarded if topic has a high ICE backlog.

## 14. creativeDraft system
- **status flow**: `DRAFT` → `READY_FOR_REVIEW` → `APPROVED` → `SENT`.
- **regeneration**: never overwrite approved/sent drafts; regeneration creates a new `version`.
- **idempotency**: `unique(companyId, nbaItemId, brainVersion, draftType)`.

## 15. communication bridge security
- **access**: hmac-sha256 signature required.
- **replay protection**: timestamp window ≤ 5 min + nonce uniqueness in 10 min window.
- **limits**: rate limiting by `companyId` and source IP.

## 16. observability & telemetry
- **required fields**: `cycleRunId`, `companyId`, `entityId`, `stage`, `statusBefore`, `statusAfter`, `latencyMs`, `modelName`, `promptHash`, `retryCount`, `errorCode`.
- **storage**: append-only log + periodic flush to durable database storage.

## 17. backpressure & limits
- **shedding**: if system stress is detected, reduce throughput and pause non-critical stages.
- **hard limits**:
    - `maxTokensPerPrompt`: 4,000.
    - `maxTokensPerResponse`: 1,500.
    - `maxCycleDuration`: 5 minutes per company.

## 18. testing requirements
the following tests MUST pass in CI/CD:
- lock race & takeover.
- stale worker write rejection.
- citation offset binary match.
- tenant isolation breach.
- memory conflict precedence.

## 19. architectural integrity (the guardian sci)

the system enforces the tri-layer architecture through a self-healing loop.

### 19.1 the Auditor (scripts/lib/auditor.js)
- **frequency**: runs every 20 minutes via `guardian.js`.
- **logic**: performs a zero-shot classification of all active cards.
- **detection**: flags items that belong in a different intelligence layer (e.g., a strategic goal in the tactical task list).

### 19.2 the Reorganizer (scripts/lib/reorganizer.js)
- **action**: handles the automated migration of flagged items.
- **integrity**: preserves lineage (`generatedFromIds`) and maps scores across different layer schemas.
- **cleanup**: archives the original item after a successful migration to prevent duplicates.

## 20. intelligence conversion & recataloging

the system allows manual recataloging between layers to ensure human-in-the-loop oversight of the tri-layer taxonomy.

### 20.1 the "move" principle (non-duplication)
intelligence units MUST NOT be duplicated during conversion. 
- every conversion is an atomic **MOVE** operation.
- the source record MUST be set to `activityState: ARCHIVED` (or deleted) immediately upon successful creation of the target record.
- this ensures that an insight exists in exactly one layer at any given time, preventing "intelligence ghosts" or pipeline noise.

### 20.2 layer schema mapping
| from | to | primary mapping logic |
|------|----|----------------------|
| Knowledge | Goal | kind: RECOMMENDATION → kind: GOAL. preserves ICE scores. |
| Knowledge | Task | kind: ACTION → status: PENDING, kanban: IDEABANK. |
| Goal | Knowledge | preserves title/body. maps to kind: SUMMARY. |
| Goal | Task | maps to kanban: ROADMAP. preserves ICE scores. |
| Task | Knowledge | preserves title/description. maps to kind: SUMMARY. |
| Task | Goal | maps to kind: GOAL. preserves ICE scores. |

---
*checklist / trinity v2.1.0 — self-correcting tri-layer intelligence specification*
