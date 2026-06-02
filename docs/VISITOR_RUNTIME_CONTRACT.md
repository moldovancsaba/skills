# Visitor Runtime Contract

## Scope

This document defines the implemented runtime behavior for the Visitor App backend flow:

`blueprint/taxonomy -> source datacards -> candidate pipeline -> review -> publish -> feedback/refinement -> public verification`

Scope is enforced by the miniapp capability chain:

- `check`
- `check.miniapp`
- `check.miniapp.visitors`
- `check.miniapp.visitors.compare`
- `check.miniapp.visitors.classscout`

## API Surface

### Blueprint + Taxonomy

- `POST /api/visitor/blueprints`
- `GET|PUT /api/visitor/:visitorKey/blueprint`
- `GET|PUT /api/visitor/:visitorKey/taxonomy`
- `GET /api/visitor/content-primitives`

### Source Graph

- `GET|POST /api/visitor/:visitorKey/sources`
- `PATCH /api/visitor/:visitorKey/sources/:sourceId`
- `POST /api/visitor/:visitorKey/sources/:sourceId/refresh`
- `GET /api/visitor/:visitorKey/sources/refresh-queue`

### Knowledge Pack

- `GET /api/visitor/:visitorKey/knowledge-pack`
- `GET /api/visitor/:visitorKey/knowledge-pack/context`
- `POST /api/visitor/:visitorKey/knowledge-pack/flashcards`
- `PATCH /api/visitor/:visitorKey/knowledge-pack/flashcards/:flashcardId`

### Candidate Pipeline

- `POST /api/visitor/:visitorKey/discover`
- `GET /api/visitor/:visitorKey/candidates`
- `POST /api/visitor/:visitorKey/candidates/:id/extract`
- `POST /api/visitor/:visitorKey/candidates/:id/classify`
- `POST /api/visitor/:visitorKey/candidates/:id/score`
- `POST /api/visitor/:visitorKey/candidates/:id/prepare-review`

### Review + Publish

- `POST /api/visitor/:visitorKey/review/:cardId/decision`
- `POST /api/visitor/:visitorKey/review/:cardId/publish`

### Feedback + Refinement

- `GET|POST /api/visitor/:visitorKey/feedback`
- `GET|POST /api/visitor/:visitorKey/refinement-runs`

### Ops + Verification

- `GET /api/visitor/:visitorKey/ops/summary`
- `GET /api/visitor/:visitorKey/public-verification`

## Runtime Rules

1. Source datacards do not auto-publish content.
2. `source-only` and non-public taxonomy types are blocked by quality gate.
3. For compare visitor output, public candidate APIs now filter out blocked projection candidates (source-only sources, weak source trust, inherited legacy labels, and fake/static content) by default; internal operators can request full rows with `includeInternal=true` or `includeBlocked=true`.
4. Forbidden mappings in taxonomy are enforced at classification time.
5. Missing required evidence fields force review state.
6. Review prep auto-creates:
   - workflow run (if missing)
   - fact snapshot
   - draft
   - review card
7. Feedback rule application performs immediate candidate re-audit and state transition:
   - `forbid_mapping -> RETIRED/REJECTED`
   - `downrank_source -> REWORK_REQUIRED/FAILED`
   - `require_review -> NEEDS_REVIEW/REVIEW_REQUIRED`
8. Public verification reports blocked reasons and publish counts.
9. Visitor public content must never be rescued with generic fallback copy. If Local cannot produce a real content summary, the candidate is blocked or sent to rework.
10. Visitor public content must carry a real uploaded public image before publish. For Compare, that means an ImgBB HTTPS image URL in the public payload.
11. Public payload scope is a contract. A Compare payload must remain `catalogProject: "compare"`; Local must not introduce alternate miniapp or product names while publishing or repairing content.
12. Backend process language such as source status, CHECK Local maintenance notes, placeholder labels, or review instructions must stay in review/ops metadata and must not appear in public card copy.
13. Fallback text filling is prohibited in content creation for every Miniapp and the Webapp. Local may normalize, translate, or remove unsafe copy, but it must not invent replacement card descriptions, summaries, long descriptions, badges, titles, source labels, or marketing text. Missing public content must block the candidate, move it to rework, or render an explicit non-content UI state.
## State Mapping

Visitor candidate lifecycle is persisted in `destinationCandidate.metadata.visitorCandidateState`.

Workflow state mapping:

- `APPROVED -> APPROVED`
- `NEEDS_REVIEW -> REVIEW_REQUIRED`
- `REJECTED|RETIRED -> REJECTED`
- `PUBLISHED|PUBLIC_VERIFIED -> PUBLISHED`
- `REWORK_REQUIRED -> FAILED`
- all other Visitor states -> `DISCOVERED`

## Operational Notes

- Auth: all endpoints require membership; write endpoints require member/admin depending on route.
- Persistence:
  - blueprints/taxonomy/knowledge/feedback/refinement: `destinationInstance.config.visitor`
  - sources: `destinationSourceDocument` with `sourceType=visitor_datacard`
  - candidates/review artifacts: destination workflow tables
- Retry behavior:
  - discover is idempotent by candidate fingerprint
  - review card submission is idempotent by packet fingerprint
