# Ollama Deployment

Ollama remains the runtime target for checklist local AI.

## Recommended use

- canary a candidate model or adapter first
- validate against checklist evaluation cases
- promote only after non-regression
- keep canary and promotion actions governed through `npm run training:promote`

## Important

- keep the base model consistent with the one used during training
- do not casually swap adapters across incompatible bases
- prefer reviewable exported artifacts over silent runtime changes
- rollback must restore the previous `model_draft`, `model_write`, and `model_judge` settings from the captured promotion snapshot
