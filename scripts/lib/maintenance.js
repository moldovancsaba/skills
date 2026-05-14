const fs = require("fs");
const path = require("path");
const { getWorkerConfig, similarity, hashValue } = require("./shared");
const { enforceLanguagePolicy, canonicalizeAllowedLanguages } = require("./language-validator");
const { fetchUrlContent } = require("./fetcher");
const { CandidateState, ReworkRoute, toArchived, toGenerated, toRework } = require("./lifecycle");
const { recomputeFrontier, refillChecklistFromBacklog: frontierRefill } = require("./frontier");
const { buildSourceLifecycleData, deriveSourceProcessingStatus } = require("../../src/lib/source-contract");
const {
  calculateKnowledgeIceScore,
  normalizeTaskScores,
} = require("../../src/lib/scoring-contract");
const { deriveTopicCardScoreProfile } = require("../../src/lib/upstream-card-scoring");
const { detectEvidenceConflict, ensureCitationSnapshotsForEvidenceBatch } = require("./citations");
const {
  refreshOldestDatacards,
  runPlannerMaintenanceCycle,
} = require("./planner/maintenance-cycle");

/**
 * Shared maintenance and repair engine for scoring, lifecycle, and integrity work.
 *
 * Handles periodic rescoring, lifecycle cleanup, feedback reconciliation, and
 * supporting integrity jobs across the active card layers.
 */
// --- DATA INTEGRITY ---

function isRetryableWriteConflict(error) {
  return Boolean(error && typeof error === "object" && error.code === "P2034");
}

