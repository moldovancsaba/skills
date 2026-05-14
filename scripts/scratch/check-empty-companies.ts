import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const companies = await prisma.company.findMany({
    select: { id: true, name: true }
  });

  console.log(`Checking ${companies.length} companies...`);

  for (const company of companies) {
    const total = await prisma.checklistTask.count({ where: { companyId: company.id } });
    const evaluated = await prisma.checklistTask.count({ 
      where: { 
        companyId: company.id, 
        candidateState: "EVALUATED" 
      } 
    });
    const visible = await prisma.checklistTask.count({
      where: {
        companyId: company.id,
        candidateState: "EVALUATED",
        activityState: "ACTIVE",
        scheduledDate: { lte: new Date() }
      }
    });

    console.log(`[STATE] ${company.name}: total=${total}, evaluated=${evaluated}, visible=${visible}`);
  }
}

main().finally(() => prisma.$disconnect());
