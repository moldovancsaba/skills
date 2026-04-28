/**
 * SOVEREIGN CORE CONFIGURATION
 * v0.11.4-STABLE
 * 
 * Global settings, timeout thresholds, and the AI Inference Serial Lock.
 * Centralized configuration for the entire Trinity Engine.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const OLLAMA_HOST = process.env.OLLAMA_HOST || process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2:3b";

const GLOBAL_OLLAMA_TIMEOUT_MS = 180_000;
const FAILSAFE_TIMEOUT_MS = 300_000;
const TRINITY_DRAFT_TIMEOUT_MS = 120_000;
const TRINITY_WRITE_TIMEOUT_MS = 150_000;
const TRINITY_JUDGE_TIMEOUT_MS = 120_000;

const USE_SAFE_MODE = /^(1|true|yes|on)$/i.test(process.env.USE_SAFE_MODE || "");
const FALLBACK_MODEL = process.env.FALLBACK_MODEL || "granite4:350m";

const STAGE_MODELS = {
  DRAFT: USE_SAFE_MODE ? [FALLBACK_MODEL] : ["qwen2.5:7b", "granite4:3b"],
  WRITE: USE_SAFE_MODE ? [FALLBACK_MODEL] : ["granite4:3b", "llama3.2:3b"],
  JUDGE: USE_SAFE_MODE ? [FALLBACK_MODEL] : ["MichelRosselli/apertus:latest", "qwen2.5:7b"],
};

if (USE_SAFE_MODE) {
  console.log(`[CORE] 🛡️ SAFE MODE ACTIVE: Falling back to ${FALLBACK_MODEL}`);
}

const FLASHCARD_MIN_CONFIDENCE = 40;
const FLASHCARD_MIN_IMPACT = 40;
const FLASHCARD_MIN_WEIGHT = 40;
const TASK_MIN_ICE_SCORE = 50;

// --- AI SERIAL LOCK (CONCURRENCY = 1) ---

let aiInferenceQueue = [];
let aiSystemBusy = false;

/**
 * Internal processor for the AI Inference Queue.
 * Ensures only one LLM request is active at any time to preserve VRAM/Compute.
 */
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

/**
 * Enqueues an AI task for serial execution.
 * Returns a promise that resolves when the task is eventually processed.
 * 
 * @param {Function} task - Async function containing the AI call
 * @returns {Promise<any>} Result of the task
 */
function queueAiInference(task) {
  return new Promise((resolve, reject) => {
    aiInferenceQueue.push({ resolve, reject, task });
    processAiInferenceQueue();
  });
}

/**
 * Robust environment variable flag evaluator.
 * Recognizes true/yes/on/1 as true.
 * 
 * @param {string|number|boolean} value - Raw value from process.env
 * @param {boolean} fallback - Value to return if input is null/empty
 * @returns {boolean}
 */
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
