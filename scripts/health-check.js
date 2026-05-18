/**
 * checklist HEALTH CHECK
 *
 * Diagnostic utility to verify Ollama connectivity, JSON extraction,
 * and local AI pipeline readiness.
 */
const { PrismaClient } = require("@prisma/client");
const { callOllamaJson, extractJsonCandidate } = require("./lib/ai");
const { OLLAMA_HOST, OLLAMA_MODEL } = require("./lib/core");

async function runHealthCheck() {
  console.log("--- checklist HEALTH CHECK ---");
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Ollama Host: ${OLLAMA_HOST}`);
  console.log(`Primary Model: ${OLLAMA_MODEL}`);

  const prisma = new PrismaClient();

  try {
    // 1. Connectivity Check
    console.log("\n[1/4] Checking Ollama connectivity...");
    const start = Date.now();
    const test = await callOllamaJson("You are a health check bot.", "Return {\"status\":\"ok\"}", { model: OLLAMA_MODEL, timeoutMs: 10000 });
    if (test.status === "ok") {
      console.log(`>> SUCCESS: Ollama is responsive (${Date.now() - start}ms)`);
    } else {
      throw new Error("Unexpected response from Ollama");
    }

    // 2. Extraction Robustness Check
    console.log("\n[2/4] Verifying JSON extraction robustness...");
    const noisyContent = "Certainly! Here is the JSON you requested:\n```json\n{\"test\":true}\n```\nHope this helps!";
    const extracted = extractJsonCandidate(noisyContent);
    if (extracted === '{"test":true}') {
      console.log(">> SUCCESS: Markdown code blocks correctly stripped.");
    } else {
      console.error(`>> FAILURE: Extraction failed. Got: [${extracted}]`);
    }

    // 3. Database & Pipeline Check
    console.log("\n[3/4] Auditing Database Pipeline Status...");
    const companies = await prisma.company.count();
    const drafts = await prisma.flashcard.count({ where: { processingStatus: "DRAFT" } });
    const checked = await prisma.flashcard.count({ where: { processingStatus: "CHECKED" } });
    const verified = await prisma.flashcard.count({ where: { processingStatus: "VERIFIED" } });

    console.log(`>> Companies: ${companies}`);
    console.log(`>> Flashcards: DRAFT(${drafts}) | CHECKED(${checked}) | VERIFIED(${verified})`);

    if (checked > 0) {
      console.log(">> INFO: System has CHECKED cards waiting for Judge promotion.");
    }

    // 4. Stage Readiness
    console.log("\n[4/4] Local AI Stage Readiness...");
    const { STAGE_MODELS } = require("./lib/core");
    console.log(`>> DRAFT Models: ${STAGE_MODELS.DRAFT.join(", ")}`);
    console.log(`>> WRITE Models: ${STAGE_MODELS.WRITE.join(", ")}`);
    console.log(`>> JUDGE Models: ${STAGE_MODELS.JUDGE.join(", ")}`);

    console.log("\n--- HEALTH CHECK COMPLETE: SYSTEM STABLE ---");

  } catch (err) {
    console.error("\n--- HEALTH CHECK FAILED ---");
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runHealthCheck();
