import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

function parseArgs(argv) {
  const args = {
    exportDir: null,
    out: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--export") {
      args.exportDir = argv[index + 1] ?? null;
      index += 1;
    } else if (token === "--out") {
      args.out = argv[index + 1] ?? null;
      index += 1;
    }
  }

  return args;
}

async function readJsonLines(path) {
  const raw = await readFile(path, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function toPromptCompletion(entry) {
  const instruction = String(entry.instruction || "").trim();
  const input = String(entry.input || "").trim();
  return {
    prompt: input ? `${instruction}\n\n${input}` : instruction,
    completion: String(entry.output || "").trim(),
    metadata: entry.metadata || {},
  };
}

function splitDataset(items) {
  if (items.length < 3) {
    return { train: items, valid: items.slice(0, 1), test: items.slice(0, 1) };
  }

  const trainCutoff = Math.max(1, Math.floor(items.length * 0.8));
  const validCutoff = Math.max(trainCutoff + 1, Math.floor(items.length * 0.9));
  return {
    train: items.slice(0, trainCutoff),
    valid: items.slice(trainCutoff, validCutoff),
    test: items.slice(validCutoff),
  };
}

async function writeJsonl(path, rows) {
  await writeFile(path, rows.map((row) => `${JSON.stringify(row)}\n`).join(""));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.exportDir) {
    throw new Error("Missing required --export <path> argument.");
  }

  const exportDir = resolve(args.exportDir);
  const outputDir = resolve(args.out || join(exportDir, "mlx-sft"));
  await mkdir(outputDir, { recursive: true });

  const [taskRows, flashcardRows] = await Promise.all([
    readJsonLines(join(exportDir, "sft_tasks.alpaca.jsonl")),
    readJsonLines(join(exportDir, "sft_flashcards.alpaca.jsonl")),
  ]);

  const combined = [...taskRows, ...flashcardRows].map(toPromptCompletion);
  const { train, valid, test } = splitDataset(combined);

  await Promise.all([
    writeJsonl(join(outputDir, "train.jsonl"), train),
    writeJsonl(join(outputDir, "valid.jsonl"), valid),
    writeJsonl(join(outputDir, "test.jsonl"), test),
    writeFile(
      join(outputDir, "manifest.json"),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          exportDir,
          counts: {
            combined: combined.length,
            train: train.length,
            valid: valid.length,
            test: test.length,
          },
        },
        null,
        2,
      ),
    ),
  ]);

  console.log(`Prepared MLX SFT dataset at ${outputDir}`);
  console.log(
    JSON.stringify(
      {
        outputDir,
        counts: {
          combined: combined.length,
          train: train.length,
          valid: valid.length,
          test: test.length,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
