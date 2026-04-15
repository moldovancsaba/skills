const { getWorkerConfig } = require("./shared");

/**
 * SOVEREIGN MAINTENANCE ENGINE
 * v0.11.4-STABLE
 * 
 * Manages the lifecycle and state-integrity of Flashcards and Taskcards.
 * Implements the 7/30/90 rule for card ageing and performs global data consistency scrubs.
 */
// --- DATA INTEGRITY ---

/**
 * Performs a global audit of all cards to ensure status and kind alignment.
 * Fixes legacy status strings and enforces the Sovereign Kind Registry.
 * 
 * @param {PrismaClient} prisma - Database client
 */
async function scrubDatabase(prisma) {
  console.log(`[MAINTENANCE] Starting Global Data Integrity Scrub...`);
  
  const validKinds = ["SUMMARY", "EXPLANATION", "COMPARISON", "NEWS", "CONCLUSION", "EVALUATION", "OPINION", "JUDGMENT", "RECOMMENDATION", "RESEARCH", "FORECAST", "STOCK", "GOSSIP", "PRICE"];
  const validProc = ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED", "DECLINED"];

  // 1. Flashcards (Batch Scrub)
  try {
    const fcToFix = await prisma.flashcard.findMany({
      where: {
        OR: [
          { processingStatus: { notIn: validProc } },
          { status: { not: "ACTIVE" } },
          { kind: { notIn: validKinds } }
        ]
      },
      take: 500,
      select: { id: true }
    });

    if (fcToFix.length > 0) {
      console.log(`[MAINTENANCE] Repairing ${fcToFix.length} Flashcard records...`);
      await prisma.flashcard.updateMany({
        where: { id: { in: fcToFix.map(c => c.id) } },
        data: { processingStatus: "CHECKED", status: "ACTIVE", activityState: "ACTIVE", kind: "SUMMARY" }
      });
    }

    // Specialized Logic: Rejection Scrub
    await prisma.flashcard.updateMany({
      where: { 
        userAnnotation: { contains: "[JUDGE REJECTION]" },
        activityState: { not: "ARCHIVED" }
      },
      data: { 
        processingStatus: "DRAFT",
        status: "DRAFT",
        activityState: "ARCHIVED"
      }
    });
  } catch (e) {
    console.warn(`[MAINTENANCE] Flashcard scrub partially failed: ${e.message}`);
  }

  // 2. NBA Items (Batch Scrub)
  try {
    const tcToFix = await prisma.nBAItem.findMany({
      where: {
        OR: [
          { processingStatus: { notIn: validProc } },
          { status: { not: "PENDING" } }
        ]
      },
      take: 500,
      select: { id: true }
    });

    if (tcToFix.length > 0) {
      console.log(`[MAINTENANCE] Repairing ${tcToFix.length} NBAItem records...`);
      await prisma.nBAItem.updateMany({
        where: { id: { in: tcToFix.map(c => c.id) } },
        data: { processingStatus: "CHECKED", status: "PENDING", activityState: "ACTIVE", kind: "TASK" }
      });
    }

    // Specialized Logic: Rejection Scrub & Inconsistency Reset
    await prisma.nBAItem.updateMany({
      where: { 
        OR: [
          { userAnnotation: { contains: "[JUDGE REJECTION]" } },
          { userAnnotation: { contains: "[WRITER]:" } }
        ],
        activityState: { not: "ARCHIVED" }
      },
      data: { 
        processingStatus: "DRAFT",
        status: "DRAFT",
        activityState: "ARCHIVED"
      }
    });
  } catch (e) {
    console.warn(`[MAINTENANCE] Taskcard scrub partially failed: ${e.message}`);
  }

  console.log(`[MAINTENANCE] Scrub Complete.`);
}

/**
 * RECONCILE USER FEEDBACK (The Offline Brain)
 * v0.11.5
 * 
 * Processes raw feedback signals collected online.
 * Performs ICE recalculations and propagates strategic feedback to the Flashcard layer.
 */
