const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const cid = "0f769be4-59b4-4027-b0b8-8159eb734563"; // Fortitude AI
  
  const nbaCount = await prisma.nBAItem.count({ where: { companyId: cid } });
  const fcCount = await prisma.flashcard.count({ where: { companyId: cid } });
  const sCount = await prisma.source.count({ where: { companyId: cid } });
  
  console.log(`Company: Fortitude AI`);
  console.log(`NBAItems: ${nbaCount}`);
  console.log(`Flashcards: ${fcCount}`);
  console.log(`Sources: ${sCount}`);
  
  const activeNba = await prisma.nBAItem.count({ 
    where: { 
      companyId: cid,
      processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED"] },
      activityState: { in: ["ACTIVE", "STALE"] }
    } 
  });
  console.log(`Active NBA (API logic): ${activeNba}`);
  
  const pendingNba = await prisma.nBAItem.count({
    where: {
      companyId: cid,
      processingStatus: { in: ["DRAFT", "CHECKED", "VERIFIED"] }
    }
  });
  console.log(`Pending NBA (Dashboard logic if API returns all): ${pendingNba}`);

  process.exit(0);
}

main();
