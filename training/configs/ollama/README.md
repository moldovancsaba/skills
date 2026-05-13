# Ollama Deployment

Ollama remains the runtime target for checklist local AI.

## Recommended use

- canary a candidate model or adapter first
- validate against checklist evaluation cases
- promote only after non-regression

## Important

- keep the base model consistent with the one used during training
- do not casually swap adapters across incompatible bases
- prefer reviewable exported artifacts over silent runtime changes
