const { getHumanMemoryPrompt } = require("./memory");
const { draftFlashcardFromDataCard, draftTaskcardFromFlashCard } = require("./drafter");
const { refineDraftFlashCard, refineDraftTaskCard } = require("./writer");
const { auditCheckedFlashCard, auditCheckedTaskCard } = require("./judge");
const { getWorkerConfig } = require("./shared");
const { runMaintenance, processUserFeedback } = require("./maintenance");
const { updateCompanyMemory } = require("./memory");
const { enforceLanguagePolicy } = require("./language-validator");
const { OLLAMA_MODEL, STAGE_MODELS } = require("./core");
const { generateStrategicKeywords, performResearchHarvest } = require("./research");

/**
 * SOVEREIGN SYNTHESIS ENGINE
 * v0.11.4-STABLE
 * 
 * Implements round-robin orchestration (Orbiting) across all multi-tenant companies.
 * Ensures fair distribution of AI compute and prevents sequential starvation.
 */

// --- GLOBAL STATE ---
var synthesisState = {
  state: "idle",
  stage: "IDLE",
  pass: 0,
  lastProgressAt: new Date().toISOString(),
  currentCompany: null,
  cycleCount: 0,
  enrichmentModeFlashcards: false,
  enrichmentModeTasks: false,
  // Consistency Metrics (#115)
  metrics: {
    totalOpsThisCycle: 0,         // Operations completed in current/last cycle
    zeroOutputStreak: 0,          // Consecutive cycles with 0 ops (stall indicator)
    lastNonZeroCycleAt: null,     // Timestamp of last productive cycle
    companiesCoveredThisCycle: 0, // Companies that produced at least 1 op this cycle
    failedCardsThisCycle: 0,      // Cards that hit errors this cycle
    totalResearchYield: 0,        // Total new sources found by AI research
    zeroYieldTopicStreak: 0,      // Consecutive topics with 0 research results
    cycleHistory: []              // Last 10 cycle summaries for trend visibility
  },
  errorStats: {
    attempts: 0,
    failures: 0,
    criticalFailureStreak: 0
  }
};

/**
 * Retrieves the current internal operational state of the synthesis engine.
 * Used primarily for health reporting and status dashboards.
 * 
 * @returns {object} Current synthesis state
 */
function getSynthesisProgress() {
  return synthesisState;
}

/**
 * Aggregates global worker configuration settings for reporting.
 * 
 * @param {PrismaClient} prisma - Database client instance
 * @returns {Promise<object>} Map of active worker settings
 */
async function collectGlobalWorkerSettings(prisma) {
  const pollIntervalSec = await getWorkerConfig(prisma, {}, "loop_interval_ms", 600000) / 1000;
  const ollamaTimeout = await getWorkerConfig(prisma, {}, "ollama_timeout_ms", 120000);

  return {
    supervisorContractVersion: 1,
    schedulingMode: "company-serial-cycle",
    companyCycleCooldownMs: pollIntervalSec * 1000,
    researchHarvestBatchSize: 1,
    ollamaTimeoutMs: ollamaTimeout,
    failsafeModel: `DRAFT: ${STAGE_MODELS.DRAFT.join("/")} | WRITE: ${STAGE_MODELS.WRITE.join("/")} | JUDGE: ${STAGE_MODELS.JUDGE.join("/")}`,
    failsafeTimeoutMs: 90000,
    failsafeMaxAttempts: 2,
    taskMinIceScore: await getWorkerConfig(prisma, {}, "task_min_ice", 50),
    flashcardMinConfidence: await getWorkerConfig(prisma, {}, "flashcard_min_confidence", 40),
    flashcardMinImpact: await getWorkerConfig(prisma, {}, "flashcard_min_impact", 40),
    flashcardMinWeight: await getWorkerConfig(prisma, {}, "flashcard_min_weight", 40),
    stuckRunningMs: 15 * 60 * 1000,
    noProgressMs: 180 * 60 * 1000,
    flashcardRevisitBatchSize: await getWorkerConfig(prisma, {}, "flashcard_revisit_batch_size", 1),
    taskRevisitBatchSize: await getWorkerConfig(prisma, {}, "task_revisit_batch_size", 1),
    feedbackReplayBatchSize: await getWorkerConfig(prisma, {}, "feedback_replay_batch_size", 1),
    hashtagMaintenanceBatchSize: await getWorkerConfig(prisma, {}, "hashtag_maintenance_batch_size", 1),
    cleanupBatchSize: await getWorkerConfig(prisma, {}, "cleanup_batch_size", 1),
    flashcardRevisitIntervalMinutes: await getWorkerConfig(prisma, {}, "flashcard_revisit_interval_minutes", 0),
    taskRevisitIntervalMinutes: await getWorkerConfig(prisma, {}, "task_revisit_interval_minutes", 0),
    feedbackReplayIntervalMinutes: await getWorkerConfig(prisma, {}, "feedback_replay_interval_minutes", 0),
    hashtagMaintenanceIntervalHours: await getWorkerConfig(prisma, {}, "hashtag_maintenance_interval_hours", 0),
    cleanupIntervalHours: await getWorkerConfig(prisma, {}, "cleanup_interval_hours", 0),
    factcheckMinCitations: await getWorkerConfig(prisma, {}, "factcheck_min_citations", 2),
    factcheckMinDomains: await getWorkerConfig(prisma, {}, "factcheck_min_domains", 2)
  };
}

