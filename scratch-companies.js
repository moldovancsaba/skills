const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const companies = await prisma.company.findMany();
  console.log("Companies:", companies.map(c => c.name));
  
  for (const c of companies) {
    const items = await prisma.nBAItem.count({
      where: {
        companyId: c.id,
        processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED"] },
        activityState: { in: ["ACTIVE", "STALE"] }
      }
    });
    console.log(`Company ${c.name} has ${items} active items`);
  }
}
main().finally(() => prisma.$disconnect());
