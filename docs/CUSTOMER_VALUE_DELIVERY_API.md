# Customer Value Delivery API

Version: `customer-value-delivery@0.17.1`

All company-scoped APIs require an authenticated session and company membership.

## GET /api/customer-value/delivery

Returns the issue-numbered delivery map for the top 10 customer-value deliverables.

Response fields:

- `version`
- `generatedAt`
- `canonicalStandard`
- `deliverables[]`

## GET /api/companies/:companyId/customer-operations

Returns a customer-facing operations read model.

Response fields:

- `health`: `healthy`, `warning`, or `critical`
- `summary`: counts for opportunities, failures, review pressure, learning, and notifications
- `items[]`: actionable operational cards
- `topOpportunities[]`: highest scored active sales opportunitycards
- `learningMemory[]`: most relevant opportunity lessons

Retries and recovery:

- Read endpoint is side-effect free.
- Returned `actions[]` identify the method, href, and confirmation requirement.
- Runtime recovery actions delegate to existing guarded operations endpoints.

## POST /api/opportunitycards/:id/outcome

Writes an operator outcome and converts it into learning memory.

Headers:

- `Content-Type: application/json`
- `Idempotency-Key: <stable-key>` optional but recommended

Body:

```json
{
  "action": "ACCEPT",
  "annotation": "Strong fit for the current sales segment",
  "idempotencyKey": "optional-stable-key"
}
```

Decline body:

```json
{
  "action": "DECLINE",
  "declineReason": "BAD_FIT",
  "annotation": "Too far outside the target market"
}
```

Supported actions:

- `ACCEPT`
- `DECLINE`
- `MODIFY`
- `PIN`
- `REQUEST_REFRESH`
- `ARCHIVE`

Decline reasons:

- `NOT_A_COMPANY`
- `IRRELEVANT_MARKET`
- `BAD_FIT`
- `DUPLICATE`
- `LOW_CONFIDENCE`
- `BAD_DATA`

Success response:

```json
{
  "ok": true,
  "idempotent": false,
  "companyId": "company_id",
  "outcomeEventId": "outcome_event_id",
  "learningImpact": {
    "lessonType": "SUCCESS_PATTERN"
  }
}
```

Rollback and recovery:

- No destructive delete is performed.
- Repeated requests with the same idempotency key return the existing outcome.
- Incorrect lessons can be disabled by marking the `MemoryEntry` inactive.

## GET /api/opportunitycards/learning-memory?companyId=:companyId

Returns active opportunity learning memory and recent opportunity outcomes.

Response fields:

- `summary.totalLessons`
- `summary.byLessonType`
- `lessons[]`
- `recentOutcomes[]`
- `contracts`

## CLI

Static delivery verification:

```bash
npm run verify:customer-value
```

Alias:

```bash
npm run test:customer-value-delivery
```
