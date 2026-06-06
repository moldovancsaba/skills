# Customer Value Delivery User Guide

Version: `customer-value-delivery@0.17.1`

## Customer Operations

Open:

```text
/:companyId/customer-operations
```

Use this page to see:

- Overall customer operations health.
- High-value sales opportunities.
- Runtime jobs that need recovery.
- Destination review pressure for ClassScout and Compare.
- Customer read-model freshness.
- Opportunity learning memory.
- Notification readiness.

## Recommended Daily Flow

1. Open Customer Operations.
2. Review health and pressure metrics.
3. Open Sales when high-value leads are available.
4. Accept, decline, refresh, pin, or archive opportunitycards.
5. Review runtime or destination pressure and use safe recovery actions.
6. Confirm notifications are configured before relying on alerts.

## Opportunity Learning

Every accepted or declined opportunitycard becomes durable learning memory:

- Accepted cards create `SUCCESS_PATTERN` lessons.
- Declined cards create `ANTI_PATTERN` or `DUPLICATE_HINT` lessons.
- Modified cards create `SOFT_PREFERENCE` lessons.

For integrations, call:

```text
POST /api/opportunitycards/:id/outcome
```

Use `Idempotency-Key` for retries.

## Accessibility Expectations

- Do not rely on badge color only; read the severity text.
- Action buttons include visible text and accessible labels.
- The page works as a scan-first operations cockpit without hidden instructional UI.

## Operational Recovery

Customer Operations does not execute destructive recovery itself. It links to existing guarded recovery endpoints and surfaces whether confirmation is required.

If a learned lesson is wrong, disable the `MemoryEntry` by setting `active` to `false`; keep the original feedback and audit event for traceability.
