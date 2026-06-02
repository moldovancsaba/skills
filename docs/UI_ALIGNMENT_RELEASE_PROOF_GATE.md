# UI Alignment Release Proof Gate

## Purpose

This runbook defines the release gate for UI alignment changes across Block Control Center, capability transactions, and runtime observability.

No rollout is allowed until every required scenario has passing evidence and rollback confirmation.

## Required scenarios

Evidence must exist for each scenario id below:

- `checklist-core`
- `sales-only`
- `project-only`
- `miniapp-classscout-only`
- `miniapp-compare-only`
- `miniapp-dual-destination`
- `miniapp-disabled-no-destination`
- `local-classscout-intelligence-flow`
- `local-compare-intelligence-flow`

## Evidence contract per scenario

Every scenario evidence JSON must include:

- `scenarioId: string`
- `blockConfig: string[]`
- `result: "pass" | "fail"`
- `telemetryRefs: string[]` with at least one concrete reference
- `rollbackVerified: true`
- `accessibilityVerified: true`
- `securityVerified: true`
- `performanceVerified: true`

Local intelligence scenarios must also include:

- `localConnected: true`
- `intelligenceFreshnessVerified: true`
- `miniappContentFlowVerified: true`

## Execution steps

1. Initialize scenario templates:

```bash
npm run verify:ui-alignment-proof-gate:init
```

2. Execute scenario matrix and fill each scenario file in `logs/ui-alignment-proof/` with real evidence.

3. Capture telemetry references for each scenario:
   - capability transaction apply events
   - capability transaction preview/conflict/validation counts
   - observability snapshots/screenshots
   - Local runtime health evidence for ClassScout and Compare
   - Miniapp mission/review/publish evidence for ClassScout and Compare

Local Miniapp evidence can be generated with:

```bash
npm run refresh:intelligence-snapshot -- --companyId <companyId>
npm run verify:classscout-golden-path -- --companyId <companyId> --proofGateDir logs/ui-alignment-proof
npm run verify:compare-golden-path -- --companyId <companyId> --proofGateDir logs/ui-alignment-proof
```

If a Unit has real legacy Miniapp evidence that predates destination mission runs, adopt that evidence into explicit mission lineage before rerunning the proof:

```bash
npm run backfill:destination-mission-lineage -- --companyId <companyId> --destinationKey classscout --dry-run
npm run backfill:destination-mission-lineage -- --companyId <companyId> --destinationKey classscout
```

Use `--destinationKey compare` for Compare. The backfill refuses to create duplicate mission lineage and refuses to run when input plus review/publish evidence is missing.

For local Compare bridge validation when no organic Compare destination content exists yet, use the explicit bootstrap command:

```bash
npm run bootstrap:compare-local-proof -- --companyId <companyId>
```

This creates clearly marked local proof evidence for the Compare destination path. It is acceptable for local contract validation only; production readiness still requires organic Compare content produced through the normal discovery/intelligence workflow.

The generated files intentionally keep `rollbackVerified` and `accessibilityVerified` false until those checks are performed.

4. Validate release gate:

```bash
npm run verify:ui-alignment-proof-gate
```

5. Archive generated gate summary artifact from:
   - `logs/ui-alignment-proof/ui-alignment-proof-gate-*.json`

## Rollback drill requirements

For each scenario, rollback evidence must prove:

1. Capability state can be restored to previous version.
2. Route visibility returns to expected pre-change state.
3. Observability reflects rollback activity and no unresolved conflict remains.

## Local intelligence health requirements

ClassScout and Compare are not considered healthy just because the Miniapp Block is enabled.

Before release, each Miniapp must prove:

1. Local AI is running and reachable.
2. The Miniapp has an active destination instance.
3. The Miniapp has current source/intelligence input.
4. A mission run can consume that input.
5. Review or publish workflow evidence exists.
6. Observability exposes failures, retries, and stale-data state.
7. Recovery is documented when Local is down, stale, or blocked.

Legacy Miniapp evidence can satisfy the mission-run requirement only after explicit mission-lineage adoption. The adopted mission run must keep metadata pointing to the original input, review card, outcome memory, workflow run, and candidate where those references exist.

## Go/No-Go checklist

- [ ] All required scenarios exist and passed.
- [ ] Accessibility verification is true for all scenarios.
- [ ] Security/access-control verification is true for all scenarios.
- [ ] Performance verification is true for all scenarios.
- [ ] Rollback verification is true for all scenarios.
- [ ] Local intelligence flow is proven for ClassScout.
- [ ] Local intelligence flow is proven for Compare.
- [ ] Strict proof-gate command passed.

If any box is unchecked, release is blocked.