async function withMaintenanceRetry(operation, attempt = 0) {
  try {
    return await operation();
  } catch (error) {
    if (!isRetryableWriteConflict(error) || attempt >= 3) {
      throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    return withMaintenanceRetry(operation, attempt + 1);
  }
}

/**
 * Performs a global audit of all cards to ensure status and kind alignment.
 * Fixes legacy status strings and enforces the checklist Kind Registry.
 * 
 * @param {PrismaClient} prisma - Database client
 */
async function scrubDatabaseElemental(prisma) {
  console.log("[MAINTENANCE] Scrubbing DB integrity...");

  const validKinds = ["SUMMARY", "EXPLANATION", "COMPARISON", "NEWS", "CONCLUSION", "EVALUATION", "OPINION", "JUDGMENT", "RECOMMENDATION", "RESEARCH", "FORECAST", "STOCK", "GOSSIP", "PRICE"];
  const validProc = ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED", "DECLINED"];

  // 1. Flashcards (Batch Scrub — fix invalid processingStatus)
  try {
    const fcToFix = await prisma.flashcard.findMany({
      where: {
        OR: [
          { processingStatus: { notIn: validProc } },
          { status: { not: "ACTIVE" } },
          { kind: { notIn: validKinds } }
        ]
      },
      orderBy: { updatedAt: "asc" },
      take: 10,
      select: { id: true }
    });

    if (fcToFix.length > 0) {
      console.log(`[MAINTENANCE] Repairing ${fcToFix.length} Flashcard records...`);
      await withMaintenanceRetry(() =>
        prisma.flashcard.updateMany({
          where: { id: { in: fcToFix.map(c => c.id) } },
          data: { processingStatus: "CHECKED", status: "ACTIVE", activityState: "ACTIVE", kind: "SUMMARY" }
        })
      );
    }
  } catch (e) {
    console.warn(`[MAINTENANCE] Flashcard scrub partially failed: ${e.message}`);
  }

  // 2. NBA Items — fix invalid legacy statuses only.
  // NOTE: State transitions are now handled by the CandidateState lifecycle machine.
  //       Annotation-string inference has been removed. Never infer state from userAnnotation.
  try {
    const tcToFix = await prisma.checklistTask.findMany({
      where: {
        OR: [
          { processingStatus: { notIn: validProc } },
          { status: { notIn: ["PENDING", "DRAFT", "ACCEPTED", "DECLINED", "COMPLETED", "VERIFIED", "EXPIRED", "ARCHIVED", "CHECKED"] } }
        ]
      },
      orderBy: { updatedAt: "asc" },
      take: 100,
      select: { id: true }
    });

    if (tcToFix.length > 0) {
      console.log(`[MAINTENANCE] Repairing ${tcToFix.length} ChecklistTask records with invalid legacy status...`);
      await withMaintenanceRetry(() =>
        prisma.checklistTask.updateMany({
          where: { id: { in: tcToFix.map(c => c.id) } },
          data: { status: "PENDING", activityState: "ACTIVE", kind: "TASK" }
        })
      );
    }
  } catch (e) {
    console.warn(`[MAINTENANCE] Taskcard scrub partially failed: ${e.message}`);
  }

  console.log(`[MAINTENANCE] Scrub Complete.`);
}

/**
 * Reconcile human feedback into persisted card intelligence.
 *
 * Applies human outcomes to tasks, recalculates scores through the canonical
 * scorer, and propagates learning signals back into the supporting knowledge layer.
 */
async function processUserFeedback(prisma, company) {
  const cid = company.id;
  
  // 1. Find Unprocessed Feedback for this company
  const pendingFeedback = await prisma.feedback.findMany({
    where: { 
      checklistTask: { companyId: cid },
      processedByWorkerAt: null 
    },
    include: { checklistTask: true },
    orderBy: { createdAt: "asc" }
  });

  if (pendingFeedback.length === 0) return 0;

  console.log(`[BRAIN] ${company.name}: Processing ${pendingFeedback.length} user feedback signals...`);

  for (const f of pendingFeedback) {
    const item = f.checklistTask;
    const action = f.action; // ACCEPT, DECLINE, MODIFY_ACCEPT, DELIVER
    
    // Human outcomes adjust the task triplet before canonical rescoring.
    let newImpact = Math.max(1, Math.min(10, item.impact));
    let newConf = Math.max(1, Math.min(10, item.confidence));
    let newEase = Math.max(1, Math.min(10, item.ease));

    if (action === "ACCEPT") {
      newConf = Math.min(10, newConf + 1);
    } else if (action === "MODIFY_ACCEPT") {
      newImpact = Math.min(10, newImpact + 1);
      newConf = Math.min(10, newConf + 1);
      newEase = Math.min(10, newEase + 1);
    } else if (action === "DECLINE") {
      newImpact = 1;
      newConf = 1;
      newEase = 1;
    } else if (action === "DELIVER") {
      newImpact = 10;
      newConf = 10;
    }

    // b. Recalculate ICE through the canonical task-scoring contract
    const normalizedTaskScores = normalizeTaskScores({
      impact: newImpact,
      confidence: newConf,
      ease: newEase,
    });

    // c. Update NBA Item Intelligence
      await prisma.checklistTask.update({
      where: { id: item.id },
      data: {
        ...normalizedTaskScores,
        updatedAt: new Date(),
        lastRescoredAt: null,
      }
    });

    // Propagate learning back into the supporting knowledge cards.
    if (item.sourceFlashcardIds && item.sourceFlashcardIds.length > 0) {
      // Human declines reduce downstream trust; positive outcomes increase it.
      const delta = (action === "DECLINE")
        ? { confidence: -1, weight: -2 }
        : { confidence: 1, weight: 1 };

      for (const fcId of item.sourceFlashcardIds) {
        const fc = await prisma.flashcard.findUnique({ where: { id: fcId } });
        if (!fc) continue;

        // Ensure legacy numbers don't bypass bounds
        const currentConf = Math.max(1, Math.min(10, fc.confidence));
        const currentWeight = Math.max(1, Math.min(10, fc.weight));

        await prisma.flashcard.update({
          where: { id: fcId },
          data: {
            confidence: Math.max(1, Math.min(10, currentConf + delta.confidence)),
            confidenceScore: Math.max(1, Math.min(10, currentConf + delta.confidence)),
            weight: Math.max(1, Math.min(10, currentWeight + delta.weight)),
            iceScore: calculateKnowledgeIceScore({
              impact: fc.impact,
              confidence: Math.max(1, Math.min(10, currentConf + delta.confidence)),
              weight: Math.max(1, Math.min(10, currentWeight + delta.weight)),
            }),
            updatedAt: new Date(),
            lastCorrectionReconciledAt: null,
            lastRescoredAt: null,
          }
        });
      }
    }

    // e. Mark as Processed
    await prisma.feedback.update({
      where: { id: f.id },
      data: { 
        processedByWorkerAt: new Date(),
        iceImpact: (action === "DECLINE") ? -1 : 1 
      }
    });
  }

  // Frontier placement should reflect the freshly updated task intelligence.
  try {
    await recomputeFrontier(prisma, company);
  } catch (e) {
    console.warn(`[BRAIN] Frontier recompute after feedback failed: ${e.message}`);
  }

  return pendingFeedback.length;
}

async function rescorePeriodicCards(prisma, company) {
  const summary = await runPlannerMaintenanceCycle(prisma, company);
  return summary.totalRefreshed - summary.datacards;
}

async function rescorePeriodicUpstreamCards(prisma, company) {
  return refreshOldestDatacards(prisma, company);
}

async function backfillFlashcardCitationSnapshots(prisma, company) {
  const cid = company.id;
  const batchSize = await getWorkerConfig(prisma, company, "rescore_batch_size", 3);

  const flashcards = await prisma.flashcard.findMany({
    where: {
      companyId: cid,
      activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] },
      citationSnapshotIds: { isEmpty: true },
    },
    include: {
      sources: true,
    },
    orderBy: { updatedAt: "asc" },
    take: batchSize,
  });

  let updated = 0;
  for (const flashcard of flashcards) {
    const sourceIds = flashcard.sources
      .filter((source) => source.sourceType === "SOURCE")
      .map((source) => source.sourceId);
    if (sourceIds.length === 0) continue;

    const evidenceBatch = await prisma.source.findMany({
      where: {
        companyId: cid,
        id: { in: sourceIds },
      },
    });
    if (evidenceBatch.length === 0) continue;

    const snapshots = await ensureCitationSnapshotsForEvidenceBatch(prisma, evidenceBatch);
    const conflict = detectEvidenceConflict(evidenceBatch);

    await prisma.flashcard.update({
      where: { id: flashcard.id },
      data: {
        citationSnapshotIds: snapshots.map((snapshot) => snapshot.id),
        conflictDetected: conflict.detected,
        conflictSummary: conflict.summary,
      },
    });
    updated += 1;
  }

  if (updated > 0) {
    console.log(`[MAINTENANCE] ${company.name}: Backfilled citation snapshots on ${updated} flashcard(s).`);
  }

  return updated;
}

