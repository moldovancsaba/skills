const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("--- Starting Database State Reconciliation ---");

  // Scrub Flashcards
  console.log("Scrubbing Flashcards...");
  const flashcards = await prisma.flashcard.findMany();
  let fcUpdated = 0;
  for (const fc of flashcards) {
    const update = {};
    if (!fc.processingStatus) update.processingStatus = "CHECKED";
    if (!fc.activityState) update.activityState = "ACTIVE";
    
    // Compatibility status fields for downstream readers that still consume this historical column name.
    // FlashcardReviewStatus compatibility values: PENDING, ACCEPTED, DECLINED, MODIFIED_ACCEPTED
    if (!fc.reviewStatus) update.reviewStatus = "PENDING";
    // FlashcardStatus compatibility values kept for the compatibility column.
    if (!fc.status || fc.status === "DRAFT") update.status = "CHECKED";
    
    if (Object.keys(update).length > 0) {
      console.log(`Updating Flashcard ${fc.id}...`);
      await prisma.flashcard.update({ where: { id: fc.id }, data: update });
      fcUpdated++;
    }
  }
  console.log(`Updated ${fcUpdated} Flashcards.`);

  // Scrub Tasks (ChecklistTask)
  console.log("Scrubbing Tasks...");
  const tasks = await prisma.checklistTask.findMany();
  let tcUpdated = 0;
  for (const tc of tasks) {
    const update = {};
    if (!tc.processingStatus) update.processingStatus = "CHECKED";
    if (!tc.activityState) update.activityState = "ACTIVE";
    
    // Compatibility status fields for downstream readers that still consume this historical column.
    // Task status compatibility values: DRAFT, CHECKED, VERIFIED, EXPIRED, PENDING, ACCEPTED, DECLINED, COMPLETED, ARCHIVED
    if (!tc.status || tc.status === "PENDING" || tc.status === "DRAFT") update.status = "CHECKED";

    if (Object.keys(update).length > 0) {
      console.log(`Updating Task ${tc.id}...`);
      await prisma.checklistTask.update({ where: { id: tc.id }, data: update });
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
