const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function deleteInBatches(model, name) {
  let deletedCount = 0;
  while (true) {
    const items = await model.findMany({ select: { id: true }, take: 1000 });
    if (items.length === 0) break;
    const ids = items.map(i => i.id);
    const res = await model.deleteMany({ where: { id: { in: ids } } });
    deletedCount += res.count;
    console.log(`Deleted ${deletedCount} ${name} so far...`);
  }
  console.log(`Finished deleting ${deletedCount} ${name}.`);
}

async function main() {
  console.log("Deleting flashcards in batches...");
  await deleteInBatches(prisma.flashcard, 'Flashcards');
  console.log("Cleanup complete.");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(() => {
  prisma.$disconnect();
});
