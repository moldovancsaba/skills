const { PrismaClient } = require('@prisma/client');
const { recomputeFrontier } = require('./scripts/lib/frontier');
const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.findFirst();
  console.log("Recomputing frontier for", company.name);
  const ids = await recomputeFrontier(prisma, company);
  console.log("Frontier IDs:", ids);
  
  const items = await prisma.nBAItem.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true, scheduledDate: true }
  });
  console.log("Updated items:", items);
}

main().finally(() => prisma.$disconnect());
