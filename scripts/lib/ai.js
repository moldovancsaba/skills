const http = require("http");
const { 
  OLLAMA_HOST, 
  GLOBAL_OLLAMA_TIMEOUT_MS, 
  STAGE_MODELS, 
  TRINITY_DRAFT_TIMEOUT_MS, 
  TRINITY_WRITE_TIMEOUT_MS, 
  TRINITY_JUDGE_TIMEOUT_MS,
  queueAiInference 
} = require("./core");

// --- UTILITIES ---

function normalizeText(value) {
  if (!value) return "";
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeText(value) {
  return normalizeText(value)
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 3);
}

function normalizeHashtags(values = []) {
  if (!Array.isArray(values)) return [];
  return values
    .map((v) => normalizeText(v).toLowerCase().replace(/\s+/g, ""))
    .filter((v) => v.length > 2);
}

function extractJsonCandidate(content) {
  if (!content) return null;
  const match = content.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

// --- CORE AI FETCHERS ---

async function callOllama(messages, options = {}) {
  return queueAiInference(() => new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: options.model || "llama3.2:3b",
      messages,
      stream: false,
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

async function callOllamaJson(systemPrompt, userPrompt, options = {}) {
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];
  
  let content = await callOllama(messages, { ...options, format: "json" });
  let candidate = extractJsonCandidate(content);
  
  if (!candidate) {
    throw new Error("Ollama returned no extractable JSON content");
  }

  try {
    return JSON.parse(candidate);
  } catch (error) {
    console.warn(`Initial parse failed for ${options.model}, attempting deep repair...`);
    const repaired = await callOllama([
      {
        role: "system",
        content: "You are a JSON Repair Expert. Fix the following BROKEN JSON payload. Return ONLY valid JSON.",
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
