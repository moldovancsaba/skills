# checklist Integration Guide

This document describes the current checklist integration surface for external agents or automation.

Canonical production URL:

- `https://checklist.checklistsquad.com`

API base:

- `https://checklist.checklistsquad.com/api`

## Integration Model

checklist exposes HTTP endpoints for:

- reading company and source context
- reading Knowmore flashcards
- reading and creating NBA items
- submitting review feedback

The database connection string is an internal deployment concern and should not be the default integration path for external tools.

## Read Inputs

### All companies

```http
GET /api/companies
```

### Sources by company

```http
GET /api/sources?companyId=<company-id>
```

### Topics by company

```http
GET /api/topics?companyId=<company-id>
```

### Uploaded files by company

```http
GET /api/data-files?companyId=<company-id>
```

### Flashcards by company

```http
GET /api/knowmore?companyId=<company-id>
```

### Existing NBA items

```http
GET /api/nba?companyId=<company-id>
```

## Scoring Contract

ICE is defined as:

```text
Impact: 0-10
Confidence: 0-100
Ease: 0-10
ICE = impact * (confidence / 10) * ease
Range: 0-1000
```

Example:

- Impact: `8`
- Confidence: `75`
- Ease: `7`
- ICE: `420`

## Write Outputs

### Create NBA recommendation

```http
POST /api/nba
Content-Type: application/json
```

Request body:

```json
{
  "companyId": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Launch summer camp promotion",
  "description": "Create urgency with limited-time offer for existing customer database",
  "impact": 8,
  "confidence": 70,
  "ease": 8
}
```

### Submit task feedback

```http
POST /api/feedback
Content-Type: application/json
```

Accept:

```json
{
  "nbaItemId": "nba-001",
  "action": "ACCEPT"
}
```

Decline:

```json
{
  "nbaItemId": "nba-001",
  "action": "DECLINE",
  "annotation": "Already have email marketing in place"
}
```

Modify and accept:

```json
{
  "nbaItemId": "nba-001",
  "action": "MODIFY_ACCEPT",
  "modifiedTitle": "Launch segmented summer camp promotion",
  "modifiedDescription": "Focus on high-intent parent segments first",
  "annotation": "Adjusted to fit current campaign plan"
}
```

### Submit flashcard review feedback

```http
POST /api/knowmore/actions
Content-Type: application/json
```

Supported actions:

- `ACCEPT`
- `DECLINE`
- `MODIFY_ACCEPT`

### Trigger flashcard refresh

```http
POST /api/knowmore/sync
Content-Type: application/json
```

### Trigger local NBA generation

```http
POST /api/agent/local
Content-Type: application/json
```

## Notes

- `companyId` is the primary routing and filtering key for company-scoped data
- user-facing records may also expose `publicId` for readable references
- if integration docs drift, align this file with `README.md`, `SPEC.md`, and the actual route handlers under `src/app/api`
