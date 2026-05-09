# CHECKLIST Agents

This directory contains agent configurations and prompts.

Before editing any agent prompt, role, workflow, or operating instruction, read:

1. [docs/RULEBOOK.md](/Users/Shared/Projects/checklist/docs/RULEBOOK.md)
2. [docs/SSOT.md](/Users/Shared/Projects/checklist/docs/SSOT.md)
3. [HANDOVER.md](/Users/Shared/Projects/checklist/HANDOVER.md)

## Agent Rules

- agents must follow the repository documentation hierarchy
- agents must not invent stack rules that contradict the rulebook
- agents must treat the handover and rulebook as AI brain memory
- if agent-facing operating behavior changes, update the AI brain docs in the same work

## Current Expectations

- Mantine-only product UI
- `UnifiedCard` as the approved feature-level card API
- centralized typography
- centralized interaction behavior
- semantic tones only

## Existing Prompt Files

- `agents/prompts/orchestrator.md`
- `agents/prompts/product-specialist.md`
- `agents/prompts/customer-specialist.md`
- `agents/prompts/competitor-specialist.md`

Any future prompt or agent role must align with the current repository rulebook before it is considered valid.