/**
 * Persists the current synthesis state to the database global settings.
 * This acts as the Source of Truth for the cloud-based webapp (Vercel).
 */
async function syncSynthesisStateToDb(prisma) {
  try {
    if (!synthesisState) {
      console.warn("[WORKER] [SYNC] synthesisState not initialized, skipping DB sync...");
      return;
    }
    const settings = await collectGlobalWorkerSettings(prisma);
    const data = {
      state: synthesisState.state,
      stage: synthesisState.stage,
      pass: synthesisState.pass,
      lastProgressAt: synthesisState.lastProgressAt,
      currentCompany: synthesisState.currentCompany,
      cycleCount: synthesisState.cycleCount,
      timestamp: new Date().toISOString(),
      researchEnabled: process.env.CHECKLIST_RESEARCH_ENABLED === "true",
      settings,
      // Consistency Metrics (#115)
      metrics: synthesisState.metrics
    };
    
    await prisma.globalSetting.upsert({
      where: { key: "core_synthesis_progress" },
      create: { key: "core_synthesis_progress", value: data },
      update: { value: data, updatedAt: new Date() }
    });
  } catch (err) {
    console.error(`[HEARTBEAT] Global sync failed:`, err.message);
  }
}
// --- CYCLING LOGIC ---

/**
 * Executes a global synthesis cycle across all companies in the database.
 * Uses a rotation-aware selection to ensure equitable distribution of AI attention.
 * 
 * @param {PrismaClient} prisma - Database client instance
 * @returns {Promise<{ workDone: boolean, operations: number }>} Result of the cycle
 */
