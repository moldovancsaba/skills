const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.findFirst();
  const where = {
    companyId: company.id,
    processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED"] },
    activityState: { in: ["ACTIVE", "STALE"] },
    OR: [
      { scheduledDate: null },
      { scheduledDate: { isSet: false } },
      { scheduledDate: { lte: new Date() } }
    ]
  };
  try {
    const items = await prisma.nBAItem.findMany({ where });
    console.log("Success! Items:", items.length);
  } catch (err) {
    console.error("Prisma Error:", err.message);
  }
}

main().finally(() => prisma.$disconnect());
