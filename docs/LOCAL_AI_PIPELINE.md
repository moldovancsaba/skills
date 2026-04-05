# Checklist Local AI Pipeline

This document records the webapp-side changes made to stabilize the Checklist online to local AI flow.

## Scope

The Checklist webapp has two paths that interact with the local AI system:

1. `src/app/[companyId]/nba/page.tsx`
   Refreshes recommendations and reacts to accept or decline feedback.
2. `src/app/api/webhook/trigger/route.ts`
   Attempts to forward data-change events to the local sync daemon.

## Modifications

### 1. NBA refresh now triggers local AI generation

File:
- `src/app/[companyId]/nba/page.tsx`

Changes:
- The `Refresh` action now calls `/api/agent/local` before reloading pending NBA items.
- The button now shows a generating state while the request is active.
- Accept and decline feedback now trigger a fresh local AI generation pass before reloading the list.
- Loading state is set explicitly around these flows so the UI does not appear idle while work is happening.

Reason:
- Previously the refresh action only re-fetched existing NBA rows.
- Accept and decline feedback updated feedback state but did not actively request new recommendations.

Result:
- User actions on the NBA screen now actively drive local recommendation generation.

### 2. Webhook bridge authorization was corrected

File:
- `src/app/api/webhook/trigger/route.ts`

Changes:
- Fixed `LOCAL_SYNC_SECRET` so it reads from the environment instead of mutating `process.env` at module load.
- Added request authorization logic that accepts:
  - a valid bearer token, or
  - same-origin browser requests from the deployed Checklist app.
- Added bearer auth when forwarding requests to the local sync daemon.

Reason:
- The prior implementation rejected normal browser-initiated requests because the frontend did not send an authorization header.
- The route also failed to authenticate the outbound request to the local sync daemon.

Result:
- Browser data-entry flows can reach the webhook route.
- Forwarded sync requests now include the expected shared secret.

### 3. Webhook failures now degrade explicitly

File:
- `src/app/api/webhook/trigger/route.ts`

Changes:
- If the local sync daemon rejects the forwarded request, the API now returns `502` with response detail.
- If the local sync daemon is unreachable, the API now returns `202` with `queued: true`.

Reason:
- Before this change, unreachable local sync was logged server-side but the web layer exposed a misleading generic success path.

Result:
- The online app now communicates the true state of the bridge:
  - direct local delivery succeeded, or
  - the event must be handled by the local poller later.

## Current operational model

There are two valid execution modes:

1. Direct local trigger
   The webhook route forwards to a reachable `LOCAL_SYNC_URL` and the local daemon processes immediately.
2. Indirect local trigger
   The Checklist app writes to Neon, and the local `ChecklistSync` daemon detects the changes during polling.

Important:
- A Vercel deployment cannot reach `http://127.0.0.1:3001` on the operator machine.
- For true immediate hosted-to-local delivery, `LOCAL_SYNC_URL` must point to a publicly reachable endpoint for the local sync daemon.

## Verified behavior

The following was verified after these changes:

- `npm run lint`
- `npm run build`
- The production webhook route now returns a queued `202` response instead of silently failing when the local machine is not directly reachable from Vercel.