async function revisitOldestModifiedCandidates(prisma, company) {
  const cid = company.id;
  const batchSize = await getWorkerConfig(prisma, company, "maintenance_revisit_batch_size", 3);

  const candidates = await prisma.checklistTask.findMany({
    where: {
      companyId: cid,
      activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] },
      candidateState: { in: [CandidateState.GENERATED, CandidateState.REFINED, CandidateState.EVALUATED] },
      status: { notIn: ["ARCHIVED", "COMPLETED"] },
      OR: [
        { userAnnotation: { not: null } },
        {
          feedback: {
            some: {
              OR: [
                { annotation: { not: null } },
                { modifiedTitle: { not: null } },
                { modifiedDescription: { not: null } },
              ],
            },
          },
        },
      ],
    },
    include: {
      feedback: {
        orderBy: { createdAt: "desc" },
        take: 3,
      },
    },
    orderBy: { updatedAt: "asc" },
    take: batchSize * 4,
  });

  let queued = 0;
  for (const candidate of candidates) {
    if (queued >= batchSize) break;

    const latestFeedback = candidate.feedback[0] || null;
    const unresolved =
      Boolean(candidate.userAnnotation) ||
      Boolean(latestFeedback?.annotation) ||
      Boolean(latestFeedback?.modifiedTitle) ||
      Boolean(latestFeedback?.modifiedDescription);

    if (!unresolved) continue;

    await prisma.checklistTask.update({
      where: { id: candidate.id },
      data: {
        ...toRework(
          ReworkRoute.OLD_MODIFIED_UNRESOLVED,
          "MAINTENANCE: oldest modified candidate with unresolved human correction",
        ),
        processingStatus: "DRAFT",
        lastCorrectionReconciledAt: null,
        lastRescoredAt: null,
      },
    });
    queued += 1;
  }

  console.log(`[MAINTENANCE] ${company.name}: revisit_oldest_modified_candidates queued ${queued} item(s).`);
  return queued;
}

async function revisitDeclinedHighPotentialCandidates(prisma, company) {
  const cid = company.id;
  const batchSize = await getWorkerConfig(prisma, company, "maintenance_revisit_batch_size", 3);
  const hopelessThreshold = await getWorkerConfig(prisma, company, "maintenance_decline_hopeless_threshold", 3);
  const highPotentialIce = await getWorkerConfig(prisma, company, "maintenance_decline_high_potential_ice", 250);

  const candidates = await prisma.checklistTask.findMany({
    where: {
      companyId: cid,
      activityState: { in: ["ACTIVE", "STALE", "EXPIRED"] },
      status: { notIn: ["ARCHIVED", "COMPLETED"] },
      processingStatus: { in: ["DECLINED", "DRAFT", "CHECKED", "VERIFIED"] },
      feedbackScore: { lt: 0 },
      iceScore: { gte: highPotentialIce },
    },
    orderBy: { updatedAt: "asc" },
    take: batchSize * 6,
  });

  let queued = 0;
  for (const candidate of candidates) {
    if (queued >= batchSize) break;

    const declineEvents = await prisma.declineEvent.findMany({
      where: { companyId: cid, checklistTaskId: candidate.id },
      orderBy: { createdAt: "desc" },
      take: hopelessThreshold + 1,
    });
    if (declineEvents.length === 0) continue;

    const latestDecline = declineEvents[0];
    const unrecoverableClasses = new Set(["WRONG", "IRRELEVANT", "ALREADY_DONE", "IGNORANT_OUTPUT"]);
    if (unrecoverableClasses.has(String(latestDecline.declineClass))) {
      continue;
    }

    const latestMemory = await prisma.memoryEntry.findFirst({
      where: { companyId: cid, active: true },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    });

    const memoryChangedSinceDecline =
      latestMemory?.updatedAt && latestMemory.updatedAt > latestDecline.createdAt;
    const hopeless =
      declineEvents.length >= hopelessThreshold &&
      !memoryChangedSinceDecline;

    if (hopeless) {
      continue;
    }

    await prisma.checklistTask.update({
      where: { id: candidate.id },
      data: {
        ...toRework(
          ReworkRoute.DECLINE_INFORMED_REWORK,
          "MAINTENANCE: declined high-potential candidate recovered for another pass",
        ),
        processingStatus: "DRAFT",
        activityState: "ACTIVE",
        lastCorrectionReconciledAt: null,
        lastRescoredAt: null,
      },
    });
    queued += 1;
  }

  console.log(`[MAINTENANCE] ${company.name}: revisit_declined_high_potential_candidates queued ${queued} item(s).`);
  return queued;
}

