# Customer Value Delivery LLD

Canonical quality and structure standard: https://github.com/sovereignsquad/general-design-system/issues/81

Version: `customer-value-delivery@0.17.1`

## Scope

This release binds the top 10 customer-value deliverables into one executable delivery map:

1. #402 CHECK Foundation Refactor
2. #405 Intelligence Unit Control Plane Refactor
3. #406 Sales Opportunitycard MVP Delivery
4. #409 Content Intelligence Workflow Consolidation
5. #410 ClassScout Rulebook and Continuous Ops Consolidation
6. #403 Lifecycle Automation Refactor
7. #319 Destination workspace golden path
8. #448 Customer Operations Dashboard
9. #449 Opportunity Feedback Learning Loop
10. #38 Email Notifications

## Architecture

`src/lib/customer-value-delivery.ts` is the shared contract layer. It exposes:

- `CUSTOMER_VALUE_DELIVERABLES`: issue-numbered delivery map with dependencies and execution order.
- `buildCustomerOperationsSummary(companyId)`: customer-facing operational read model.
- `recordOpportunityOutcomeAndLearning(input)`: sequential outcome write path for opportunitycards.
- `getOpportunityLearningMemory(companyId)`: read model for opportunity learning memory.

The implementation deliberately reuses existing data models:

- `Opportunitycard` and `OpportunitycardFeedback` for user decisions.
- `OutcomeEvent` for audit and observability.
- `MemoryEntry` for reusable scoring/search lessons.
- `PipelineJob`, `IntelligenceSnapshot`, `DestinationMissionRun`, and `CommunicationSettings` for 24/7 operational health.

No schema migration is required.

## Runtime Flow

Customer cockpit:

1. Browser loads `/:companyId/customer-operations`.
2. Page verifies membership through `requireUnitRouteAccess`.
3. Client fetches `GET /api/companies/:companyId/customer-operations`.
4. API verifies membership, builds the summary, and returns stable actions.
5. Operators follow safe action links to sales, settings, unit board, or recovery APIs.

Opportunity learning:

1. Client or integration posts `POST /api/opportunitycards/:id/outcome`.
2. API loads the card, verifies company membership, validates action and decline reason.
3. Idempotency is checked with `Idempotency-Key` or body `idempotencyKey`.
4. Feedback is written.
5. Card state is updated.
6. Outcome audit is written.
7. MemoryEntry is written for scoring/search learning.

## Contracts

Customer operations item:

```ts
type CustomerOperationsItem = {
  id: string;
  source: "opportunity" | "runtime" | "destination" | "content" | "notification" | "learning";
  severity: "info" | "warning" | "critical";
  title: string;
  summary: string;
  metric: number;
  updatedAt: string | null;
  actions: CustomerOperationsAction[];
};
```

Opportunity outcome contract:

```ts
type OpportunityOutcomeInput = {
  cardId: string;
  action: OpportunitycardActionType;
  declineReason?: OpportunitycardDeclineReason | null;
  annotation?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  idempotencyKey?: string | null;
};
```

## APIs

- `GET /api/customer-value/delivery`
- `GET /api/companies/:companyId/customer-operations`
- `POST /api/opportunitycards/:id/outcome`
- `GET /api/opportunitycards/learning-memory?companyId=:companyId`

See `docs/CUSTOMER_VALUE_DELIVERY_API.md`.

## UX States

The customer operations page supports:

- Loading state with a centered loader.
- Error state with a focused empty state.
- Healthy, warning, and critical summary metrics.
- Card-level operational items with severity badges.
- Top opportunity list.
- Opportunity learning memory list.

## Accessibility

- Buttons include clear visible labels.
- Action buttons include `aria-label` values that bind action and item title.
- Icons are decorative unless used inside semantic button labels.
- Status is represented with text and badges, not color alone.
- Layout uses existing app shell and card components from the local design system surface.

## Observability

Every opportunity outcome records:

- Feedback row.
- Card state transition.
- `OutcomeEvent` with before/after state.
- Learning `MemoryEntry`.

Customer operations summary exposes runtime pressure from persisted pipeline jobs, stale projections, destination review pressure, and notification readiness.

## Retries And Timeouts

- Mutating opportunity outcomes support idempotency.
- Operations summary declares `retryTimeoutMs: 30000`.
- Recovery links delegate to existing operations endpoints that guard allowed actions by source and state.

## Rollback And Recovery

- The new APIs do not delete records.
- A duplicate mutation can be avoided with idempotency keys.
- Runtime recovery remains delegated to `POST /api/companies/:companyId/operations/:itemId/:action`.
- Learning entries can be disabled by setting `MemoryEntry.active = false` if a lesson is later judged harmful.

## Testing

Primary contract test:

```bash
npm run test:customer-value-delivery
```

Recommended focused release checks:

```bash
npm run test:opportunitycards
npm run test:miniapp-ops-console
npm run test:miniapp-learning-memory
npm run test:lifecycle-delivery-gates
npm run verify:customer-value
npm run build
```

## Documentation

- LLD: `docs/CUSTOMER_VALUE_DELIVERY_LLD.md`
- API: `docs/CUSTOMER_VALUE_DELIVERY_API.md`
- User guide: `docs/CUSTOMER_VALUE_DELIVERY_USER_GUIDE.md`

## Operational Behavior

The release gives operators one place to answer:

- Are customers seeing current product value?
- Which sales opportunities need review?
- Which runtime or destination items need recovery?
- Is the system learning from lead outcomes?
- Are notifications configured for high-value actions?
