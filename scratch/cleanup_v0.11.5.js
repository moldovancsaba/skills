const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * Cleanup Script v0.11.5
 * Fixes "VERIFIED Rejections" and [object Object] anomalies.
 */
async function main() {
  console.log("Starting v0.11.5 Global Integrity Cleanup...");

  // 1. Correct Task State Inconsistencies
  const tasksToFix = await prisma.nBAItem.findMany({
    where: {
      userAnnotation: { contains: "[JUDGE REJECTION]" },
      processingStatus: { not: "DRAFT" }
    }
  });

  console.log(`Found ${tasksToFix.length} tasks with inconsistent 'VERIFIED' status. Resetting to DRAFT...`);

  for (const item of tasksToFix) {
    await prisma.nBAItem.update({
      where: { id: item.id },
      data: {
        processingStatus: "DRAFT",
        status: "PENDING",
        confidence: 1,
        impact: 1,
        ease: 1,
        iceScore: 1,
        updatedAt: new Date()
      }
    });
  }

  // 2. Fix [object Object] in userAnnotation
  const objectAnomalyItems = await prisma.nBAItem.findMany({
    where: { userAnnotation: { contains: "[object Object]" } }
  });

  console.log(`Found ${objectAnomalyItems.length} tasks with [object Object] bugs. Cleaning...`);

  for (const item of objectAnomalyItems) {
    const cleaned = item.userAnnotation.replace(/\[object Object\]/g, "(Detailed requirements data)");
    await prisma.nBAItem.update({
      where: { id: item.id },
      data: { userAnnotation: cleaned }
    });
  }

  // 3. Flashcard consistency check
  const fcToFix = await prisma.flashcard.findMany({
    where: {
      userAnnotation: { contains: "[JUDGE REJECTION]" },
      processingStatus: { not: "DRAFT" }
    }
  });

  console.log(`Found ${fcToFix.length} flashcards with inconsistent status. Resetting to DRAFT...`);

  for (const fc of fcToFix) {
    await prisma.flashcard.update({
      where: { id: fc.id },
      data: {
        processingStatus: "DRAFT",
        status: "ACTIVE",
        confidence: 1,
        impact: 1,
        weight: 1,
        updatedAt: new Date()
      }
    });
  }

  console.log("Cleanup Complete.");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
