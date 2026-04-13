const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const OLLAMA_HOST = process.env.OLLAMA_HOST || process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2:3b";

const GLOBAL_OLLAMA_TIMEOUT_MS = 150_000;
const FAILSAFE_TIMEOUT_MS = 300_000;
const TRINITY_DRAFT_TIMEOUT_MS = 150_000;
const TRINITY_WRITE_TIMEOUT_MS = 150_000;
const TRINITY_JUDGE_TIMEOUT_MS = 150_000;

const STAGE_MODELS = {
  DRAFT: ["llama3.2:3b"],
  WRITE: ["llama3.2:3b"],
  JUDGE: ["llama3.2:3b"],
};

const FLASHCARD_MIN_CONFIDENCE = 40;
const FLASHCARD_MIN_IMPACT = 40;
const FLASHCARD_MIN_WEIGHT = 40;
const TASK_MIN_ICE_SCORE = 50;

// The Sovereign Serial Lock (Concurrency = 1)
let aiInferenceQueue = [];
let aiSystemBusy = false;

async function processAiInferenceQueue() {
  if (aiSystemBusy || aiInferenceQueue.length === 0) return;
  aiSystemBusy = true;
  const { resolve, reject, task } = aiInferenceQueue.shift();
  try {
    const result = await task();
    resolve(result);
  } catch (err) {
    reject(err);
  } finally {
    aiSystemBusy = false;
    processAiInferenceQueue();
  }
}

function queueAiInference(task) {
  return new Promise((resolve, reject) => {
    aiInferenceQueue.push({ resolve, reject, task });
    processAiInferenceQueue();
  });
}

function envFlag(value, fallback = false) {
  if (value == null || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

module.exports = {
  OLLAMA_HOST,
  OLLAMA_MODEL,
  GLOBAL_OLLAMA_TIMEOUT_MS,
  FAILSAFE_TIMEOUT_MS,
  TRINITY_DRAFT_TIMEOUT_MS,
  TRINITY_WRITE_TIMEOUT_MS,
  TRINITY_JUDGE_TIMEOUT_MS,
  STAGE_MODELS,
  FLASHCARD_MIN_CONFIDENCE,
  FLASHCARD_MIN_IMPACT,
  FLASHCARD_MIN_WEIGHT,
  TASK_MIN_ICE_SCORE,
  queueAiInference,
  envFlag
};