// --- LIFECYCLE MANAGEMENT ---

/**
 * Scrub company rejection annotations for cosmetic consistency only.
 *
 * Lifecycle state changes are owned by the persisted state machine, not by
 * annotation-string inference.
 */
async function scrubCompanyRejections(prisma, cid) {
  // Stringification Cleanup (Fix [object Object]) — cosmetic only
  const objectObjectItems = await prisma.checklistTask.findMany({
    where: { companyId: cid, userAnnotation: { contains: "[object Object]" } },
    select: { id: true, userAnnotation: true }
  });

  for (const item of objectObjectItems) {
    const cleaned = item.userAnnotation.replace(/\[object Object\]/g, "(Structured reason data)");
    await prisma.checklistTask.update({
      where: { id: item.id },
      data: { userAnnotation: cleaned }
    });
  }
}

/**
 * Executes the ageing logic for a specific company's intelligence layer.
 * Transitions cards through ACTIVE -> EXPIRED -> STALE -> ARCHIVED states.
 * 
 * @param {PrismaClient} prisma - Database client
 * @param {object} company - Company database record
 */
async function runMaintenance(prisma, company) {
  const cid = company.id;
  const now = new Date();
  const normalizedAllowedLanguages = canonicalizeAllowedLanguages(company.allowedLanguages || []);

  if (JSON.stringify(normalizedAllowedLanguages) !== JSON.stringify(company.allowedLanguages || [])) {
    await prisma.company.update({
      where: { id: cid },
      data: { allowedLanguages: normalizedAllowedLanguages },
    });
    company.allowedLanguages = normalizedAllowedLanguages;
  }

  // Load Thresholds
  const expiryHours = await getWorkerConfig(prisma, company, "card_expiry_hours", 168);
  const staleDays = await getWorkerConfig(prisma, company, "stale_days", 30);
  const archiveDays = await getWorkerConfig(prisma, company, "archive_days", 90);

  const expiryThreshold = new Date(now.getTime() - expiryHours * 60 * 60 * 1000);
  const staleThreshold = new Date(now.getTime() - staleDays * 24 * 60 * 60 * 1000);
  const archiveThreshold = new Date(now.getTime() - archiveDays * 24 * 60 * 60 * 1000);

  console.log(`[MAINTENANCE] ${company.name}: Cleaning up aged cards...`);

  // 0. Brain Reconciliation (User Feedback)
  await processUserFeedback(prisma, company);

  // 0.25 Periodic rescoring across all active card layers with oldest-first queueing.
  await runPlannerMaintenanceCycle(prisma, company);
  await backfillFlashcardCitationSnapshots(prisma, company);

  // 0.5 Global inconsistency scrub
  await scrubCompanyRejections(prisma, cid);
  await revisitOldestModifiedCandidates(prisma, company);
  await revisitDeclinedHighPotentialCandidates(prisma, company);

  // 1. Flashcards Ageing
  // EXPIRED (7 days)
  await prisma.flashcard.updateMany({
    where: { companyId: cid, activityState: "ACTIVE", updatedAt: { lt: expiryThreshold } },
    data: { activityState: "EXPIRED" }
  });

  // STALE (30 days)
  await prisma.flashcard.updateMany({
    where: { companyId: cid, activityState: { in: ["ACTIVE", "EXPIRED"] }, updatedAt: { lt: staleThreshold } },
    data: { activityState: "STALE" }
  });

  // ARCHIVED (90 days)
  await prisma.flashcard.updateMany({
    where: { companyId: cid, activityState: { not: "ARCHIVED" }, updatedAt: { lt: archiveThreshold } },
    data: { activityState: "ARCHIVED" }
  });

  // 2. NBAItems Ageing
  await prisma.checklistTask.updateMany({
    where: { companyId: cid, activityState: "ACTIVE", updatedAt: { lt: expiryThreshold } },
    data: { activityState: "EXPIRED" }
  });

  await prisma.checklistTask.updateMany({
    where: { companyId: cid, activityState: { in: ["ACTIVE", "EXPIRED"] }, updatedAt: { lt: staleThreshold } },
    data: { activityState: "STALE" }
  });

  await prisma.checklistTask.updateMany({
    where: { companyId: cid, activityState: { not: "ARCHIVED" }, updatedAt: { lt: archiveThreshold } },
    data: { activityState: "ARCHIVED" }
  });
  
  // 3. Language cleanup
  const allCards = await Promise.all([
    prisma.flashcard.findMany({ where: { companyId: cid, activityState: { not: "ARCHIVED" } } }),
    prisma.checklistTask.findMany({ where: { companyId: cid, activityState: { not: "ARCHIVED" } } })
  ]);
  
  for (const fc of allCards[0]) await enforceLanguagePolicy(prisma, fc, "FLASHCARD", company);
  for (const tc of allCards[1]) await enforceLanguagePolicy(prisma, tc, "TASK", company);

  // 4. Source re-validation and strategy drift handling
  await revalidateSources(prisma, company);
  await detectStrategyDrift(prisma, company);
  await auditConfidenceCalibration(prisma, company);

  // 5. Enrichment, merging, and decay
  await mergeDuplicates(prisma, cid);
  await enrichOldestCards(prisma, company);
  await applyFreshnessDecay(prisma, company);

  // 6. Background maintenance jobs
  await compactStructuredMemory(prisma, company);
  await garbageCollectOrphanedSources(prisma, company);

  // 7. Frontier recompute
  // Recomputes the Top-3 visible items based on quality, urgency, and candidate state.
  await recomputeFrontier(prisma, company);
}

