# MLX / MLX-LM

MLX / MLX-LM is the active training path for checklist because the system runs on Apple Silicon only.

## Why this is the active path

- MLX is Apple-first
- MLX-LM officially supports generation and fine-tuning on Apple Silicon
- MLX-LM supports low-rank fine-tuning and fused-model export

## Recommended first use in checklist

1. export datasets with `npm run training:export`
2. run LoRA or QLoRA-style fine-tuning with `mlx_lm.lora`
3. evaluate the candidate locally
4. fuse the candidate with `mlx_lm.fuse`
5. canary through Ollama before promotion

The repo can now prepare a runnable bundle automatically:

```bash
npm run training:prepare-mlx -- --export <training-export-dir> --model <base-model>
```

That produces:

- an MLX config file
- an Ollama `Modelfile`
- a run manifest
- a shell command sequence for train, fuse, evaluate, and canary steps

## Canonical command shapes

Fine-tune:

```bash
mlx_lm.lora \
  --model <path_or_hf_model> \
  --train \
  --data <path_to_export_dir> \
  --iters 600
```

Fuse:

```bash
mlx_lm.fuse --model <path_or_hf_model>
```

## Notes

- if the model is quantized, MLX-LM uses QLoRA behavior
- keep the base model stable between training and deployment
- checklist should start with task and flashcard SFT before introducing preference tuning
