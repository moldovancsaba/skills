const { PrismaClient } = require('@prisma/client');
const { inferLegacyState } = require('./lib/lifecycle');
const prisma = new PrismaClient();

async function main() {
  console.log("Migrating NBAItems to CandidateState...");
  const items = await prisma.checklistTask.findMany();
  let updated = 0;
  
  for (const item of items) {
    // Determine the state. If it doesn't have it physically, infer it.
    // Wait, findMany returns the default GENERATED even if it's not physical.
    // So if it returns GENERATED, we should still do an update to force it to write to the DB!
    const state = inferLegacyState(item);
    
    await prisma.checklistTask.update({
      where: { id: item.id },
      data: { candidateState: state }
    });
    updated++;
    if (updated % 10 === 0) console.log(`Migrated ${updated}/${items.length}`);
  }
  
  console.log(`Finished migrating ${updated} items.`);
}

main().finally(() => prisma.$disconnect());