async function runSynthesisCycle(prisma) {
  let totalOperations = 0;
  // Fair Rotation: Oldest last-visited company first
  const rawCompanies = await prisma.company.findMany({
    orderBy: { lastAIVisited: "asc" }
  });

  // --- PRIORITY BOOST (#Scale) ---
  // Companies with high intensity are prioritized even if visited recently.
  const companies = rawCompanies.sort((a, b) => {
    const aHigh = a.workerConfig?.intensity === "high";
    const bHigh = b.workerConfig?.intensity === "high";
    if (aHigh && !bHigh) return -1;
    if (!aHigh && bHigh) return 1;
    return 0; // Maintain lastAIVisited order for same intensity
  });

  console.log(`[SYNTHESIS] CYCLE #${synthesisState.cycleCount + 1}: ${companies.length} companies queued.`);

  synthesisState.state = "running";
  synthesisState.stage = "SCHEDULING";
  synthesisState.pass = 0;
  synthesisState.lastProgressAt = new Date().toISOString();
  synthesisState.cycleCount++;

  const batchSize = await getWorkerConfig(prisma, {}, "batch_limit", 5);
  console.log(`[SYNTHESIS] Orbiting ${companies.length} companies (Batch Size: ${batchSize})...`);

  // Process a batch of companies to ensure fairness
  // --- Consistency Metrics Tracking ---
  const cycleStart = Date.now();
  const perCompanyOps = {};
  synthesisState.metrics.totalOpsThisCycle = 0;
  synthesisState.metrics.companiesCoveredThisCycle = 0;
  synthesisState.metrics.failedCardsThisCycle = 0;

  for (const company of companies.slice(0, batchSize)) {
    try {
      const ops = await processCompanySynthesis(prisma, company);
      totalOperations += ops;
      perCompanyOps[company.name] = ops;
      synthesisState.metrics.totalOpsThisCycle += ops;
      if (ops > 0) synthesisState.metrics.companiesCoveredThisCycle++;
    } catch (err) {
      console.error(`[ERROR] Synthesis failure for ${company.name}:`, err.message);
      synthesisState.errorStats.failures++;
    }
  }

  // Update zero-output streak
  if (totalOperations === 0) {
    synthesisState.metrics.zeroOutputStreak++;
    if (synthesisState.metrics.zeroOutputStreak >= 3) {
      console.warn(`[CONSISTENCY] Zero-output streak: ${synthesisState.metrics.zeroOutputStreak} consecutive cycles. System may be stalled.`);
    }
  } else {
    synthesisState.metrics.zeroOutputStreak = 0;
    synthesisState.metrics.lastNonZeroCycleAt = new Date().toISOString();
  }

  // --- HEALTH AUDIT & ALERTING (#41) ---
  const stats = synthesisState.errorStats;
  const totalAttempts = stats.attempts + stats.failures;
  const failureRate = totalAttempts > 0 ? stats.failures / totalAttempts : 0;
  
  if (failureRate > 0.15) {
    stats.criticalFailureStreak++;
    console.error(`[SYSTEM_ALERT] High AI failure rate: ${(failureRate * 100).toFixed(1)}% (streak: ${stats.criticalFailureStreak})`);
  } else {
    stats.criticalFailureStreak = 0;
  }

  // Sync Cycle History
  const cycleRecord = {
    cycleNumber: synthesisState.cycleCount,
    startedAt: new Date(cycleStart).toISOString(),
    durationMs: Date.now() - cycleStart,
    totalOps: totalOperations,
    failureRate: (failureRate * 100).toFixed(1) + "%",
    companiesCovered: synthesisState.metrics.companiesCoveredThisCycle,
    perCompanyOps
  };

  synthesisState.metrics.cycleHistory.unshift(cycleRecord);
  if (synthesisState.metrics.cycleHistory.length > 10) synthesisState.metrics.cycleHistory.pop();

  // Reset per-cycle stats
  stats.attempts = 0;
  stats.failures = 0;

  synthesisState.state = "idle";
  synthesisState.stage = "IDLE";
  synthesisState.pass = 0;
  synthesisState.currentCompany = null;
  synthesisState.lastProgressAt = new Date().toISOString();

  return { workDone: totalOperations > 0, operations: totalOperations };
}

/**
 * Performs a deep synthesis pass for a specific company.
 * Orchestrates Drafter -> Writer -> Judge pipeline across multiple passes.
 * 
 * @param {PrismaClient} prisma - Database client instance
 * @param {object} company - Company database record to synthesize
 * @returns {Promise<number>} Number of meaningful operations performed
 */
