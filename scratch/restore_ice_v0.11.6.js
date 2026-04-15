const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * Restoration Script v0.11.6
 * Fixes the "ICE 1" cratering issue.
 */
async function main() {
  console.log("Starting v0.11.6 ICE Score Restoration...");

  // 1. Find all items with iceScore: 1
  const items = await prisma.nBAItem.findMany({
    where: { iceScore: 1 }
  });

  console.log(`Found ${items.length} items with 'ICE 1'. Restoring scores and archiving rejections...`);

  for (const item of items) {
    // a. Check if it's a rejection/duplicate
    const isRejection = item.userAnnotation?.includes("[JUDGE REJECTION]") || 
                        item.userAnnotation?.includes("[WRITER]:");

    // b. Restore neutral values before recalculating (if they were cratered to 1)
    let impact = item.impact;
    let confidence = item.confidenceScore;
    let ease = item.ease;

    if (isRejection) {
       // Only restore if they were actually cratered to 1. 
       // If they really were 1 naturally, we keep them.
       // But usually, humans or AI draft with 5.
       if (impact === 1) impact = 5;
       if (confidence === 1) confidence = 50;
       if (ease === 1) ease = 5;
    }

    // c. Calculate real ICE
    const newIce = impact * (confidence / 10) * ease;
    
    // d. Update record
    await prisma.nBAItem.update({
      where: { id: item.id },
      data: {
        impact,
        confidenceScore: confidence,
        ease,
        iceScore: Math.round(newIce * 10) / 10,
        activityState: isRejection ? "ARCHIVED" : item.activityState,
        updatedAt: new Date()
      }
    });
  }

  // 2. Flashcards (just archiving rejections)
  const fcItems = await prisma.flashcard.findMany({
    where: {
      OR: [
        { userAnnotation: { contains: "[JUDGE REJECTION]" } },
        { userAnnotation: { contains: "[WRITER]:" } }
      ],
      activityState: { not: "ARCHIVED" }
    }
  });

  console.log(`Found ${fcItems.length} inconsistent flashcards. Archiving...`);

  for (const fc of fcItems) {
    await prisma.flashcard.update({
      where: { id: fc.id },
      data: {
        activityState: "ARCHIVED",
        updatedAt: new Date()
      }
    });
  }

  console.log("Restoration Complete.");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
