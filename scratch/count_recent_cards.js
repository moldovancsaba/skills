const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  
  const flashcardNew = await prisma.flashcard.count({
    where: { createdAt: { gte: oneHourAgo } }
  });

  const flashcardUpdated = await prisma.flashcard.count({
    where: { updatedAt: { gte: oneHourAgo } }
  });

  const nbaItemNew = await prisma.nBAItem.count({
    where: { createdAt: { gte: oneHourAgo } }
  });

  const nbaItemUpdated = await prisma.nBAItem.count({
    where: { updatedAt: { gte: oneHourAgo } }
  });

  console.log(JSON.stringify({
    since: oneHourAgo.toISOString(),
    flashcards: { new: flashcardNew, updated: flashcardUpdated },
    nbaItems: { new: nbaItemNew, updated: nbaItemUpdated },
    total_new: flashcardNew + nbaItemNew
  }, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