async function processCompanySynthesis(prisma, company) {
  let ops = 0;
  const cid = company.id;
  
  // 1. Worker Configuration
  const passes = await getWorkerConfig(prisma, company, "mini_loop_passes", 3);
  const orbitLimit = await getWorkerConfig(prisma, company, "batch_limit", 5);

  // 1.5. Mode Selection (Thresholds)
  const [sourceCount, fileCount, flashcardCount, activeTasksCount] = await Promise.all([
    prisma.source.count({ where: { companyId: cid } }),
    prisma.uploadedSourceFile.count({ where: { companyId: cid } }),
    prisma.flashcard.count({ where: { companyId: cid } }),
    prisma.nBAItem.count({
      where: {
        companyId: cid,
        processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED"] },
        activityState: { in: ["ACTIVE", "STALE"] }
      }
    })
  ]);

  const totalSources = sourceCount + fileCount;
  const flashcardRatio = totalSources > 0 ? flashcardCount / totalSources : 0;
  
  const enrichmentModeFlashcards = flashcardRatio >= 10;
  const enrichmentModeTasks = activeTasksCount >= 50;

  synthesisState.enrichmentModeFlashcards = enrichmentModeFlashcards;
  synthesisState.enrichmentModeTasks = enrichmentModeTasks;

  if (enrichmentModeFlashcards) console.log(`[SYNTHESIS] ${company.name}: FLASHCARD ENRICHMENT MODE ACTIVE (Ratio: ${flashcardRatio.toFixed(1)}x)`);
  if (enrichmentModeTasks) console.log(`[SYNTHESIS] ${company.name}: TASK ENRICHMENT MODE ACTIVE (Count: ${activeTasksCount})`);
  
  synthesisState.currentCompany = company.name;
  synthesisState.lastProgressAt = new Date().toISOString();
  const traceId = Math.random().toString(36).substring(2, 10).toUpperCase();
  console.log(`[SYNTHESIS] [${traceId}] ${company.name}: Cycle initiated.`);

  // --- BRAIN RECONCILIATION & DURABLE MEMORY (Fast-Path) ---
  // We run this BEFORE synthesis so feedback received during idle is applied immediately.
  console.log(`[SYNTHESIS] ${company.name}: Reconciling human feedback (Fast-Path)...`);
  await processUserFeedback(prisma, company);
  await updateCompanyMemory(prisma, company);

  console.log(`[SYNTHESIS] ${company.name}: Starting ${passes}-pass Mini-loop.`);

  const maxOpsPerCompany = await getWorkerConfig(prisma, company, "max_ops_per_company", 50);

  for (let pass = 1; pass <= passes; pass++) {
    if (ops >= maxOpsPerCompany) {
      console.warn(`[QUOTA EXCEEDED] ${company.name}: Hit limit of ${maxOpsPerCompany} ops. Throttling until next rotation.`);
      break;
    }
    synthesisState.pass = pass;
    console.log(`[SYNTHESIS] ${company.name}: PASS ${pass}/${passes}`);

    // --- STRATEGIC TOPIC SELECTION & RESEARCH (#111) ---
    const activeTopics = await prisma.topic.findMany({ 
      where: { companyId: cid, active: true },
      orderBy: { sortOrder: "asc" }
    });
    const topic = activeTopics.length > 0 ? activeTopics[(pass - 1) % activeTopics.length] : null;
    
    if (topic) {
      console.log(`[SYNTHESIS] ${company.name}: Strategic Focus -> [${topic.label}]`);
      
      // --- TOPIC-DRIVEN RESEARCH HARVEST (#111, #112) ---
      synthesisState.stage = "RESEARCHING";
      const researchSources = await performResearchHarvest(prisma, company, topic);
      
      if (researchSources.length > 0) {
        console.log(`[RESEARCH] ${company.name}: Yielded ${researchSources.length} new sources for topic [${topic.label}].`);
        synthesisState.metrics.totalResearchYield += researchSources.length;
        synthesisState.metrics.zeroYieldTopicStreak = 0;
        
        for (const rs of researchSources) {
          const publicId = await require("./shared").nextPublicId(prisma, "Source");
          await prisma.source.upsert({
            where: { companyId_legacyOriginKey: { companyId: cid, legacyOriginKey: rs.metadata.url } },
            create: { ...rs, publicId, legacyOriginKey: rs.metadata.url },
            update: { updatedAt: new Date() }
          });
          ops++;
        }
      } else {
        console.warn(`[RESEARCH ZERO YIELD] ${company.name}: No new evidence found for topic [${topic.label}].`);
        synthesisState.metrics.zeroYieldTopicStreak++;
      }
    }
    
    // Step A: Teach Local Brain
    const memoryPrompt = await getHumanMemoryPrompt(prisma, company);

    // --- STAGE 0: Orbit Entrance ---
    await prisma.company.update({
      where: { id: cid },
      data: { lastAIVisited: new Date() }
    });
    synthesisState.stage = "ORBITING";
    console.log(`[SYNTHESIS] ${company.name}: Entering Orbit...`);

    // --- STAGE 0.5: JUDGE BACKLOG FLUSH (#115) ---
    // If the company has a massive backlog of CHECKED cards, dedicate a pass to clearing them.
    const checkedCount = await prisma.flashcard.count({ where: { companyId: cid, processingStatus: "CHECKED" } });
    if (checkedCount > 100) {
      console.log(`[SYNTHESIS] [BACKLOG] ${company.name}: High backlog detected (${checkedCount} cards). Initiating Judge Flush.`);
      ops += await flushJudgeBacklog(prisma, company, memoryPrompt);
    }

    // --- STAGE 1: DRAFTER (Sources & Files -> Flashcards) ---
    synthesisState.stage = "SCRUBBING";

    if (enrichmentModeFlashcards) {
      console.log(`[SYNTHESIS] ${company.name}: Skipping new drafts. Enrichment mode active.`);
    } else {
    
    // Fetch both raw text sources and uploaded binary files
    // Prioritize those that match the current topic's hashtags if available (#111)
    const topicHashtags = topic?.hashtags || [];
    
    const [rawSources, rawFiles] = await Promise.all([
      prisma.source.findMany({ 
        where: { 
          companyId: cid,
          ...(topicHashtags.length > 0 ? { hashtags: { hasSome: topicHashtags } } : {})
        }, 
        take: orbitLimit 
      }),
      prisma.uploadedSourceFile.findMany({ 
        where: { 
          companyId: cid,
          ...(topicHashtags.length > 0 ? { hashtags: { hasSome: topicHashtags } } : {})
        }, 
        take: orbitLimit 
      })
    ]);

      // Normalize into Unified DataCards
      // --- QUALITY SORTING (#53) ---
      const dataCards = [
        ...rawSources.map(s => ({ 
          id: s.id, 
          type: "SOURCE", 
          content: s.content, 
          name: "Source Snippet",
          qualityScore: s.metadata?.qualityScore || 5
        })),
        ...rawFiles.map(f => ({
          id: f.id,
          type: "FILE",
          content: f.content?.toString("utf8").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") || "",
          name: f.filename,
          qualityScore: 8 // Uploaded files are high-intent
        }))
      ].sort((a, b) => b.qualityScore - a.qualityScore);

    console.log(`[SYNTHESIS] ${company.name}: Scrubbing ${dataCards.length} DataCards...`);
    
    for (const dc of dataCards) {
      synthesisState.lastProgressAt = new Date().toISOString();
      console.log(`[SYNTHESIS] [${traceId}] [${dc.type}] Scrubbing: ${dc.name} (${dc.id}) [Quality: ${dc.qualityScore}]...`);
      synthesisState.errorStats.attempts++;
      
      const drafts = await draftFlashcardFromDataCard(prisma, company, dc, memoryPrompt, topic);
      ops += drafts.length;
      if (drafts.length === 0) {
        console.log(`[WARN] Drafter returned 0 insights for ${dc.type}: ${dc.id}. Model may be refusing or content is silent.`);
      }

      for (const draft of drafts) {
        const { sourceId, sourceType, ...cleanDraft } = draft;
        const created = await prisma.flashcard.upsert({
          where: { companyId_fingerprint: { companyId: cid, fingerprint: draft.fingerprint } },
          create: { ...cleanDraft, companyId: cid },
          update: { updatedAt: new Date() }
        });
        
        // Ensure Source Linking
        await prisma.flashcardSource.upsert({
          where: { flashcardId_sourceType_sourceId: { flashcardId: created.id, sourceType: dc.type, sourceId: dc.id } },
          create: { flashcardId: created.id, sourceType: dc.type, sourceId: dc.id, sourceName: dc.name },
          update: {}
        });

        // --- TOPIC ANCHORING & TRACEABILITY (#StrategyDrift, #43) ---
        const traceTag = `[TRACE:${traceId}] [QUALITY:${dc.qualityScore}]`;
        const topicTag = topic ? `[TOPIC_ID:${topic.id}]` : "";
        
        await prisma.flashcard.update({
          where: { id: created.id },
          data: { 
            userAnnotation: `${created.userAnnotation || ""} ${traceTag} ${topicTag}`.trim() 
          }
        });
        ops++;
      }
    }
    }

    // --- STAGE 2: WRITER & JUDGE (The Quality Pipeline) ---
    
    // 2.a Flashcards: DRAFT -> CHECKED -> VERIFIED
    synthesisState.stage = "WRITING";
    const fcActive = await prisma.flashcard.findMany({ 
      where: { companyId: cid, processingStatus: { in: ["DRAFT", "CHECKED"] } },
      orderBy: { updatedAt: "asc" }, // FOCUS: Oldest modified first
      take: orbitLimit
    });

    const MAX_CARD_FAILURES = 5;

    for (const fc of fcActive) {
      synthesisState.lastProgressAt = new Date().toISOString();
      // Parse failure count from annotation
      const failureMatch = fc.userAnnotation?.match(/\[FAIL:(\d+)\]/);
      const failureCount = failureMatch ? parseInt(failureMatch[1], 10) : 0;

      // Exile card after too many consecutive AI failures
      if (failureCount >= MAX_CARD_FAILURES) {
        console.warn(`[DLQ] fc:${fc.id} has failed ${failureCount} times. Exiling to REVIEW.`);
        const reason = `[DLQ] Exiled after ${MAX_CARD_FAILURES} consecutive AI failures. Requires human inspection.`;
        await prisma.flashcard.update({
          where: { id: fc.id },
          data: { processingStatus: "REVIEW", userAnnotation: reason }
        });
        
        await prisma.workerReport.create({
          data: { type: "DLQ_EXILE", data: { cardId: fc.id, cardType: "FLASHCARD", failureCount, reason } }
        });
        continue;
      }

      try {
        if (fc.processingStatus === "DRAFT") {
          synthesisState.errorStats.attempts++;
          const refined = await refineDraftFlashCard(prisma, fc, memoryPrompt, topic);
          if (refined) {
            // --- VERSION HISTORY (Audit Trail) ---
            await prisma.flashcardAction.create({
              data: {
                flashcardId: fc.id,
                action: "ANNOTATE",
                annotation: "[AI:REFINED]",
                previousTitle: fc.title,
                previousBody: fc.body,
                modifiedTitle: refined.title,
                modifiedBody: refined.body,
                actedBy: `trinity-writer:${traceId}`
              }
            });

            // --- PRESERVE TRACEABILITY TAGS (#43) ---
            const preservedTags = (fc.userAnnotation || "").match(/\[TRACE:[^\]]+\]|\[QUALITY:[^\]]+\]|\[TOPIC_ID:[^\]]+\]/g) || [];
            const tagString = preservedTags.join(" ");

            await prisma.flashcard.update({ 
              where: { id: fc.id }, 
              data: { ...refined, userAnnotation: tagString || null } 
            });
            ops++;
          } else {
            // Writer returned null — bump failure count
            const nextCount = failureCount + 1;
            synthesisState.errorStats.failures++;
            await prisma.flashcard.update({ where: { id: fc.id }, data: { userAnnotation: `[FAIL:${nextCount}] Writer returned null.`, updatedAt: new Date() } });
          }
        } else if (fc.processingStatus === "CHECKED") {
          synthesisState.stage = "JUDGING";
          synthesisState.errorStats.attempts++;

          // --- FACT CHECKING CONTEXT (#Hallucination) ---
          let sourceContent = null;
          if (fc.sourceId) {
            const source = await prisma.source.findUnique({ where: { id: fc.sourceId } }) || 
                           await prisma.uploadedSourceFile.findUnique({ where: { id: fc.sourceId } });
            if (source) {
              sourceContent = source.content?.toString() || "";
            }
          }

          const audit = await auditCheckedFlashCard(prisma, fc, memoryPrompt, topic, sourceContent);
          if (audit) {
            // --- VERSION HISTORY (Audit Trail) ---
            await prisma.flashcardAction.create({
              data: {
                flashcardId: fc.id,
                action: "ANNOTATE",
                annotation: audit.processingStatus === "VERIFIED" ? "[AI:VERIFIED]" : "[AI:REJECTED]",
                previousTitle: fc.title,
                previousBody: fc.body,
                modifiedTitle: audit.title || fc.title,
                modifiedBody: audit.body || fc.body,
                actedBy: `trinity-judge:${traceId}`
              }
            });

            // --- PRESERVE TRACEABILITY TAGS (#43) ---
            const preservedTags = (fc.userAnnotation || "").match(/\[TRACE:[^\]]+\]|\[QUALITY:[^\]]+\]|\[TOPIC_ID:[^\]]+\]/g) || [];
            const tagString = preservedTags.join(" ");

            const updated = await prisma.flashcard.update({ 
              where: { id: fc.id }, 
              data: { ...audit, userAnnotation: (audit.userAnnotation || tagString) || null } 
            });
            await enforceLanguagePolicy(prisma, updated, "FLASHCARD", company);
            ops++;
          } else {
            const nextCount = failureCount + 1;
            synthesisState.errorStats.failures++;
            await prisma.flashcard.update({ where: { id: fc.id }, data: { userAnnotation: `[FAIL:${nextCount}] Judge returned null.`, updatedAt: new Date() } });
          }
        }
      } catch (cardErr) {
        const nextCount = failureCount + 1;
        synthesisState.errorStats.failures++;
        console.warn(`[WARN] fc:${fc.id} failed (attempt ${nextCount}/${MAX_CARD_FAILURES}): ${cardErr.message}`);
        await prisma.flashcard.update({
          where: { id: fc.id },
          data: { userAnnotation: `[FAIL:${nextCount}] ${cardErr.message.slice(0, 200)}`, updatedAt: new Date() }
        });
      }
    }

    // 2.b Taskcards: DRAFT -> CHECKED -> VERIFIED
    const tcActive = await prisma.nBAItem.findMany({ 
      where: { companyId: cid, processingStatus: { in: ["DRAFT", "CHECKED"] } },
      orderBy: { updatedAt: "asc" }, // FOCUS: Oldest modified first
      take: orbitLimit
    });

    for (const tc of tcActive) {
      synthesisState.lastProgressAt = new Date().toISOString();
      const tcFailureMatch = tc.userAnnotation?.match(/\[FAIL:(\d+)\]/);
      const tcFailureCount = tcFailureMatch ? parseInt(tcFailureMatch[1], 10) : 0;

      if (tcFailureCount >= MAX_CARD_FAILURES) {
        console.warn(`[DLQ] tc:${tc.id} has failed ${tcFailureCount} times. Exiling to REVIEW.`);
        const reason = `[DLQ] Exiled after ${MAX_CARD_FAILURES} consecutive AI failures. Requires human inspection.`;
        await prisma.nBAItem.update({
          where: { id: tc.id },
          data: { processingStatus: "REVIEW", userAnnotation: reason }
        });
        
        await prisma.workerReport.create({
          data: { type: "DLQ_EXILE", data: { cardId: tc.id, cardType: "TASKCARD", tcFailureCount, reason } }
        });
        continue;
      }

      try {
        if (tc.processingStatus === "DRAFT") {
          synthesisState.stage = "WRITING";
          synthesisState.errorStats.attempts++;
          const refined = await refineDraftTaskCard(prisma, tc, memoryPrompt, topic);
          if (refined) {
            // Preserve tags (#43)
            const preservedTags = (tc.userAnnotation || "").match(/\[TRACE:[^\]]+\]|\[QUALITY:[^\]]+\]|\[TOPIC_ID:[^\]]+\]/g) || [];
            const tagString = preservedTags.join(" ");
            await prisma.nBAItem.update({ where: { id: tc.id }, data: { ...refined, userAnnotation: tagString || null } });
            ops++;
          } else {
            const nextCount = tcFailureCount + 1;
            synthesisState.errorStats.failures++;
            await prisma.nBAItem.update({ where: { id: tc.id }, data: { userAnnotation: `[FAIL:${nextCount}] Writer returned null.`, updatedAt: new Date() } });
          }
        } else if (tc.processingStatus === "CHECKED") {
          synthesisState.stage = "JUDGING";
          synthesisState.errorStats.attempts++;
          
          // --- FACT CHECKING CONTEXT ---
          let sourceContent = null;
          if (tc.sourceId) {
            const source = await prisma.source.findUnique({ where: { id: tc.sourceId } }) || 
                           await prisma.uploadedSourceFile.findUnique({ where: { id: tc.sourceId } });
            if (source) {
              sourceContent = source.content?.toString() || "";
            }
          }

          const audit = await auditCheckedTaskCard(prisma, tc, memoryPrompt, topic, sourceContent);
          if (audit) {
            // Preserve tags (#43)
            const preservedTags = (tc.userAnnotation || "").match(/\[TRACE:[^\]]+\]|\[QUALITY:[^\]]+\]|\[TOPIC_ID:[^\]]+\]/g) || [];
            const tagString = preservedTags.join(" ");
            const updated = await prisma.nBAItem.update({ where: { id: tc.id }, data: { ...audit, userAnnotation: (audit.userAnnotation || tagString) || null } });
            await enforceLanguagePolicy(prisma, updated, "TASK", company);
            ops++;
          } else {
            const nextCount = tcFailureCount + 1;
            synthesisState.errorStats.failures++;
            await prisma.nBAItem.update({ where: { id: tc.id }, data: { userAnnotation: `[FAIL:${nextCount}] Judge returned null.`, updatedAt: new Date() } });
          }
        }
      } catch (cardErr) {
        const nextCount = tcFailureCount + 1;
        synthesisState.errorStats.failures++;
        console.warn(`[WARN] tc:${tc.id} failed (attempt ${nextCount}/${MAX_CARD_FAILURES}): ${cardErr.message}`);
        await prisma.nBAItem.update({
          where: { id: tc.id },
          data: { userAnnotation: `[FAIL:${nextCount}] ${cardErr.message.slice(0, 200)}`, updatedAt: new Date() }
        });
      }
    }

    if (enrichmentModeTasks) {
      console.log(`[SYNTHESIS] ${company.name}: Skipping new task generation. Enrichment mode active (Limit 50).`);
    } else {
      const verifiedFlash = await prisma.flashcard.findMany({ 
        where: { companyId: cid, processingStatus: "VERIFIED" },
        orderBy: { updatedAt: "asc" }, // FOCUS: Oldest modified first
        take: orbitLimit
      });
    for (const vf of verifiedFlash) {
      synthesisState.lastProgressAt = new Date().toISOString();
      console.log(`[DEBUG] draftTaskcardFromFlashCard for vf.id: ${vf.id}`);
      const taskDrafts = await draftTaskcardFromFlashCard(prisma, company, vf, memoryPrompt);
      for (const td of taskDrafts) {
        const createdTc = await prisma.nBAItem.upsert({
          where: { companyId_fingerprint: { companyId: cid, fingerprint: td.fingerprint } },
          create: { 
            ...td, 
            userAnnotation: `[TRACE:${traceId}] [TOPIC_ID:${topic?.id || "NONE"}]` 
          },
          update: { 
            updatedAt: new Date(),
            userAnnotation: `[TRACE:${traceId}] [TOPIC_ID:${topic?.id || "NONE"}]`
          }
        });
        
        if (createdTc) console.log(`[SYNTHESIS] [${traceId}] Task Created: ${createdTc.id}`);
        ops++;
      }
      }
    }
  }

  // Maintenance Phase — run lifecycle management
  synthesisState.stage = "MAINTENANCE";
  await runMaintenance(prisma, company);

  return ops;
}

