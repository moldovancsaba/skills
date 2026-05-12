const { defaultPrisma, computeCompanyScoreHealth } = require("../src/lib/score-health");
const prisma = defaultPrisma;

function formatDominantSignals(value) {
  const signals = Array.isArray(value) ? value : [];
  if (signals.length === 0) return "none";
  return signals
    .slice(0, 3)
    .map((entry) => `${entry.label}:${Number(entry.signal).toFixed(1)}`)
    .join(", ");
}

function extractFactorTrace(profile, dimension) {
  if (!profile || typeof profile !== "object") return "none";
  return formatDominantSignals(profile?.factors?.final?.[dimension]?.dominantSignals);
}

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
    const [topTask, topKnowledge] = await Promise.all([
      prisma.nBAItem.findFirst({
        where: {
          companyId: company.id,
          activityState: { in: ["ACTIVE", "STALE"] },
        },
        orderBy: [{ iceScore: "desc" }, { updatedAt: "desc" }],
        select: {
          title: true,
          scoreProfile: true,
        },
      }),
      prisma.flashcard.findFirst({
        where: {
          companyId: company.id,
          activityState: { in: ["ACTIVE", "STALE"] },
        },
        orderBy: [{ iceScore: "desc" }, { updatedAt: "desc" }],
        select: {
          title: true,
          scoreProfile: true,
        },
      }),
    ]);
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
    if (topTask) {
      console.log(
        `Top task factor trace: ${topTask.title} | impact[${extractFactorTrace(topTask.scoreProfile, "impact")}] confidence[${extractFactorTrace(topTask.scoreProfile, "confidence")}] ease[${extractFactorTrace(topTask.scoreProfile, "effort")}]`
      );
    }
    if (topKnowledge) {
      console.log(
        `Top knowledge factor trace: ${topKnowledge.title} | impact[${extractFactorTrace(topKnowledge.scoreProfile, "impact")}] confidence[${extractFactorTrace(topKnowledge.scoreProfile, "confidence")}] weight[${extractFactorTrace(topKnowledge.scoreProfile, "effort")}]`
      );
    }
    if (report.alerts.length > 0) {
      console.log("Alerts:");
      for (const alert of report.alerts.slice(0, 6)) {
        console.log(
          `- [${alert.severity}] ${alert.scope} ${alert.metric}: ${alert.detail} Threshold ${Math.round(alert.thresholdShare * 100)}%`
        );
      }
    } else {
      console.log("Alerts: none");
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
