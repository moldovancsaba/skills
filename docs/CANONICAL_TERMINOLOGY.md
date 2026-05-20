# Canonical Terminology

Status:
- active contract document
- applies to product language, implementation language, and documentation language

Purpose:
- prevent mixed naming for the same entity or surface
- keep product surfaces, schema names, and planning language aligned

## Core Entity Terms

- `datacard`: the evidence-layer card persisted through `Source`
- `flashcard`: the knowledge-layer card persisted through `Flashcard`
- `goalcard`: the strategy-layer card persisted through `Goalcard`
- `taskcard`: the execution/planning card persisted through `ChecklistTask`

## Surface Terms

- `Knowmore`: the knowledge surface that shows `flashcards`
- `Goals`: the strategy surface that shows `goalcards`
- `Tactical Board`: the kanban planning surface that arranges `taskcards` across columns
- `Checklist`: the execution surface that shows the `CHECKLIST` column subset of `taskcards`

## Required Usage

- say `taskcard` when referring to the card entity represented by `ChecklistTask`
- say `Tactical Board` when referring to the board surface where taskcards are prioritized and moved between columns
- do not say `tactical card` or `tactical cards`
- do not use `checklist item` as the primary product noun when the meaning is the persisted `ChecklistTask` entity

## Mapping Rules

- one `taskcard` can appear on the `Tactical Board`
- the `Checklist` is not a different card type; it is a filtered execution view of `taskcards`
- the `CHECKLIST` kanban column is the active execution lane for `taskcards`

## Implementation Consequence

- new features that classify, filter, route, or generate execution work must model against `taskcards`
- surface-specific labels may vary for clarity, but entity naming in code, docs, and architecture discussions must stay canonical

## Source References

- [prisma/schema.prisma](/Users/Shared/Projects/checklist/prisma/schema.prisma)
- [src/app/api/checklist/route.ts](/Users/Shared/Projects/checklist/src/app/api/checklist/route.ts)
- [src/components/checklist-page.tsx](/Users/Shared/Projects/checklist/src/components/checklist-page.tsx)
- [src/components/tactical-board.tsx](/Users/Shared/Projects/checklist/src/components/tactical-board.tsx)
