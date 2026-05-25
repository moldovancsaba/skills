/**
 * checklist CORE CONFIGURATION
 *
 * Centralized runtime configuration for the local AI engine, including model
 * selection, timeout thresholds, and the serial inference queue.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const OLLAMA_HOST = process.env.OLLAMA_HOST || process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2:3b";

const GLOBAL_OLLAMA_TIMEOUT_MS = 180_000;
const FAILSAFE_TIMEOUT_MS = 300_000;
const DRAFT_STAGE_TIMEOUT_MS = 120_000;
const WRITE_STAGE_TIMEOUT_MS = 120_000;
const JUDGE_STAGE_TIMEOUT_MS = 120_000;

const USE_SAFE_MODE = /^(1|true|yes|on)$/i.test(process.env.USE_SAFE_MODE || "");
const FALLBACK_MODEL = process.env.FALLBACK_MODEL || "granite4:350m";

const STAGE_MODELS = {
  DRAFT: ["qwen2.5:7b", "mistral:latest", "gemma2:2b", "gemma3:1b"],
  WRITE: ["qwen2.5:7b", "mistral:latest", "gemma2:2b", "gemma3:1b"],
  JUDGE: ["qwen2.5:7b", "mistral:latest", "gemma2:2b", "gemma3:1b"],
};

/**
 * M3.1: Hot-Swappable Model Resolver (Phase 1)
 * Returns the prioritized model list for a given pipeline stage.
 * Prioritizes: ModelConfig table > getWorkerConfig (Legacy) > STAGE_MODELS (Static)
 */
let modelCache = {
  data: {},
  lastFetched: 0,
  TTL: 300_000 // 5 minutes
};

async function getStageModels(prisma, stage, company = null) {
  if (USE_SAFE_MODE) return [FALLBACK_MODEL];
  
  const now = Date.now();
  if (now - modelCache.lastFetched > modelCache.TTL && prisma) {
    try {
      const configs = await prisma.modelConfig.findMany({ 
        where: { isActive: true },
        orderBy: { createdAt: "desc" }
      });
      const grouped = {};
      configs.forEach(c => {
        if (!grouped[c.stage]) grouped[c.stage] = [];
        grouped[c.stage].push(c.modelName);
      });
      modelCache.data = grouped;
      modelCache.lastFetched = now;
    } catch (err) {
      console.error(`[CORE] ⚠️ Failed to fetch ModelConfig: ${err.message}`);
    }
  }

  const dbModels = modelCache.data[stage];
  if (dbModels && dbModels.length > 0) return dbModels;
  
  const { getWorkerConfig } = require("./shared");
  const key = `model_${stage.toLowerCase()}`;
  const val = await getWorkerConfig(prisma, company, key, null);
  
  if (val && typeof val === "string") return [val];
  if (Array.isArray(val)) return val;
  
  return STAGE_MODELS[stage] || [FALLBACK_MODEL];
}

if (USE_SAFE_MODE) {
  console.log(`[CORE] 🛡️ SAFE MODE ACTIVE: Falling back to ${FALLBACK_MODEL}`);
}

const FLASHCARD_MIN_CONFIDENCE = 40;
const FLASHCARD_MIN_IMPACT = 40;
const FLASHCARD_MIN_WEIGHT = 40;
const TASK_MIN_ICE_SCORE = 50;

// AI serial lock (concurrency = 1)

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
  DRAFT_STAGE_TIMEOUT_MS,
  WRITE_STAGE_TIMEOUT_MS,
  JUDGE_STAGE_TIMEOUT_MS,
  STAGE_MODELS,
  FLASHCARD_MIN_CONFIDENCE,
  FLASHCARD_MIN_IMPACT,
  FLASHCARD_MIN_WEIGHT,
  TASK_MIN_ICE_SCORE,
  queueAiInference,
  envFlag,
  getStageModels
};
