# Canonical Terminology

Status:
- active contract document
- applies to product language, implementation language, documentation language, and project-board language

Purpose:
- keep human communication simple
- prevent one concept from having several names
- keep product surfaces, schema names, and planning language aligned

## Top-Level Terms

- `check`: the full platform
- `Unit`: one company, organization, team, or intelligence operation inside `check`
- `Webapp`: the B2B UI where users configure and operate Units
- `Local`: the local AI service that performs research, scoring, maintenance, queue execution, learning, and repair

Rules:

- do not use `Checklist` as the name for the full platform
- do not use `main Webapp` as product language; say `Webapp`
- do not describe one default dashboard as the center of the product
- a Unit may enable only the Blocks it needs

## Product Composition Terms

- `Block`: an optional product capability enabled inside a Unit
- `Module`: a reusable functional area used by one or more Blocks
- `Card`: the atomic object managed by Modules and Blocks
- `Miniapp`: a public-facing app powered by a Unit

Current Block examples:

- `Checklist Block`: the original product block that helps a Unit identify and deliver priority taskcards
- `Sales Block`: the product block that finds and manages sales opportunities from company intelligence and internet research
- `Project Block`: the standalone user-managed kanban block
- `Miniapp Block`: the block that creates, maintains, reviews, publishes, and verifies public Miniapps such as ClassScout and Compare

Current Module examples:

- `Data`
- `Topics`
- `Goals`
- `Review`
- `Knowmore`
- `Tactical`
- `Analytics`
- `AI Queue`
- `Search & Answers`
- `Observability`
- `Workflows`

Rules:

- Blocks are optional per Unit
- Modules are reusable and may serve more than one Block
- a Unit can run the `Sales Block` without the `Checklist Block`
- a Unit can run the `Project Block` without intelligence automation
- a Miniapp is not a Webapp screen

## Card Terms

- `datacard`: the evidence-layer card persisted through `Source`
- `topiccard`: the focus/planning card persisted through `Topic`
- `goalcard`: the strategy-layer card persisted through `Goalcard`
- `reviewcard`: a human-review card for approval, rejection, correction, or publish decisions
- `flashcard`: the knowledge-layer card persisted through `Flashcard`
- `taskcard`: the execution/planning card persisted through `ChecklistTask`
- `opportunitycard`: the sales opportunity card
- `projectcard`: the standalone Project Block card
- `logiccard`: a queue, workflow, or pipeline-ordering card when exposed as business logic
- `miniappcard`: publish-ready public Miniapp content such as visitor classes, camps, programs, venues, drop-in activities, and events

Required usage:

- say `taskcard` when referring to the card entity represented by `ChecklistTask`
- say `projectcard` only for standalone Project Block cards
- say `opportunitycard` only for Sales Block opportunity records
- say `miniappcard` for public Miniapp content cards and their review/publish lifecycle
- do not use `checklist item` as the primary product noun when the meaning is the persisted `ChecklistTask` entity

## Surface Terms

- `Home`: first screen of a Unit or Block
- `Workspace`: a working screen where users perform operations
- `Board`: a kanban-style workspace
- `Panel`: a focused part of a screen
- `Inspector`: detail view for one Card or object

Current surface mappings:

- `Knowmore`: Module surface that shows `flashcards`
- `Goals`: Module surface that shows `goalcards`
- `Tactical Board`: board surface that arranges `taskcards`
- `Checklist`: execution surface inside the Checklist Block that shows the active priority `taskcards`
- `Project Board`: standalone Project Block board for user-managed `projectcards`
- `AI Queue`: queue steering Module for Local work

Rules:

- `Tactical Board` is a surface, not a card type
- `Checklist` is a Block/surface name, not the full platform name
- `Project Board` is not an intelligence workflow by default

## Local Runtime Terms

- `Worker`: the Local process that performs jobs
- `Queue`: the ordered work list for Local
- `Job`: one queued unit of work
- `Run`: one execution of a workflow, mission, or job family
- `Step`: a smaller action inside a Run
- `Attempt`: a retry or execution try for a Step
- `Projection`: prepared fast-read data for Webapp
- `Snapshot`: saved state at a point in time

Rules:

- Webapp reads prepared data and writes user intent
- Local owns heavy research, scoring, enrichment, maintenance, and repair
- hot Webapp routes must not become Local-style computation paths

## Knowledge And Evidence Terms

- `Source`: raw input from a user, upload, connector, web result, or integration
- `Evidence`: usable proof extracted from a Source
- `Insight`: learned point created from Evidence
- `Draft`: AI-created content before approval
- `Review`: human checking area or state
- `Outcome`: what happened after accept, decline, publish, verify, deliver, or repair
- `Signal`: user action or system event that teaches Local
- `Memory`: stored learning from Signals
- `Policy`: rules controlling Local behavior

## Miniapp Terms

- `Miniapp`: public-facing app powered by a Unit
- `Miniapp Ops`: Webapp workspace used to operate a Miniapp
- `Mission`: configured goal for Local to create or maintain Miniapp content
- `Rulebook`: rules a Mission must follow
- `miniappcard`: reviewable/publishable public content card with draft content, evidence, and suggested action
- `Publish`: sending approved content to the Miniapp
- `Verify`: checking that published content is live and correct

Examples:

- `ClassScout` is a Miniapp
- `Compare` is a Miniapp
- the ClassScout workspace inside Webapp is Miniapp Ops, not the Miniapp itself

## Implementation Mapping

Current implementation names may lag behind product language.

Allowed implementation aliases while migration is in progress:

- `Company` may represent a `Unit`
- `companyId` may remain the route and schema key for a Unit
- `webappProfile` may remain the stored capability/profile key until renamed
- `DestinationInstance` may remain the storage model for a Miniapp integration until renamed
- `DestinationMission*` may remain the storage model for Miniapp Missions until renamed
- `unit-board` may remain the route/module key for Project Board implementation
- `DestinationReviewPacket`, `packetState`, and `packetFingerprint` may remain storage/schema names only; product language, docs, routes, and UI must say review card, card state, and card fingerprint

Migration rule:

- new product-facing copy and documentation must use the canonical terms
- code changes may keep legacy names only when renaming would create unsafe churn
- when touching legacy names for functional work, prefer adding adapters and typed aliases before broad schema renames

## Source References

- [prisma/schema.prisma](/Users/Shared/Projects/checklist/prisma/schema.prisma)
- [src/lib/intelligence-unit-capabilities.ts](/Users/Shared/Projects/checklist/src/lib/intelligence-unit-capabilities.ts)
- [src/app/api/checklist/route.ts](/Users/Shared/Projects/checklist/src/app/api/checklist/route.ts)
- [src/components/checklist-page.tsx](/Users/Shared/Projects/checklist/src/components/checklist-page.tsx)
- [src/components/tactical-board.tsx](/Users/Shared/Projects/checklist/src/components/tactical-board.tsx)