async function processUserFeedback(prisma, company) {
  const cid = company.id;
  
  // 1. Find Unprocessed Feedback for this company
  const pendingFeedback = await prisma.feedback.findMany({
    where: { 
      nbaItem: { companyId: cid },
      processedByWorkerAt: null 
    },
    include: { nbaItem: true },
    orderBy: { createdAt: "asc" }
  });

  if (pendingFeedback.length === 0) return 0;

  console.log(`[BRAIN] ${company.name}: Processing ${pendingFeedback.length} user feedback signals...`);

  for (const f of pendingFeedback) {
    const item = f.nbaItem;
    const action = f.action; // ACCEPT, DECLINE, MODIFY_ACCEPT
    
    // a. Determine Intelligence Impact
    let iceImpact = 0;
    if (action === "ACCEPT") iceImpact = 10;
    else if (action === "MODIFY_ACCEPT") iceImpact = 15;
    else if (action === "DECLINE") iceImpact = -50;

    // b. Recalculate ICE Score Locally
    const impact = Math.max(0, Math.min(10, item.impact));
    const confidence = Math.max(0, Math.min(100, item.confidence));
    const ease = Math.max(0, Math.min(10, item.ease));
    const baseScore = impact * (confidence / 10) * ease;
    const newScore = baseScore * (1 + iceImpact / 100);

    // c. Update NBA Item Intelligence
    await prisma.nBAItem.update({
      where: { id: item.id },
      data: {
        iceScore: Math.max(0, Math.min(1000, Math.round(newScore * 10) / 10)),
        updatedAt: new Date()
      }
    });

    // d. Propagate to Knowledge Layer (Flashcards)
    if (item.sourceFlashcardIds && item.sourceFlashcardIds.length > 0) {
      const delta = (action === "DECLINE")
        ? { confidence: -22, weight: -18 }
        : { confidence: 8, weight: 10 };

      for (const fcId of item.sourceFlashcardIds) {
        const fc = await prisma.flashcard.findUnique({ where: { id: fcId } });
        if (!fc) continue;

        await prisma.flashcard.update({
          where: { id: fcId },
          data: {
            feedbackConfidenceDelta: Math.max(-50, Math.min(50, fc.feedbackConfidenceDelta + delta.confidence)),
            feedbackWeightDelta: Math.max(-50, Math.min(50, fc.feedbackWeightDelta + delta.weight)),
            confidence: Math.max(1, Math.min(100, fc.confidence + delta.confidence)),
            weight: Math.max(1, Math.min(100, fc.weight + delta.weight)),
            updatedAt: new Date()
          }
        });
      }
    }

    // e. Mark as Processed
    await prisma.feedback.update({
      where: { id: f.id },
      data: { 
        processedByWorkerAt: new Date(),
        iceImpact: iceImpact 
      }
    });
  }

  return pendingFeedback.length;
}

// --- LIFECYCLE MANAGEMENT ---

/**
 * SCRUB COMPANY REJECTIONS
 * v0.11.5
 * 
 * Specifically targets and corrects cards that were rejected by the judge but
 * remain in an inconsistent processingStatus (e.g. VERIFIED).
 * Also cleans up [object Object] anomalies in annotations.
 */
async function scrubCompanyRejections(prisma, cid) {
  // 1. Flashcards Scrub
  await prisma.flashcard.updateMany({
    where: { 
      companyId: cid,
      OR: [
        { userAnnotation: { contains: "[JUDGE REJECTION]" } },
        { userAnnotation: { contains: "[WRITER]:" } }
      ],
      activityState: { not: "ARCHIVED" }
    },
    data: { 
      processingStatus: "DRAFT",
      status: "ACTIVE",
      activityState: "ARCHIVED" // Hide from active lists
    }
  });

  // 2. NBA Item Scrub (The "ICE 1 Fix")
  await prisma.nBAItem.updateMany({
    where: { 
      companyId: cid,
      OR: [
        { userAnnotation: { contains: "[JUDGE REJECTION]" } },
        { userAnnotation: { contains: "[WRITER]:" } }
      ],
      activityState: { not: "ARCHIVED" }
    },
    data: { 
      processingStatus: "DRAFT",
      status: "PENDING",
      activityState: "ARCHIVED" // Hide from active lists
    }
  });

  // 3. Stringification Cleanup (Fix [object Object])
  // This is more complex for updateMany, but we can target the common pattern.
  const objectObjectItems = await prisma.nBAItem.findMany({
    where: { companyId: cid, userAnnotation: { contains: "[object Object]" } },
    select: { id: true, userAnnotation: true }
  });

  for (const item of objectObjectItems) {
    const cleaned = item.userAnnotation.replace(/\[object Object\]/g, "(Structured reason data)");
    await prisma.nBAItem.update({
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

  // 0.5 Global Inconsistency Scrub (v0.11.5 Harden)
  await scrubCompanyRejections(prisma, cid);

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
  await prisma.nBAItem.updateMany({
    where: { companyId: cid, activityState: "ACTIVE", updatedAt: { lt: expiryThreshold } },
    data: { activityState: "EXPIRED" }
  });

  await prisma.nBAItem.updateMany({
    where: { companyId: cid, activityState: { in: ["ACTIVE", "EXPIRED"] }, updatedAt: { lt: staleThreshold } },
    data: { activityState: "STALE" }
  });

  await prisma.nBAItem.updateMany({
    where: { companyId: cid, activityState: { not: "ARCHIVED" }, updatedAt: { lt: archiveThreshold } },
    data: { activityState: "ARCHIVED" }
  });
}

/**
 * Forces a card back into the ACTIVE + DRAFT state for re-processing.
 * 
 * @param {PrismaClient} prisma - Database client
 * @param {string} cardType - "Flashcard" or "NBAItem"
 * @param {string} cardId - Unique card identifier
 */
async function reactivateCard(prisma, cardType, cardId) {
  const model = cardType === "Flashcard" ? prisma.flashcard : prisma.nBAItem;
  return await model.update({
    where: { id: cardId },
    data: {
      activityState: "ACTIVE",
      processingStatus: "DRAFT",
      updatedAt: new Date()
    }
  });
}

module.exports = {
  runMaintenance,
  reactivateCard,
  scrubDatabase,
  processUserFeedback,
  scrubCompanyRejections
};
