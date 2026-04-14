const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("--- Starting Database State Reconciliation ---");

  // 1. Scrub Flashcards
  console.log("Scrubbing Flashcards...");
  const flashcards = await prisma.flashcard.findMany();
  let fcUpdated = 0;
  for (const fc of flashcards) {
    const update = {};
    if (!fc.processingStatus) update.processingStatus = "CHECKED";
    if (!fc.activityState) update.activityState = "ACTIVE";
    
    // Legacy Sync for Production Web App
    // FlashcardReviewStatus: PENDING, ACCEPTED, DECLINED, MODIFIED_ACCEPTED
    if (!fc.reviewStatus) update.reviewStatus = "PENDING";
    // FlashcardStatus (legacy status field): DRAFT, CHECKED, VERIFIED, etc.
    if (!fc.status || fc.status === "DRAFT") update.status = "CHECKED";
    
    if (Object.keys(update).length > 0) {
      console.log(`Updating Flashcard ${fc.id}...`);
      await prisma.flashcard.update({ where: { id: fc.id }, data: update });
      fcUpdated++;
    }
  }
  console.log(`Updated ${fcUpdated} Flashcards.`);

  // 2. Scrub Tasks (NBAItem)
  console.log("Scrubbing Tasks...");
  const tasks = await prisma.nBAItem.findMany();
  let tcUpdated = 0;
  for (const tc of tasks) {
    const update = {};
    if (!tc.processingStatus) update.processingStatus = "CHECKED";
    if (!tc.activityState) update.activityState = "ACTIVE";
    
    // Legacy Sync for Production Web App
    // NBAStatus: DRAFT, CHECKED, VERIFIED, EXPIRED, PENDING, ACCEPTED, DECLINED, COMPLETED, ARCHIVED
    if (!tc.status || tc.status === "PENDING" || tc.status === "DRAFT") update.status = "CHECKED";

    if (Object.keys(update).length > 0) {
      console.log(`Updating Task ${tc.id}...`);
      await prisma.nBAItem.update({ where: { id: tc.id }, data: update });
      tcUpdated++;
    }
  }
  console.log(`Updated ${tcUpdated} Tasks.`);

  console.log("--- Reconciliation Complete ---");
  await prisma.$disconnect();
}

main().catch(err => {
  console.error("Critical Failure:", err);
  process.exit(1);
});
