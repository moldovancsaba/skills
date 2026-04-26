/**
 * SOVEREIGN AI INTERFACE
 * v0.11.4-STABLE
 * 
 * Core communication layer for Ollama and the Trinity Synthesis pipeline.
 * Handles JSON repair, model failover, and serial inference locking.
 */
const http = require("http");
const { 
  OLLAMA_HOST, 
  OLLAMA_MODEL,
  GLOBAL_OLLAMA_TIMEOUT_MS, 
  STAGE_MODELS, 
  TRINITY_DRAFT_TIMEOUT_MS, 
  TRINITY_WRITE_TIMEOUT_MS, 
  TRINITY_JUDGE_TIMEOUT_MS,
  queueAiInference 
} = require("./core");

// --- UTILITIES ---

/**
 * Normalizes text by removing HTML tags and special characters.
 * 
 * @param {string} value - Raw text input
 * @returns {string} Cleaned, normalized string
 */
function normalizeText(value) {
  if (!value) return "";
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tokenizes text into a set of significant keywords.
 * 
 * @param {string} value - Text to tokenize
 * @returns {string[]} Array of lowercase keywords > 3 chars
 */
function tokenizeText(value) {
  return normalizeText(value)
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 3);
}

/**
 * Processes an array of hashtags into a stable, comparable format.
 * 
 * @param {string[]} values - Raw hashtag array
 * @returns {string[]} Sanitized, lowercase, space-free hashtags
 */
function normalizeHashtags(values = []) {
  if (!Array.isArray(values)) return [];
  return values
    .map((v) => normalizeText(v).toLowerCase().replace(/\s+/g, ""))
    .filter((v) => v.length > 2);
}

/**
 * Identifies and extracts the first JSON block from a string.
 * Now handles markdown code fences and cleans preamble noise.
 * 
 * @param {string} content - Raw AI output string
 * @returns {string|null} Full {JSON} block if found, else null
 */
