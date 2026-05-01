const http = require('http');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.findFirst();
  console.log("Company:", company.id);
  const url = `http://localhost:3000/api/nba?companyId=${company.id}`;
  
  // Actually we might need a mocked auth or something since the API uses verifyMembership
  // Let's just check the verifyMembership in /api/nba/route.ts
}

main().finally(() => prisma.$disconnect());
