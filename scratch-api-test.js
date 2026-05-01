const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.findFirst();
  
  const where = { companyId: company.id };
  where.processingStatus = { in: ["DRAFT", "CHECKED", "VERIFIED"] };
  where.activityState = { in: ["ACTIVE", "STALE"] };
  where.scheduledDate = { lte: new Date() };

  const items = await prisma.nBAItem.findMany({
    where,
    orderBy: [{ iceScore: "desc" }, { confidenceScore: "desc" }, { publicId: "asc" }],
  });
  console.log("Items from exact API logic:", items.length);
}
main().finally(() => prisma.$disconnect());