/**
 * Merges semantic duplicates within a company's card set.
 * Uses a similarity threshold of 0.8 to identify potential overlaps.
 */
async function mergeDuplicates(prisma, cid) {
  const threshold = 0.8;

  // Flashcard Merging
  const flashcards = await prisma.flashcard.findMany({
    where: { companyId: cid, activityState: "ACTIVE" },
    orderBy: { updatedAt: "desc" }
  });

  for (let i = 0; i < flashcards.length; i++) {
    for (let j = i + 1; j < flashcards.length; j++) {
      const f1 = flashcards[i];
      const f2 = flashcards[j];
      
      if (similarity(f1.title, f2.title) > threshold) {
        const oldest = new Date(f1.createdAt) < new Date(f2.createdAt) ? f1 : f2;
        const newest = oldest === f1 ? f2 : f1;

        console.log(`[MAINTENANCE] Semantic match: "${newest.title}" and "${oldest.title}". Keeping oldest ${oldest.id} with newest content, deleting ${newest.id}`);
        
        // Update oldest with newest content
        await prisma.flashcard.update({
          where: { id: oldest.id },
          data: {
            title: newest.title,
            body: newest.body,
            confidence: newest.confidence,
            confidenceScore: newest.confidenceScore,
            weight: newest.weight,
            kind: newest.kind,
            updatedAt: new Date()
          }
        });

        // Re-link sources (carefully avoid unique constraint violations)
        const sourcesToRelink = await prisma.flashcardSource.findMany({ where: { flashcardId: newest.id } });
        for (const s of sourcesToRelink) {
          try {
            await prisma.flashcardSource.update({
              where: { flashcardId_sourceType_sourceId: { flashcardId: newest.id, sourceType: s.sourceType, sourceId: s.sourceId } },
              data: { flashcardId: oldest.id }
            });
          } catch (err) {
            // If it fails (likely due to unique constraint), just delete the duplicate link
            await prisma.flashcardSource.delete({
              where: { flashcardId_sourceType_sourceId: { flashcardId: s.flashcardId, sourceType: s.sourceType, sourceId: s.sourceId } }
            });
          }
        }
        await prisma.flashcard.delete({ where: { id: newest.id } });
        
        const newestIndex = oldest === f1 ? j : i;
        flashcards.splice(newestIndex, 1);
        if (newestIndex === j) j--;
        else { i--; break; }
      }
    }
  }

  // ChecklistTask Merging
  const taskcards = await prisma.checklistTask.findMany({
    where: { companyId: cid, activityState: "ACTIVE" },
    orderBy: { updatedAt: "desc" }
  });

  for (let i = 0; i < taskcards.length; i++) {
    for (let j = i + 1; j < taskcards.length; j++) {
      const t1 = taskcards[i];
      const t2 = taskcards[j];
      
      if (similarity(t1.title, t2.title) > threshold) {
        const oldest = new Date(t1.createdAt) < new Date(t2.createdAt) ? t1 : t2;
        const newest = oldest === t1 ? t2 : t1;

        console.log(`[MAINTENANCE] Semantic match: "${newest.title}" and "${oldest.title}". Keeping oldest ${oldest.id} with newest content, deleting ${newest.id}`);
        
        await prisma.checklistTask.update({
          where: { id: oldest.id },
          data: {
            title: newest.title,
            description: newest.description,
            impact: newest.impact,
            confidence: newest.confidence,
            confidenceScore: newest.confidenceScore,
            ease: newest.ease,
            iceScore: newest.iceScore,
            updatedAt: new Date()
          }
        });

        await prisma.checklistTask.delete({ where: { id: newest.id } });
        
        const newestIndex = oldest === t1 ? j : i;
        taskcards.splice(newestIndex, 1);
        if (newestIndex === j) j--;
        else { i--; break; }
      }
    }
  }
}

/**
 * Resets verified cards that are old or have low confidence to trigger re-synthesis (enrichment).
 */
