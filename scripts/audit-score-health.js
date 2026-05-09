const { defaultPrisma, computeCompanyScoreHealth } = require("../src/lib/score-health");
const prisma = defaultPrisma;

async function main() {
  const companyId = process.argv[2];

  const companies = companyId
    ? await prisma.company.findMany({
        where: { id: companyId },
        select: { id: true, name: true },
      })
    : await prisma.company.findMany({
        select: { id: true, name: true },
        orderBy: { updatedAt: "desc" },
      });

  if (companies.length === 0) {
    throw new Error(companyId ? `Company not found: ${companyId}` : "No companies found");
  }

  for (const company of companies) {
    const report = await computeCompanyScoreHealth(company.id);
    console.log(`\n# ${company.name} (${company.id})`);
    console.log(`Band: ${report.overallBand}`);
    console.log(`Dominant surface: ${report.dominantSurface}`);
    console.log(
      `Tasks: ${report.taskcards.count} total | ${report.taskcards.uniqueIceScores} unique ICE | ${report.taskcards.uniqueTriples} unique tuples | dominant tuple share ${Math.round((report.taskcards.dominantTuple?.share ?? 0) * 100)}%`
    );
    console.log(
      `Knowledge: ${report.knowledge.count} total | ${report.knowledge.uniqueIceScores} unique ICE | ${report.knowledge.uniqueTriples} unique tuples | dominant tuple share ${Math.round((report.knowledge.dominantTuple?.share ?? 0) * 100)}%`
    );
    if (report.taskcards.dominantTuple) {
      console.log(
        `Top task tuple: ${report.taskcards.dominantTuple.label} (${report.taskcards.dominantTuple.count} cards)`
      );
    }
  }
}

main()
  .catch((error) => {
    console.error("[audit:score-health] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
