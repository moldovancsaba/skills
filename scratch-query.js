const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const items1 = await prisma.nBAItem.findMany({ where: { candidateState: 'GENERATED' } });
  console.log("With 'GENERATED':", items1.length);
  
  const items2 = await prisma.nBAItem.findMany({ where: { candidateState: { in: ['GENERATED'] } } });
  console.log("With in: ['GENERATED']:", items2.length);
}
main().finally(() => prisma.$disconnect());
