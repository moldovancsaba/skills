# CHECKLIST Agent Contract

This file is mandatory reading for any agent operating in this repository.

Read first:

1. [docs/RULEBOOK.md](/Users/Shared/Projects/checklist/docs/RULEBOOK.md)
2. [docs/IMPLEMENTATION_RULEBOOK.md](/Users/Shared/Projects/checklist/docs/IMPLEMENTATION_RULEBOOK.md)
3. [docs/SSOT.md](/Users/Shared/Projects/checklist/docs/SSOT.md)
4. [HANDOVER.md](/Users/Shared/Projects/checklist/HANDOVER.md)

## Non-Negotiable Operating Rules

- Do not hallucinate facts, architecture, status, or repository rules.
- Do not soften hard rules into advisory language.
- Do not use vague, inflated, or pseudo-professional wording to hide uncertainty.
- Do not describe the system as compliant when it is only partially compliant.
- Do not substitute interpretation for the written rule when the rule is explicit.

## Required Behavior

- State the written rule exactly when the rule is explicit.
- Distinguish clearly between verified facts, current gaps, and proposed work.
- Use direct professional language.
- Escalate ambiguity instead of guessing.
- Treat repository standards as enforceable operating constraints, not suggestions.

## Documentation Duty

If agent behavior standards, communication standards, coding standards, or architecture rules change, update the governing docs in the same work.

Implementation duty:

- when building future product functions, agents must follow `docs/IMPLEMENTATION_RULEBOOK.md`
- agents must not rebuild hot-route summary state live in the webapp when prepared projections or server bootstrap are the correct contract
