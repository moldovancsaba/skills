import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Force-evaluating all active REFINED/GENERATED items...");
  
  const items = await prisma.nBAItem.findMany({
    where: {
      candidateState: { in: ["GENERATED", "REFINED"] as any },
      activityState: "ACTIVE"
    }
  });

  console.log(`Found ${items.length} items to evaluate.`);

  for (const item of items) {
    await prisma.nBAItem.update({
      where: { id: item.id },
      data: {
        candidateState: "EVALUATED" as any,
        processingStatus: "VERIFIED",
        scheduledDate: new Date(), // Make visible immediately
        qualityScore: 0.8,
        urgencyScore: 0.8,
        freshnessScore: 1.0,
        updatedAt: new Date()
      }
    });
  }

  console.log("Force evaluation complete.");
}

main().finally(() => prisma.$disconnect());
