# checklist Help System

## Purpose

The help system exists to teach users how to improve output quality from inside the product, not from external docs alone.

It covers three user needs:

1. contextual help at the moment of action
2. durable operator guidance through a manual
3. fast lookup answers through an FAQ

## UX Surfaces

### Expert Tip card

Location:

- company dashboard
- primary card grid
- positioned as the third card in the core workflow set

Purpose:

- show short, high-signal advice from the AI team
- guide users toward better source data and better feedback
- teach timing and postponement wording for checklist declines

Implementation notes:

- content comes from `src/content/help.ts`
- selection is rule-based through dashboard state
- rendering is handled by `src/components/expert-tip-card.tsx`

### Manual

Location:

- `/manual`

Purpose:

- operator-grade product guidance
- explain data quality, Knowmore review, task review, timing language, and troubleshooting

Implementation notes:

- content comes from `src/content/help.ts`
- rendering is handled by `src/components/help-content.tsx`

### FAQ

Location:

- `/faq`

Purpose:

- answer the repeated workflow questions quickly
- reduce confusion about source quality, flashcards, and not-now vs never feedback

Implementation notes:

- content comes from `src/content/help.ts`
- rendering is handled by `src/components/help-content.tsx`

### Inline coaching

Locations:

- task decline flow
- flashcard decline and modify flow
- direct flashcard/source correction controls in Knowmore

Purpose:

- teach the user what kind of feedback improves the next generation cycle
- prevent vague comments from becoming the dominant pattern

## Content Architecture

The help system uses a typed content layer instead of page-level string hardcoding.

Current source:

- `src/content/help.ts`

This file defines:

- manual sections
- FAQ entries
- expert-tip definitions
- dashboard tip selection logic

## Maintenance Rules

- do not hardcode new help copy directly inside route files when it belongs to the shared help system
- add new help content to `src/content/help.ts`
- keep inline coaching short and action-specific
- keep the manual practical and operational, not promotional
- update this document when new help surfaces or content rules are added
