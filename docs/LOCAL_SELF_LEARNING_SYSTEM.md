# checklist Local Self-Learning System

This document defines how checklist should turn operator feedback into better local model behavior over time.

It is subordinate to:

1. [docs/RULEBOOK.md](/Users/Shared/Projects/checklist/docs/RULEBOOK.md)
2. [docs/SSOT.md](/Users/Shared/Projects/checklist/docs/SSOT.md)
3. [docs/SYSTEM_DESIGN_LLD.md](/Users/Shared/Projects/checklist/docs/SYSTEM_DESIGN_LLD.md)

## Goal

checklist should improve day by day by learning from:

- better source evidence
- flashcard review
- flashcard correction controls
- task review
- delivered task outcomes
- lineage and refinement history

The self-learning loop must stay local-first, reviewable, and gated.

## Runtime execution contract

The current local AI runtime is queue-owned.

That means:

- `guardian` is a watchdog and control-plane process only
- `sync` is the only state-mutating worker
- scheduler decisions are executed through claimable pipeline jobs
- sidecar watchdog loops must not directly mutate cards, scores, or tactical placement

Purpose-specific card clocks are also split:

- `lastRescoredAt` for rescore cadence
- `lastTaxonomyAuditedAt` for taxonomy audit cadence
- `lastCorrectionReconciledAt` for flashcard correction resolution

`lastAuditedAt` remains legacy-only and should not be reused for new worker semantics.

## Approved Active Delivery Stack

Primary active path:

- `MLX / MLX-LM` as the Apple Silicon fine-tuning path
- `LoRA` or `QLoRA` through MLX-compatible local fine-tuning
- `Ollama` as the local runtime and deployment target

Parked research only:

- `Unsloth`
- `LLaMA-Factory`
- `Axolotl`

Those tools are not part of the active delivery plan today.

Reason:

- checklist runs on Apple Silicon only
- Unsloth's official requirements page still positions Apple/Silicon/MLX training as in progress
- LLaMA-Factory and Axolotl are not the chosen active rollout path for the current local stack

## Tool Roles

### QLoRA

QLoRA is the default parameter-efficient method for checklist local fine-tuning.

Use it when:

- we want frequent adapter updates from operator feedback
- we need to stay within modest GPU memory limits
- we want to keep a stable base model while updating behavior with adapters

Do not treat QLoRA as a deployment engine. It is the training method.

### MLX / MLX-LM

MLX / MLX-LM is the default Apple Silicon training path.

Use it for:

- local fine-tuning on Apple Silicon
- LoRA and QLoRA-style adapter training from checklist datasets
- local quantized model handling
- model fusion before runtime evaluation

This is the active delivery path because checklist is Apple Silicon only and MLX-LM officially supports generating text and fine-tuning large language models on Apple silicon with low-rank fine-tuning support.

### LLaMA-Factory

LLaMA-Factory is the operator training lab.

Use it for:

- manual experiments on candidate datasets
- visual inspection of training/eval/export settings
- side-by-side comparison of candidate fine-tunes
- human-in-the-loop export review

LLaMA-Factory is not in the active delivery plan. It remains parked research only unless the hardware and rollout strategy change.

### Axolotl

Axolotl is a parked advanced post-training option.

Use it when checklist is ready for:

- preference tuning from chosen vs rejected outputs
- DPO / ORPO / KTO style alignment
- reward modeling
- more reproducible YAML-first training pipelines

Axolotl is not part of the active delivery plan.

### Ollama

Ollama remains the runtime system.

Use it for:

- serving the active local model
- canarying a candidate model
- promoting an approved candidate into the production local runtime

Ollama should not be the place where training logic lives.

## Canonical Learning Signals

The self-learning loop must use existing checklist-native signals before introducing synthetic learning signals.

### Positive signals

- `Feedback.action = DELIVER`
- `Feedback.action = MODIFY_ACCEPT`
- `Feedback.action = ACCEPT`
- accepted flashcards
- pinned flashcards
- successful post-refresh flashcards
- high-confidence grounded answers once that surface captures acceptance outcomes

### Negative or corrective signals

- `Feedback.action = DECLINE`
- `StrategicFeedback.action = DECLINE`
- flashcards marked wrong
- hidden flashcards
- suppressed sources
- stale or conflict-heavy flashcards that repeatedly fail review

### Structural teaching signals

- `modifiedTitle`
- `modifiedDescription`
- `deliveryComment`
- `declineClass`
- `FlashcardCorrection.note`
- lineage fields such as `versionFamilyId`, `duplicateClusterId`, `generatedFromIds`, and `refinedFromId`

## Canonical Dataset Families

The system must export three dataset families.

### 1. Supervised fine-tuning datasets

Use for:

- flashcard generation improvement
- task generation improvement
- task rewrite quality

