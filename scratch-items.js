const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const company = await prisma.company.findFirst();
  const items = await prisma.nBAItem.findMany({
    where: {
      companyId: company.id,
      processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED"] },
      activityState: { in: ["ACTIVE", "STALE"] }
    }
  });
  console.log(JSON.stringify(items[0], null, 2));
}
main().finally(() => prisma.$disconnect());
