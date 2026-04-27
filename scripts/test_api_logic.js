const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function testApiLogic(companyId, isArchived) {
  const where = { companyId };

  if (isArchived) {
    where.OR = [
      { activityState: "ARCHIVED" },
      { processingStatus: { in: ["ACCEPTED", "DECLINED"] } }
    ];
  } else {
    where.processingStatus = { in: ["DRAFT", "CHECKED", "VERIFIED"] };
    where.activityState = { in: ["ACTIVE", "STALE"] };
  }

  const items = await prisma.nBAItem.findMany({
    where,
    orderBy: [{ iceScore: "desc" }, { confidenceScore: "desc" }, { publicId: "asc" }],
  });
  
  console.log(`Testing with isArchived=${isArchived}`);
  console.log(`Count: ${items.length}`);
  if (items.length > 0) {
    console.log(`Sample activityState: ${items[0].activityState}`);
    console.log(`Sample processingStatus: ${items[0].processingStatus}`);
  }
}

async function main() {
  const cid = "0f769be4-59b4-4027-b0b8-8159eb734563"; // Fortitude AI
  await testApiLogic(cid, false);
  await testApiLogic(cid, true);
  process.exit(0);
}

main();
