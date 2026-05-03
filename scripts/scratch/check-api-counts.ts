import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const cid = "0f769be4-59b4-4027-b0b8-8159eb734563"; // Fortitude AI
  
  const apiCount = await prisma.nBAItem.count({
    where: {
      companyId: cid,
      processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED"] as any },
      activityState: { in: ["ACTIVE", "STALE"] as any },
      scheduledDate: { lte: new Date() }
    }
  });

  const totalCount = await prisma.nBAItem.count({ where: { companyId: cid } });
  const pendingCount = await prisma.nBAItem.count({
    where: {
      companyId: cid,
      activityState: { in: ["ACTIVE", "STALE"] as any }
    }
  });

  console.log(`Fortitude AI: API_VISIBLE=${apiCount}, TOTAL=${totalCount}, PENDING_TOTAL=${pendingCount}`);
}

main().finally(() => prisma.$disconnect());