function extractJsonCandidate(content) {
  if (!content) return null;

  // Clean markdown fences if they exist
  let cleaned = content
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  const match = cleaned.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

// --- CORE AI FETCHERS ---

/**
 * Performs a chat completion via the local Ollama instance.
 * Automatically respects the Sovereign Serial Lock.
 * 
 * @param {object[]} messages - Array of chat message objects
 * @param {object} options - Execution options (model, timeout, format)
 * @returns {Promise<string>} Model response content
 */
async function callOllama(messages, options = {}) {
  return queueAiInference(() => new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: options.model || OLLAMA_MODEL || "llama3.2:3b",
      messages,
      stream: false,
      options: {
        num_predict: 2048,
        temperature: 0.1, // Low temp for stable JSON
      },
      format: options.format === "json" ? "json" : undefined,
    });

    const url = new URL("/api/chat", OLLAMA_HOST);
    const req = http.request(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeout: options.timeoutMs || GLOBAL_OLLAMA_TIMEOUT_MS,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            if (res.statusCode !== 200) {
              throw new Error(`Ollama returned status ${res.statusCode}: ${body}`);
            }
            const data = JSON.parse(body);
            resolve(data.message?.content || "");
          } catch (err) {
            reject(new Error(`Failed to parse Ollama response: ${err.message}`));
          }
        });
      }
    );

    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Ollama chat timed out after ${options.timeoutMs || GLOBAL_OLLAMA_TIMEOUT_MS}ms`));
    });
    req.write(payload);
    req.end();
  }));
}

/**
 * Requests a JSON-structured response from the AI.
 * Implements an automatic "Deep Repair" pass if initial JSON is malformed.
 * 
 * @param {string} systemPrompt - Instruction context
 * @param {string} userPrompt - Query context
 * @param {object} options - Execution options
 * @returns {Promise<object>} Parsed JSON object
 */
async function callOllamaJson(systemPrompt, userPrompt, options = {}) {
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];
  
  let content = await callOllama(messages, { ...options, format: "json" });
  let candidate = extractJsonCandidate(content);
  
  if (!candidate) {
    console.warn(`[WARN] [${options.model}] No braces found in output. Raw: ${content.slice(0, 100)}...`);
    // Attempt recovery: Ask the model to wrap its previous thought in JSON
    const recovery = await callOllama([
      ...messages,
      { role: "assistant", content: content },
      { role: "user", content: "You failed to provide valid JSON. Return your previous answer exactly but as a single valid JSON object." }
    ], { ...options, format: "json" });
    
    candidate = extractJsonCandidate(recovery);
    if (!candidate) {
      throw new Error(`Ollama returned no extractable JSON content for ${options.model}.`);
    }
  }

  try {
    return JSON.parse(candidate);
  } catch (error) {
    console.warn(`Initial parse failed for ${options.model}, attempting deep repair...`);
    const repaired = await callOllama([
      {
        role: "system",
        content: "You are a JSON Repair Expert. Fix the following BROKEN JSON payload. Return ONLY valid JSON. No preamble.",
      },
      { role: "user", content: candidate },
    ], {
      model: options.model || "llama3.2:3b",
      timeoutMs: GLOBAL_OLLAMA_TIMEOUT_MS,
      format: "json",
    });
    const repairedCandidate = extractJsonCandidate(repaired);
    if (!repairedCandidate) throw new Error("Critical JSON failure: Repair attempt returned empty content.");
    return JSON.parse(repairedCandidate);
  }
}

/**
 * Executes a JSON query with a prioritized list of models.
 * Automatically falls back to the next model if the current one fails.
 * 
 * @param {string} systemPrompt - Instruction context
 * @param {string} userPrompt - Query context
 * @param {string[]} modelList - Array of models to attempt
 * @param {object} options - Execution options
 * @returns {Promise<object>} Parsed JSON object from successful model
 */
async function callOllamaWithFailover(systemPrompt, userPrompt, modelList, options = {}) {
  let lastError = null;
  for (const model of modelList) {
    try {
      return await callOllamaJson(systemPrompt, userPrompt, { ...options, model });
    } catch (err) {
      lastError = err;
      console.warn(`Model ${model} failed, trying next...: ${err.message}`);
    }
  }
  throw lastError || new Error("All models failed");
}

/**
 * Orchestrates a full 3-pass Trinity Synthesis cycle for a company.
 * 
 * @param {object} company - Company database record
 * @param {object} inputContext - Contextual data for synthesis
 * @param {object} stages - Configuration for DRAFT, WRITE, and AUDIT stages
 * @returns {Promise<object>} Full synthesis result object
 */
async function runTrinityPass(company, inputContext, stages = {}) {
  const result = { draft: null, synthesis: null, audit: null };

  if (stages.draft) {
    result.draft = await callOllamaWithFailover(
      stages.draft.systemPrompt,
      JSON.stringify(inputContext),
      STAGE_MODELS.DRAFT,
      { timeoutMs: TRINITY_DRAFT_TIMEOUT_MS }
    );
  }

  if (stages.write) {
    result.synthesis = await callOllamaWithFailover(
      stages.write.systemPrompt,
      JSON.stringify({ draft: result.draft, originalContext: inputContext }),
      STAGE_MODELS.WRITE,
      { timeoutMs: TRINITY_WRITE_TIMEOUT_MS }
    );
  }

  if (stages.audit) {
    result.audit = await callOllamaWithFailover(
      stages.audit.systemPrompt,
      JSON.stringify({ synthesis: result.synthesis, draft: result.draft }),
      STAGE_MODELS.JUDGE,
      { timeoutMs: TRINITY_JUDGE_TIMEOUT_MS }
    );
  }

  return result;
}

module.exports = {
  callOllama,
  callOllamaJson,
  callOllamaWithFailover,
  runTrinityPass,
  normalizeText,
  tokenizeText,
  normalizeHashtags,
  extractJsonCandidate
};