Canonical sources:

- delivered tasks
- modified-and-accepted tasks
- accepted tasks with clear annotations
- accepted flashcards
- modified-and-accepted flashcards
- corrected flashcards after refresh

Export rule:

- default exports must prefer high-signal rows, not every accepted row
- task SFT rows should prioritize `DELIVER`, `MODIFY_ACCEPT`, and operator-annotated `ACCEPT`
- flashcard SFT rows should prioritize `MODIFY_ACCEPT`, annotated `ACCEPT`, and correction-backed accepted cards

Recommended exported files:

- `sft_tasks.alpaca.jsonl`
- `sft_flashcards.alpaca.jsonl`

### 2. Preference datasets

Use for:

- choosing stronger tasks between alternatives
- preferring trustworthy flashcards over weak or repetitive ones
- later DPO / ORPO work

Canonical sources:

- accepted vs declined tasks
- delivered vs declined tasks
- modified-accepted vs original poor version
- accepted vs declined flashcards
- corrected vs suppressed knowledge variants

Preference pairs should also include rewrite pairs where the chosen example is the operator-approved edited version and the rejected example is the original draft.

Recommended exported files:

- `prefs_tasks.pairs.jsonl`
- `prefs_flashcards.pairs.jsonl`

### 3. Evaluation datasets

Use for:

- regression tests before model promotion
- replay of known difficult company-specific cases
- frozen benchmarks for task ranking, knowledge trust, and grounded answers

Canonical sources:

- internal evaluation-bench cases
- delivered tasks with high-quality evidence context
- accepted flashcards with clear source grounding
- known prior failure cases that must not regress

Evaluation rule:

- `eval_cases.jsonl` must contain both `standard` and `hard` variants
- hard variants should remove direct title/body hints and rely more heavily on operator signal, evidence, and company context
- eval prompts must not leak the expected answer into the model prompt

Recommended exported files:

- `eval_cases.jsonl`

## Automation Loop

The first production self-learning loop should be:

1. collect new feedback and corrections
2. export fresh training datasets
3. check minimum data thresholds
4. train a candidate adapter with MLX-LM on Apple Silicon
5. export the candidate for local runtime use
6. evaluate it against frozen checklist eval cases
7. if the candidate clears the local MLX gate, optionally convert or import it for Ollama canary
8. promote only if it clears the gate

## Minimum Gating Rules

Never auto-promote a new candidate model just because training completed successfully.

Promotion requires:

- evaluation bench improvement or non-regression
- grounded-answer citation retention must not regress
- duplicate suppression must not regress
- task ranking quality must not regress
- flashcard correction burden must not regress materially

## Local Workspace Layout

The local training workspace is:

- `training/README.md`
- `training/datasets/`
- `training/configs/mlx/`
- `training/configs/ollama/`
- `training/research/`

The canonical dataset export command is:

```bash
npm run training:export -- --company <companyId>
```

If `--company` is omitted, exports are generated for all companies with available learning signals.

The canonical Apple Silicon run-preparation command is:

```bash
npm run training:prepare-mlx -- --export <training-export-dir> --model <base-model>
```

The canonical MLX dataset-conversion command is:

```bash
npm run training:prepare-mlx-dataset -- --export <training-export-dir>
```

The canonical local candidate-gate command is:

```bash
npm run training:eval -- --eval <eval_cases.jsonl> --baseline-model <baseline> --candidate-model <candidate>
```

The internal admin-only evaluation page also reads local `training/runs/` manifests and reports, so candidate run state becomes visible in-product once a run bundle has been prepared.

Completed local learning runs can also be published from that internal surface into the normal observability/history ledger. This creates durable platform-visible audit evidence for candidate gate outcomes even though the raw run artifacts remain local files.

## Safety Rules

- training data must be derived from persisted checklist feedback and correction records, not from silent inferred assumptions alone
- production runtime must not silently switch base models during promotion
- the base model used for adapter training must match the base model used for deployment
- canary evaluation must happen before broad rollout
- manual operator feedback remains the strongest teaching signal; synthetic data is allowed only as augmentation

## Phase Order

### Phase 1

- canonical dataset export from current feedback and correction signals
- MLX-LM supervised fine-tuning on Apple Silicon
- candidate export for Ollama
- evaluation gate

### Phase 2

- richer benchmark coverage
- canary and rollback flow

### Phase 3

- preference-tuning exploration only after the Apple Silicon path is stable
- parked-tool re-evaluation only if they become Apple-Silicon-ready and still fit the stack

## Done Means

This system is not “in place” until:

- the dataset export path exists and runs
- the training workspace exists in the repo
- the promotion gate is documented
- the rollout backlog exists as explicit GitHub issues
- the docs and handover describe the self-learning contract clearly