async function enrichOldestCards(prisma, company) {
  const cid = company.id;
  
  // 1. Check Thresholds
  const [sourceCount, fileCount, flashcardCount, activeTasksCount] = await Promise.all([
    prisma.source.count({ where: { companyId: cid } }),
    prisma.uploadedSourceFile.count({ where: { companyId: cid } }),
    prisma.flashcard.count({ where: { companyId: cid } }),
    prisma.checklistTask.count({
      where: {
        companyId: cid,
        processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED"] },
        activityState: { in: ["ACTIVE", "STALE"] }
      }
    })
  ]);

  const totalSources = sourceCount + fileCount;
  const flashcardRatio = totalSources > 0 ? flashcardCount / totalSources : 0;

  // Enrich Flashcards if ratio hit
  if (flashcardRatio >= 10) {
    const toEnrich = await prisma.flashcard.findMany({
      where: { companyId: cid, processingStatus: "VERIFIED", activityState: "ACTIVE" },
      orderBy: [ { confidenceScore: "asc" }, { updatedAt: "asc" } ],
      take: 2
    });
    
    for (const fc of toEnrich) {
      console.log(`[ENRICH] Recycling flashcard ${fc.id} for refinement...`);
      await reactivateCard(prisma, "Flashcard", fc.id);
    }
  }

  // Enrich Tasks if count hit
  if (activeTasksCount >= 50) {
     const toEnrich = await prisma.checklistTask.findMany({
      where: { companyId: cid, processingStatus: "VERIFIED", activityState: "ACTIVE" },
      orderBy: [ { iceScore: "asc" }, { updatedAt: "asc" } ],
      take: 2
    });
    
    for (const tc of toEnrich) {
      console.log(`[ENRICH] Recycling taskcard ${tc.id} for refinement...`);
      await reactivateCard(prisma, "ChecklistTask", tc.id);
    }
  }
}

/**
 * Forces a card back into the ACTIVE + DRAFT state for re-processing.
 * 
 * @param {PrismaClient} prisma - Database client
 * @param {string} cardType - "Flashcard" or "ChecklistTask"
 * @param {string} cardId - Unique card identifier
 */
async function reactivateCard(prisma, cardType, cardId) {
  const model = cardType === "Flashcard" ? prisma.flashcard : prisma.checklistTask;
  return await model.update({
    where: { id: cardId },
    data: {
      activityState: "ACTIVE",
      processingStatus: "DRAFT",
      updatedAt: new Date()
    }
  });
}

/**
 * Recycles cards that haven't been updated in 14 days back to DRAFT.
 */
async function applyFreshnessDecay(prisma, company) {
  const cid = company.id;
  const decayDays = await getWorkerConfig(prisma, company, "freshness_decay_days", 14);
  const decayThreshold = new Date(Date.now() - decayDays * 24 * 60 * 60 * 1000);

  console.log(`[MAINTENANCE] ${company.name}: Applying freshness decay (Threshold: ${decayDays} days)...`);

  // Flashcards
  const fcDecayed = await prisma.flashcard.updateMany({
    where: { 
      companyId: cid, 
      processingStatus: { in: ["VERIFIED", "ACCEPTED"] },
      activityState: "ACTIVE",
      updatedAt: { lt: decayThreshold }
    },
    data: { 
      processingStatus: "DRAFT",
      updatedAt: new Date(), // Reset to now so it doesn't decay again immediately
      userAnnotation: `[MAINTENANCE]: Recycled due to freshness decay (> ${decayDays} days).`
    }
  });

  // NBAItems
  const tcDecayed = await prisma.checklistTask.updateMany({
    where: { 
      companyId: cid, 
      processingStatus: { in: ["VERIFIED", "ACCEPTED"] },
      activityState: "ACTIVE",
      updatedAt: { lt: decayThreshold }
    },
    data: { 
      processingStatus: "DRAFT",
      updatedAt: new Date(),
      userAnnotation: `[MAINTENANCE]: Recycled due to freshness decay (> ${decayDays} days).`
    }
  });

  if (fcDecayed.count > 0 || tcDecayed.count > 0) {
    console.log(`[MAINTENANCE] ${company.name}: Recycled ${fcDecayed.count} Flashcards and ${tcDecayed.count} Taskcards.`);
  }
}

/**
 * Re-validate external sources for content drift.
 *
 * When source content changes materially, linked downstream cards are recycled
 * so the worker can refresh them from the new evidence.
 */
