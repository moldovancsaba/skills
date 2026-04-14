const { getWorkerConfig } = require("./shared");

/**
 * Maintenance Engine for Card Ageing and Expiration.
 * Implements the 7/30/90 rule and critical data integrity scrubs.
 */
async function scrubDatabase(prisma) {
  console.log(`[MAINTENANCE] Starting Global Data Integrity Scrub...`);
  
  // 1. Flashcards Scrub (v0.11.0 Hardening + v0.10.x Production Compatibility)
  const allFlash = await prisma.flashcard.findMany();
  const validKinds = ["SUMMARY", "EXPLANATION", "COMPARISON", "NEWS", "CONCLUSION", "EVALUATION", "OPINION", "JUDGMENT", "RECOMMENDATION", "RESEARCH", "FORECAST", "STOCK", "GOSSIP", "PRICE"];
  
  for (const card of allFlash) {
    const needsStatusFix = !card.processingStatus || !card.activityState || card.status === "CHECKED";
    const needsKindFix = !validKinds.includes(card.kind);

    if (needsStatusFix || needsKindFix) {
      await prisma.flashcard.update({
        where: { id: card.id },
        data: { 
          processingStatus: card.processingStatus || "CHECKED", 
          activityState: card.activityState || "ACTIVE",
          // Legacy Compatibility: v0.10.x webapp doesn't support CHECKED/VERIFIED in FlashcardStatus
          status: "ACTIVE",
          // Legacy Compatibility: v0.10.x webapp crashing on dynamic AI-generated kinds
          kind: validKinds.includes(card.kind) ? card.kind : "SUMMARY"
        }
      });
    }

    // 1.1 Rejection Scrub: Force scores to 1 for rejected cards
    if (card.userAnnotation?.includes("[JUDGE REJECTION]")) {
      await prisma.flashcard.update({
        where: { id: card.id },
        data: { confidenceScore: 1, impact: 1, weight: 1 }
      });
    }
  }
  
  // 2. NBA Scrub (v0.11.0 Hardening + v0.10.x Production Compatibility)
  const allNBA = await prisma.nBAItem.findMany();
  for (const task of allNBA) {
    const isStandardKind = ["TASK", "CHECKLIST"].includes(task.kind);
    const needsStatusFix = !task.processingStatus || !task.activityState || task.status === "CHECKED";
    const needsKindFix = !isStandardKind;

    if (needsStatusFix || needsKindFix) {
      await prisma.nBAItem.update({
        where: { id: task.id },
        data: {
          processingStatus: task.processingStatus || "CHECKED",
          activityState: task.activityState || "ACTIVE",
          // Legacy Compatibility: v0.10.x webapp doesn't support CHECKED in NBAStatus
          status: "PENDING",
          // Legacy Compatibility: v0.10.x webapp crashing on dynamic AI-generated kinds
          kind: isStandardKind ? task.kind : "TASK"
        }
      });
    }

    // 2.1 Rejection Scrub: Force scores to 1 for rejected tasks
    if (task.userAnnotation?.includes("[JUDGE REJECTION]")) {
      await prisma.nBAItem.update({
        where: { id: task.id },
        data: { confidenceScore: 1, impact: 1, ease: 1, iceScore: 1 }
      });
    }
  }

  console.log(`[MAINTENANCE] Scrub Complete.`);
}

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
 * Reactivation Rule: Reset to ACTIVE + DRAFT
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
  scrubDatabase
};
