# CHECKLIST Agents

This directory contains agent configurations and prompts.

Before editing any agent prompt, role, workflow, or operating instruction, read:

1. [docs/RULEBOOK.md](/Users/Shared/Projects/checklist/docs/RULEBOOK.md)
2. [docs/IMPLEMENTATION_RULEBOOK.md](/Users/Shared/Projects/checklist/docs/IMPLEMENTATION_RULEBOOK.md)
3. [docs/SSOT.md](/Users/Shared/Projects/checklist/docs/SSOT.md)
4. [HANDOVER.md](/Users/Shared/Projects/checklist/HANDOVER.md)

## Agent Rules

- agents must follow the repository documentation hierarchy
- agents must not invent stack rules that contradict the rulebook
- agents must treat the handover and rulebook as AI brain memory
- agents must treat the implementation rulebook as the default build pattern for future mini-app functions
- if agent-facing operating behavior changes, update the AI brain docs in the same work
- agents must not hallucinate facts, status, architecture, or standards
- agents must not soften explicit rules into advisory wording
- agents must use direct professional language and say when the implementation is not yet compliant

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
