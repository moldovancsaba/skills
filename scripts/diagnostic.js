const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("--- Database Audit ---");
  
  const total = await prisma.flashcard.count();
  console.log(`Total Flashcards: ${total}`);

  // Check New Statuses
  const byProcStatus = await prisma.flashcard.groupBy({
    by: ['processingStatus'],
    _count: true
  });
  console.log("By processingStatus (New):", byProcStatus);

  const byActivity = await prisma.flashcard.groupBy({
    by: ['activityState'],
    _count: true
  });
  console.log("By activityState (New):", byActivity);

  // Check Legacy Field (if it still exists in the DB, though maybe not in Prisma)
  try {
    const raw = await prisma.flashcard.findFirst();
    console.log("Sample Data:", JSON.stringify(raw, null, 2));
  } catch (e) {}

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
