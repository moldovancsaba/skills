# Dataset Families

checklist exports three dataset families.

## Supervised fine-tuning

Files:

- `sft_tasks.alpaca.jsonl`
- `sft_flashcards.alpaca.jsonl`

Format:

- Alpaca-style `instruction`, `input`, `output`

Use for:

- Unsloth
- LLaMA-Factory SFT
- manual dataset review

## Preference pairs

Files:

- `prefs_tasks.pairs.jsonl`
- `prefs_flashcards.pairs.jsonl`

Format:

- one prompt with `chosen` and `rejected` outputs

Use for:

- Axolotl DPO / ORPO later
- manual pair inspection

## Evaluation cases

Files:

- `eval_cases.jsonl`

Format:

- one prompt plus expected output and metadata

Use for:

- regression checks
- replay suites
- model promotion gates