/**
 * CLEAR JUDGE BACKLOG
 * v0.12.2
 * 
 * Specifically targets and clears cards in the CHECKED state.
 * This prevents the "Judge Bottleneck" where new insights are blocked by old audits.
 */
async function flushJudgeBacklog(prisma, company, memoryPrompt) {
  const cid = company.id;
  const backlogLimit = 20; // Clear up to 20 per flush to avoid cycle timeouts
  let ops = 0;
  const traceId = Math.random().toString(36).substring(2, 10).toUpperCase();

  const backlog = await prisma.flashcard.findMany({
    where: { companyId: cid, processingStatus: "CHECKED" },
    orderBy: { updatedAt: "asc" },
    take: backlogLimit
  });

  if (backlog.length === 0) return 0;

  for (const fc of backlog) {
    // --- FACT CHECKING CONTEXT ---
    let sourceContent = null;
    if (fc.sourceId) {
      const source = await prisma.source.findUnique({ where: { id: fc.sourceId } }) || 
                     await prisma.uploadedSourceFile.findUnique({ where: { id: fc.sourceId } });
      if (source) sourceContent = source.content?.toString() || "";
    }

    const audit = await auditCheckedFlashCard(prisma, fc, memoryPrompt, null, sourceContent);
    if (audit) {
      // --- VERSION HISTORY (Audit Trail) ---
      await prisma.flashcardAction.create({
        data: {
          flashcardId: fc.id,
          action: "ANNOTATE",
          annotation: audit.processingStatus === "VERIFIED" ? "[AI:VERIFIED]" : "[AI:REJECTED]",
          previousTitle: fc.title,
          previousBody: fc.body,
          modifiedTitle: audit.title || fc.title,
          modifiedBody: audit.body || fc.body,
          actedBy: `trinity-judge-flush:${traceId}`
        }
      });

      await prisma.flashcard.update({ where: { id: fc.id }, data: { ...audit, updatedAt: new Date() } });
      ops++;
    }
  }

  return ops;
}

module.exports = {
  runSynthesisCycle,
  processCompanySynthesis,
  getSynthesisProgress,
  collectGlobalWorkerSettings,
  syncSynthesisStateToDb,
  synthesisState,
  flushJudgeBacklog
};
