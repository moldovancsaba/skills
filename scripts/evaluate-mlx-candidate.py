#!/usr/bin/env python3
import argparse
import json
import re
import sys
from pathlib import Path

from mlx_lm import generate, load


def parse_args():
    parser = argparse.ArgumentParser(
        description="Evaluate a local MLX fused model over checklist eval cases."
    )
    parser.add_argument("--model", required=True, help="Path to local fused MLX model")
    parser.add_argument("--cases", required=True, help="Path to eval_cases.jsonl")
    parser.add_argument("--out", required=True, help="Path to JSON output")
    parser.add_argument("--limit", type=int, default=None, help="Optional case limit")
    parser.add_argument(
        "--max-tokens",
        type=int,
        default=256,
        help="Max generation tokens per case",
    )
    return parser.parse_args()


def compact(value, max_len=1200):
    return re.sub(r"\s+", " ", str(value or "")).strip()[:max_len]


def evaluation_prompt(test_case):
    lines = [
        f"Case kind: {test_case.get('kind', '')}",
        f"Prompt: {test_case.get('prompt', '')}",
        "Return only JSON.",
        "If this is a task-like case, use keys title, description, rationale.",
        "If this is a flashcard-like case, use keys title, body, rationale.",
        "Use the operator signal and company context to produce the strongest grounded refinement.",
        "Do not explain the schema. Do not include markdown fences.",
    ]
    return "\n".join(lines)


def build_chat_prompt(test_case):
    system = (
        "You are a checklist local AI candidate under evaluation. "
        "Return only strict JSON that is useful, business-specific, and evidence-grounded."
    )
    user = evaluation_prompt(test_case)
    return f"System: {system}\nUser: {user}\nAssistant:"


def extract_json_candidate(content):
    if not content:
        return None
    cleaned = str(content).replace("```json", "").replace("```", "").strip()
    match = re.search(r"\{[\s\S]*?\}", cleaned)
    return match.group(0) if match else None


def main():
    args = parse_args()
    model_path = Path(args.model).resolve()
    cases_path = Path(args.cases).resolve()
    out_path = Path(args.out).resolve()

    with cases_path.open("r", encoding="utf8") as handle:
        cases = [json.loads(line) for line in handle if line.strip()]

    if args.limit:
        cases = cases[: args.limit]

    model, tokenizer = load(str(model_path))
    results = []

    for test_case in cases:
        prompt = build_chat_prompt(test_case)
        raw = generate(model, tokenizer, prompt=prompt, verbose=False, max_tokens=args.max_tokens)
        candidate = extract_json_candidate(raw)
        if candidate is None:
            output = {
                "title": "",
                "description": "",
                "body": "",
                "rationale": "",
                "_raw": raw,
                "_parseError": "No JSON object found in model output.",
            }
        else:
            try:
                output = json.loads(candidate)
            except json.JSONDecodeError:
                output = {
                    "title": "",
                    "description": "",
                    "body": "",
                    "rationale": "",
                    "_raw": raw,
                    "_parseError": "Model returned invalid JSON.",
                }

        results.append(
            {
                "caseId": test_case.get("entityId"),
                "kind": test_case.get("kind"),
                "output": output,
            }
        )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf8") as handle:
        json.dump(results, handle, indent=2)
        handle.write("\n")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # pragma: no cover - execution wrapper
        print(error, file=sys.stderr)
        sys.exit(1)
