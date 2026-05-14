const { PrismaClient } = require("@prisma/client");
const { deriveDataCardScoreProfile, deriveTopicCardScoreProfile } = require("../src/lib/upstream-card-scoring");
const { deriveSourceProcessingStatus } = require("../src/lib/source-contract");

const prisma = new PrismaClient();

async function repairSources() {
  const sources = await prisma.source.findMany();
  let updated = 0;

  for (const source of sources) {
    const profile = deriveDataCardScoreProfile({
      content: source.content,
      hashtags: source.hashtags,
      entityTag: source.entityTag,
      aiClusters: source.aiClusters,
      metadata: source.metadata,
      intelligenceType: source.intelligenceType,
    });

    if (
      source.confidence !== profile.confidence ||
      source.confidenceScore !== profile.confidence ||
      source.impact !== profile.impact ||
      source.weight !== profile.weight ||
      source.iceScore !== profile.iceScore
    ) {
      await prisma.source.update({
        where: { id: source.id },
        data: {
          confidence: profile.confidence,
          confidenceScore: profile.confidence,
          impact: profile.impact,
          weight: profile.weight,
          iceScore: profile.iceScore,
          scoreProfile: profile.scoreProfile ?? null,
          processingStatus: deriveSourceProcessingStatus({
            ...source,
            confidence: profile.confidence,
            confidenceScore: profile.confidence,
          }),
        },
      });
      updated += 1;
    }
  }

  return updated;
}

async function repairTopics() {
  const topics = await prisma.topic.findMany();
  let updated = 0;

  for (const topic of topics) {
    const profile = deriveTopicCardScoreProfile({
      label: topic.label,
      notes: topic.notes,
      active: topic.active,
      sortOrder: topic.sortOrder,
      hashtags: topic.hashtags,
    });

    if (
      topic.confidence !== profile.confidence ||
      topic.confidenceScore !== profile.confidence ||
      topic.impact !== profile.impact ||
      topic.weight !== profile.weight ||
      topic.iceScore !== profile.iceScore
    ) {
      await prisma.topic.update({
        where: { id: topic.id },
        data: {
          confidence: profile.confidence,
          confidenceScore: profile.confidence,
          impact: profile.impact,
          weight: profile.weight,
          iceScore: profile.iceScore,
          scoreProfile: profile.scoreProfile ?? null,
        },
      });
      updated += 1;
    }
  }

  return updated;
}

async function repairFiles() {
  const files = await prisma.uploadedSourceFile.findMany();
  let updated = 0;

  for (const file of files) {
    const profile = deriveDataCardScoreProfile({
      name: file.name,
      content: file.name,
      hashtags: file.hashtags,
      entityTag: file.entityTag,
      metadata: { mimeType: file.mimeType, sizeBytes: file.sizeBytes },
      sourceName: file.name,
    });

    if (
      file.confidence !== profile.confidence ||
      file.confidenceScore !== profile.confidence ||
      file.impact !== profile.impact ||
      file.weight !== profile.weight ||
      file.iceScore !== profile.iceScore
    ) {
      await prisma.uploadedSourceFile.update({
        where: { id: file.id },
        data: {
          confidence: profile.confidence,
          confidenceScore: profile.confidence,
          impact: profile.impact,
          weight: profile.weight,
          iceScore: profile.iceScore,
          scoreProfile: profile.scoreProfile ?? null,
        },
      });
      updated += 1;
    }
  }

  return updated;
}

async function main() {
  console.log("Repairing persisted upstream scores for sources, topics, and files...");
  const [sources, topics, files] = await Promise.all([
    repairSources(),
    repairTopics(),
    repairFiles(),
  ]);
  console.log(`Sources updated: ${sources}`);
  console.log(`Topics updated: ${topics}`);
  console.log(`Files updated: ${files}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