async function revalidateSources(prisma, company) {
  const cid = company.id;
  const revalidationDays = await getWorkerConfig(prisma, company, "source_revalidation_days", 14);
  const threshold = new Date(Date.now() - revalidationDays * 24 * 60 * 60 * 1000);

  const agedSources = await prisma.source.findMany({
    where: { 
      companyId: cid, 
      updatedAt: { lt: threshold },
      content: { contains: "http" }
    },
    take: 5 // Rate limited to prevent local network saturating
  });

  if (agedSources.length === 0) return;

  console.log(`[MAINTENANCE] ${company.name}: Re-validating ${agedSources.length} aged sources...`);

  for (const s of agedSources) {
    // Extract URL
    const urlMatch = s.content.match(/https?:\/\/[^\s]+/);
    if (!urlMatch) continue;
    const url = urlMatch[0];

    try {
      const { content } = await fetchUrlContent(url);
      const oldHash = s.metadata?.contentHash || hashValue(s.content);
      const newHash = hashValue(content);

      if (oldHash !== newHash) {
        console.log(`[SOURCE DRIFT] ${s.id}: Content changed. Updating source and recycling cards.`);
        await prisma.source.update({
          where: { id: s.id },
          data: { 
            content: `${url}\n\n${content}`,
            ...buildSourceLifecycleData({
              ...s,
              content: `${url}\n\n${content}`,
              metadata: { ...(s.metadata || {}), contentHash: newHash, lastCheckedAt: new Date().toISOString() },
            }),
            updatedAt: new Date(),
            metadata: { ...(s.metadata || {}), contentHash: newHash, lastCheckedAt: new Date().toISOString() }
          }
        });

        // Recycle linked flashcards
        const linkedFc = await prisma.flashcardSource.findMany({ where: { sourceType: "SOURCE", sourceId: s.id } });
        for (const link of linkedFc) {
          await reactivateCard(prisma, "Flashcard", link.flashcardId);
          await prisma.flashcard.update({
            where: { id: link.flashcardId },
            data: { userAnnotation: `[MAINTENANCE]: Recycled due to source content drift (#92).` }
          });
        }
      } else {
        // Just touch the source to reset revalidation timer
        await prisma.source.update({
          where: { id: s.id },
          data: {
            updatedAt: new Date(),
            metadata: { ...(s.metadata || {}), lastCheckedAt: new Date().toISOString() },
            processingStatus: deriveSourceProcessingStatus(s),
          }
        });
      }
    } catch (err) {
      console.warn(`[SOURCE RE-VALIDATION] Failed for ${url}: ${err.message}`);
    }
  }
}

/**
 * Detect strategy drift between cards and their linked topics.
 */
async function detectStrategyDrift(prisma, company) {
  const cid = company.id;
  
  // 1. Flashcards
  const activeFc = await prisma.flashcard.findMany({
    where: { companyId: cid, processingStatus: "VERIFIED", activityState: "ACTIVE" },
    select: { id: true, userAnnotation: true, updatedAt: true }
  });

  for (const fc of activeFc) {
    const topicIdMatch = fc.userAnnotation?.match(/\[TOPIC_ID:([a-f0-9-]+)\]/);
    if (!topicIdMatch) continue;
    const topicId = topicIdMatch[1];

    const topic = await prisma.topic.findUnique({ where: { id: topicId } });
    if (topic && topic.updatedAt > fc.updatedAt) {
      console.log(`[STRATEGY DRIFT] fc:${fc.id}: Topic [${topic.label}] was updated. Recycling card for re-alignment.`);
      await reactivateCard(prisma, "Flashcard", fc.id);
      await prisma.flashcard.update({
        where: { id: fc.id },
        data: { userAnnotation: `${fc.userAnnotation} [MAINTENANCE]: Recycled due to strategy drift (Topic update).`.trim() }
      });
    }
  }

  // 2. Taskcards
  const activeTc = await prisma.checklistTask.findMany({
    where: { companyId: cid, processingStatus: "VERIFIED", activityState: "ACTIVE" },
    select: { id: true, userAnnotation: true, updatedAt: true }
  });

  for (const tc of activeTc) {
    const topicIdMatch = tc.userAnnotation?.match(/\[TOPIC_ID:([a-f0-9-]+)\]/);
    if (!topicIdMatch) continue;
    const topicId = topicIdMatch[1];

    const topic = await prisma.topic.findUnique({ where: { id: topicId } });
    if (topic && topic.updatedAt > tc.updatedAt) {
      console.log(`[STRATEGY DRIFT] tc:${tc.id}: Topic [${topic.label}] was updated. Recycling card for re-alignment.`);
      await reactivateCard(prisma, "ChecklistTask", tc.id);
      await prisma.checklistTask.update({
        where: { id: tc.id },
        data: { userAnnotation: `${tc.userAnnotation} [MAINTENANCE]: Recycled due to strategy drift (Topic update).`.trim() }
      });
    }
  }
}

/**
 * Audit confidence calibration against recent human rejection signals.
 */
