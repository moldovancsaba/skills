# checklist Training Workspace

This directory holds the local self-learning scaffolding for checklist.

## Purpose

The training workspace is where checklist turns operator feedback and correction history into:

- supervised fine-tuning datasets
- preference datasets
- evaluation datasets
- tool-specific starter configs for local model improvement

## Canonical flow

1. export high-signal datasets from the live database
2. train a candidate model or adapter
3. evaluate the candidate against frozen checklist cases
4. deploy or canary the candidate through Ollama only after it passes

## Start here

Export the current training datasets:

```bash
npm run training:export -- --company <companyId>
```

The exporter now prefers stronger operator-teaching rows and writes both `standard` and `hard` eval cases.

Prepare a concrete Apple Silicon MLX run bundle:

```bash
npm run training:prepare-mlx -- --export <training-export-dir> --model <base-model>
```

Or just prepare the MLX-native `train/valid/test` dataset split:

```bash
npm run training:prepare-mlx-dataset -- --export <training-export-dir>
```

Evaluate a baseline model against a candidate:

```bash
npm run training:eval -- --eval <eval_cases.jsonl> --baseline-model <baseline> --candidate-model <candidate>
```

Or evaluate a local fused MLX candidate directly before any Ollama promotion step:

```bash
npm run training:eval -- --eval <eval_cases.jsonl> --baseline-model <baseline> --candidate-path <fused-model-dir>
```

Then review:

- `training/datasets/README.md`
- `training/configs/mlx/README.md`
- `training/configs/ollama/README.md`
- `training/research/README.md`

## Ground rules

- checklist feedback is the primary teaching signal
- delivered work is a stronger signal than accepted work
- modified-and-accepted work is better than plain acceptance for teaching rewrites
- hard eval cases should not include the expected answer in the prompt
- Apple Silicon training is the active path
- preference tuning is phase two, not phase one
- runtime promotion must stay gated and reviewable
