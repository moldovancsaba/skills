const { GENERATION_TIMEOUT_MS } = require("../../../src/lib/planner-contract");
const { recordPlannerTelemetry } = require("./telemetry");

async function withPlannerTimeout(prisma, input, operation) {
  const {
    companyId = null,
    label = "planner-stage",
    timeoutMs = GENERATION_TIMEOUT_MS,
    metadata = {},
  } = input || {};

  let timeoutHandle = null;
  const startedAt = Date.now();

  try {
    return await Promise.race([
      operation(),
      new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`[PLANNER_TIMEOUT] ${label} exceeded ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    if (String(error?.message || "").includes("[PLANNER_TIMEOUT]")) {
      await recordPlannerTelemetry(prisma, {
        companyId,
        eventType: "TIMEOUT",
        reason: error.message,
        details: {
          label,
          timeoutMs,
          elapsedMs: Date.now() - startedAt,
          ...metadata,
        },
      });
    }
    throw error;
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

module.exports = {
  withPlannerTimeout,
};