async function auditConfidenceCalibration(prisma, company) {
  const cid = company.id;
  const metricsPath = path.join(__dirname, "..", "knowledge", "runtime-metrics.ndjson");

  // Find recent user rejections (DECLINE/REJECT) on cards that were previously high-confidence
  const rejections = await prisma.flashcardAction.findMany({
    where: { 
      flashcard: { companyId: cid },
      action: { in: ["DECLINE", "REJECT"] },
      createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24h
    },
    include: { flashcard: true }
  });

  if (rejections.length === 0) return;

  let totalDrift = 0;
  const report = {
    type: "confidence-calibration-report",
    company: company.name,
    timestamp: new Date().toISOString(),
    samples: rejections.length,
    events: []
  };

  for (const r of rejections) {
    const fc = r.flashcard;
    // We look for Judge Approval in the annotation to get the original audit score
    const approvalMatch = fc.userAnnotation?.match(/\[JUDGE APPROVED\]: Score (\d+)\/10/);
    const judgeScore = approvalMatch ? parseInt(approvalMatch[1], 10) : fc.confidenceScore;
    
    // In our system, a user rejection implies a "True Score" of 0 or 1.
    const drift = judgeScore - 1; 
    totalDrift += drift;

    report.events.push({
      cardId: fc.id,
      judgeScore,
      userAction: r.action,
      drift
    });
  }

  report.averageDrift = totalDrift / rejections.length;

  console.log(`[CALIBRATION] ${company.name}: Avg Drift is ${report.averageDrift.toFixed(2)}. (Higher = Over-confident Judge)`);

  try {
    fs.appendFileSync(metricsPath, JSON.stringify(report) + "\n");
  } catch (err) {
    console.warn(`[CALIBRATION] Failed to write metrics: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// M4.2: Trinity Background Jobs
// ---------------------------------------------------------------------------

/**
 * Compacts the structured memory layer to prevent context window bloat.
 * Prunes old, low-weight SOFT_PREFERENCE and ANTI_PATTERN lessons.
 */
async function compactStructuredMemory(prisma, company) {
  const cid = company.id;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const pruned = await prisma.memoryEntry.updateMany({
    where: {
      companyId: cid,
      active: true,
      lessonType: { in: ["SOFT_PREFERENCE", "ANTI_PATTERN"] },
      weight: { lt: 1.2 },
      createdAt: { lt: thirtyDaysAgo },
    },
    data: { active: false },
  });

  if (pruned.count > 0) {
    console.log(`[MAINTENANCE] ${company.name}: Compacted ${pruned.count} obsolete memory entries.`);
  }
}

/**
 * Garbage collects old Source records that have exhausted their freshness window
 * and have no surviving active Flashcards linked to them.
 */
async function garbageCollectOrphanedSources(prisma, company) {
  const cid = company.id;
  
  // Find sources older than 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  const oldSources = await prisma.source.findMany({
    where: {
      companyId: cid,
      createdAt: { lt: thirtyDaysAgo },
    },
  });

  const sourceIds = oldSources.map((source) => source.id);
  const flashcardLinks = sourceIds.length > 0
    ? await prisma.flashcardSource.findMany({
        where: {
          sourceType: "SOURCE",
          sourceId: { in: sourceIds },
        },
        include: {
          flashcard: true,
        },
      })
    : [];

  const flashcardLinksBySourceId = new Map();
  for (const link of flashcardLinks) {
    const existing = flashcardLinksBySourceId.get(link.sourceId) || [];
    existing.push(link);
    flashcardLinksBySourceId.set(link.sourceId, existing);
  }

  let deleted = 0;
  for (const source of oldSources) {
    // If a source has its own freshnessWindowDays, use it
    const window = source.freshnessWindowDays || 30;
    const expiryDate = new Date(source.createdAt.getTime() + window * 24 * 60 * 60 * 1000);
    
    if (new Date() < expiryDate) continue;

    // Check if any linked flashcards are still active
    const sourceLinks = flashcardLinksBySourceId.get(source.id) || [];
    const hasActiveCards = sourceLinks.some(fs => 
      fs.flashcard && ["ACTIVE", "STALE"].includes(fs.flashcard.activityState)
    );

    if (!hasActiveCards) {
      // Orphaned and expired -> delete to allow fresh ingestion if found again
      await prisma.$transaction(async (tx) => {
        await tx.flashcardSource.deleteMany({ where: { sourceId: source.id } });
        await tx.source.delete({ where: { id: source.id } });
      });
      deleted++;
    }
  }

  if (deleted > 0) {
    console.log(`[MAINTENANCE] ${company.name}: Garbage collected ${deleted} orphaned/expired sources.`);
  }
}

module.exports = {
  runMaintenance,
  reactivateCard,
  scrubDatabaseElemental,
  processUserFeedback,
  rescorePeriodicCards,
  rescorePeriodicUpstreamCards,
  backfillFlashcardCitationSnapshots,
  revisitOldestModifiedCandidates,
  revisitDeclinedHighPotentialCandidates,
  scrubCompanyRejections,
  mergeDuplicates,
  enrichOldestCards,
  applyFreshnessDecay,
  revalidateSources,
  detectStrategyDrift,
  auditConfidenceCalibration,
  refillChecklistFromBacklog: frontierRefill, // M3.1: now delegates to frontier.js
  compactStructuredMemory,
  garbageCollectOrphanedSources,
};
