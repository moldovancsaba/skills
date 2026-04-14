const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function migrate() {
  console.log("Starting Data Migration: Legacy Status -> Option B (Processing + Activity)");

  // 1. Flashcards migration
  const flashcards = await prisma.flashcard.findMany();
  console.log(`Processing ${flashcards.length} Flashcards...`);

  for (const fc of flashcards) {
    let processingStatus = "DRAFT";
    let activityState = "ACTIVE";
    let confidenceScore = fc.confidence || 50;

    switch (fc.status) {
      case "DRAFT":
        processingStatus = "DRAFT";
        activityState = "ACTIVE";
        break;
      case "CHECKED":
        processingStatus = "CHECKED";
        activityState = "ACTIVE";
        break;
      case "VERIFIED":
      case "ACTIVE":
        processingStatus = "VERIFIED";
        activityState = "ACTIVE";
        break;
      case "STALE":
        processingStatus = "VERIFIED";
        activityState = "STALE";
        break;
      case "ARCHIVED":
        processingStatus = "VERIFIED";
        activityState = "ARCHIVED";
        break;
      case "EXPIRED":
        processingStatus = "DRAFT";
        activityState = "EXPIRED";
        break;
    }

    // Special handling for review status
    if (fc.reviewStatus === "ACCEPTED") processingStatus = "ACCEPTED";
    if (fc.reviewStatus === "DECLINED") processingStatus = "DECLINED";

    await prisma.flashcard.update({
      where: { id: fc.id },
      data: {
        processingStatus,
        activityState,
        confidenceScore,
      },
    });
  }

  // 2. NBAItems migration
  const nbaItems = await prisma.nBAItem.findMany();
  console.log(`Processing ${nbaItems.length} NBAItems...`);

  for (const tc of nbaItems) {
    let processingStatus = "DRAFT";
    let activityState = "ACTIVE";
    let confidenceScore = tc.confidence || 50;

    switch (tc.status) {
      case "DRAFT":
      case "PENDING":
        processingStatus = "DRAFT";
        activityState = "ACTIVE";
        break;
      case "CHECKED":
        processingStatus = "CHECKED";
        activityState = "ACTIVE";
        break;
      case "VERIFIED":
        processingStatus = "VERIFIED";
        activityState = "ACTIVE";
        break;
      case "ACCEPTED":
      case "COMPLETED":
        processingStatus = "ACCEPTED";
        activityState = "ACTIVE";
        break;
      case "DECLINED":
        processingStatus = "DECLINED";
        activityState = "ACTIVE";
        break;
      case "ARCHIVED":
        processingStatus = "ACCEPTED";
        activityState = "ARCHIVED";
        break;
      case "EXPIRED":
        processingStatus = "DRAFT";
        activityState = "EXPIRED";
        break;
    }

    await prisma.nBAItem.update({
      where: { id: tc.id },
      data: {
        processingStatus,
        activityState,
        confidenceScore,
      },
    });
  }

  console.log("Migration Complete.");
}

migrate()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
