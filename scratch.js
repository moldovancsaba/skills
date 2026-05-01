const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.findFirst();
  if (!company) {
    console.log("No company found.");
    return;
  }
  console.log("Company:", company.name);

  const items = await prisma.nBAItem.findMany({
    where: { companyId: company.id }
  });
  
  console.log("Total NBAItems:", items.length);

  const counts = items.reduce((acc, item) => {
    const key = `${item.activityState} | ${item.processingStatus}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  console.log("State Breakdown:");
  console.table(counts);

  const activeItems = items.filter(i => ["ACTIVE", "STALE"].includes(i.activityState) && ["DRAFT", "CHECKED", "VERIFIED"].includes(i.processingStatus));
  console.log("Active Items (Legacy Filter):", activeItems.length);
  
  // also check how many are actually on the FRONTIER via the CandidateState table
  // wait, CandidateState is a model?
  const candidateStates = await prisma.candidateState.findMany({
    where: { nbaItemId: { in: items.map(i => i.id) } }
  });
  
  const stateCounts = candidateStates.reduce((acc, state) => {
    acc[state.lifecycleState] = (acc[state.lifecycleState] || 0) + 1;
    return acc;
  }, {});
  console.log("CandidateState Breakdown:");
  console.table(stateCounts);
}

main().catch(console.error).finally(() => prisma.$disconnect());
