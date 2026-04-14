const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");

const prisma = new PrismaClient();

function hashValue(val) {
  return crypto.createHash("md5").update(val).digest("hex");
}

async function main() {
  console.log("--- TaskCard (NBAItem) Scrub & Deduplication ---");

  const tasks = await prisma.nBAItem.findMany();
  console.log(`Total Tasks found: ${tasks.length}`);

  let updated = 0;
  let deleted = 0;
  const seen = new Set();

  for (const task of tasks) {
    // Generate fingerprint if missing
    // For legacy tasks where we don't know the sourceFlashcardId, we use title only
    const fingerprint = task.fingerprint || hashValue(`EVO:TC:LEGACY:${task.companyId}:${task.title}`);
    const uniqueKey = `${task.companyId}:${fingerprint}`;

    if (seen.has(uniqueKey)) {
      console.log(`Duplicate found: ${task.title} (Company: ${task.companyId}). Deleting.`);
      await prisma.nBAItem.delete({ where: { id: task.id } });
      deleted++;
      continue;
    }

    seen.add(uniqueKey);

    const update = {
      fingerprint,
      processingStatus: task.processingStatus || "CHECKED",
      activityState: task.activityState || "ACTIVE",
      status: task.status || "PENDING", // Legacy Sync
      updatedAt: new Date()
    };

    await prisma.nBAItem.update({
      where: { id: task.id },
      data: update
    });
    updated++;
  }

  console.log(`Scrub Complete.`);
  console.log(`Updated: ${updated}`);
  console.log(`Deleted (Duplicates): ${deleted}`);
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
