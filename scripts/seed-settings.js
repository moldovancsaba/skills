/**
 * checklist SETTINGS SEEDER
 * v0.11.4-STABLE
 * 
 * Initializes the global configuration layer for the local AI engine.
 * Enforces baseline intervals, quality thresholds, and data lifecycle durations.
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

/**
 * Executes the global settings upsert sequence.
 */
async function seed() {
  console.log("Seeding Global Settings...");

  const settings = [
    { key: "loop_interval_ms", value: 3600000 },
    { key: "batch_limit", value: 5 },
    { key: "mini_loop_passes", value: 3 },
    { key: "confidence_reject_percentile", value: 10 },
    { key: "card_expiry_hours", value: 168 },
    { key: "stale_days", value: 30 },
    { key: "archive_days", value: 90 }
  ];

  for (const s of settings) {
    await prisma.globalSetting.upsert({
      where: { key: s.key },
      update: { value: s.value },
      create: s
    });
    console.log(`- Set ${s.key} = ${JSON.stringify(s.value)}`);
  }

  console.log("Seeding Complete.");
}

seed()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
