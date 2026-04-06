# Checklist Local AI Pipeline

This document describes the current shipped behavior of the Checklist online/local AI pipeline.

## System split

Checklist has two cooperating parts:

1. `online webapp`
   - user-facing
   - runs on Vercel
   - captures raw data and feedback

2. `local AI layer`
   - fetches / enriches source evidence
   - generates flashcards
   - supports NBA generation

The database is the shared persistence layer between them.

## Canonical flow

### 1. Raw data ingestion

Users add data on:
- `/:companyId/data`

The webapp stores raw rows in:
- `Product`
- `Customer`
- `Competitor`

Important:
- raw source records are treated as `DATA`
- processed knowledge belongs in `FLASHCARDS`
- actionable recommendations belong in `TASKS`

### 2. Local enrichment

The local layer can enrich a source using:
- direct URL fetch
- page text extraction
- public signal collection
- local model reasoning

Current enrichment outputs may include:
- conclusions
- evaluations
- judgments
- recommendations
- comparisons
- pricing signals
- forecasts
- news-like signals

### 3. Flashcard generation

Knowmore flashcards are generated from enriched evidence and stored in:
- `Flashcard`
- `FlashcardSource`
- `FlashcardAction`

Current flashcard kinds:
- `SUMMARY`
- `EXPLANATION`
- `COMPARISON`
- `NEWS`
- `CONCLUSION`
- `EVALUATION`
- `OPINION`
- `JUDGMENT`
- `RECOMMENDATION`
- `RESEARCH`
- `FORECAST`
- `STOCK`
- `GOSSIP`
- `PRICE`

Each flashcard carries:
- `publicId`
- `UUID`
- `confidence`
- `impact`
- `weight`
- provenance/source links
- review state

### 4. NBA generation

The NBA generator reads:
- company context
- products/customers/competitors
- active flashcards
- flashcard feedback
- task feedback

It creates `NBAItem` rows and stores `sourceFlashcardIds` so tasks can be traced back to the flashcards that supported them.

## Feedback loops

### Flashcards

Knowmore flashcards support:
- `ACCEPT`
- `DECLINE`
- `MODIFY_ACCEPT`

These actions update:
- review status
- confidence delta
- weight delta
- optional manual title/body overrides

Declined flashcards are hidden from the Knowmore webapp feed.

### NBA tasks

Checklist tasks support:
- `ACCEPT`
- `DECLINE`
- `MODIFY_ACCEPT`

These actions update:
- task status
- optional task title/description edits
- user annotation
- ICE score recalculation

Task feedback is also applied back onto the linked source flashcards.

## ICE scoring

The current task scoring contract is:

```text
Impact: 0-10
Confidence: 0-100, multiplied as confidence/10
Ease: 0-10
ICE = impact * (confidence / 10) * ease
Range: 0-1000
```

## Delivery modes

There are two valid online -> local execution modes:

1. `direct trigger`
   - the online app calls a reachable `LOCAL_SYNC_URL`
   - immediate local processing is possible

2. `indirect catch-up`
   - the online app writes to Neon
   - the local sync daemon catches changes later

If Vercel cannot reach the local machine directly, the second mode is the fallback.

## Current limitations

- public search collection is opportunistic and not fully deterministic
- evidence-only publication is still being tightened for `NEWS`
- provenance/version tagging is not yet attached to every generated artifact version
- direct Vercel-to-local delivery still requires a publicly reachable local sync endpoint

## Operational rule

Whenever code changes the online/local contract, update:
- `README.md`
- `docs/ONBOARDING.md`
- this file
