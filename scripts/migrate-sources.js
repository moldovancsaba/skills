const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function migrateLegacyEnums() {
  console.log("Starting Migration of Legacy Enums (FlashcardSourceType & FlashcardStatus)...");

  try {
    // We must use raw queries because Prisma Client will crash if it encounters invalid Enums during findMany().
    // Update Flashcards where sources have legacy sourceType.
    
    console.log("Updating FlashcardSource array elements...");
    
    // In MongoDB, to update all array elements matching a condition, we can use $[] or run an aggregation update.
    // Instead, since Prisma $runCommandRaw doesn't easily support updating every array element conditionally in one go
    // without complex aggregations in some Mongo versions, we'll use find + replace.
    // Actually, we can just fetch raw documents and update them one by one.
    
    const db = prisma.$runCommandRaw({ ping: 1 }); // just to initialize
    
    // Find all raw flashcards
    const result = await prisma.$runCommandRaw({
      find: "Flashcard",
      filter: {}
    });
    
    const documents = result.cursor.firstBatch;
    let updatedCount = 0;
    
    for (const doc of documents) {
      let needsUpdate = false;
      const sources = doc.sources || [];
      
      const newSources = sources.map(source => {
        if (source.sourceType === "PRODUCT" || source.sourceType === "CUSTOMER" || source.sourceType === "COMPETITOR") {
          needsUpdate = true;
          return { ...source, sourceType: "SOURCE" };
        }
        return source;
      });
      
      // Also check status if any legacy
      let newProcessingStatus = doc.processingStatus;
      let newActivityState = doc.activityState;
      let newStatus = doc.status;
      
      if (needsUpdate) {
        // Run a raw update for this document
        await prisma.$runCommandRaw({
          update: "Flashcard",
          updates: [
            {
              q: { _id: doc._id },
              u: { $set: { sources: newSources } }
            }
          ]
        });
        updatedCount++;
      }
    }
    
    console.log(`Successfully migrated ${updatedCount} legacy Flashcard documents.`);
    
    // Similarly, we can clean up any other loose ends if needed.
    // e.g. run the standard migrate-statuses logic if not run yet.
    
  } catch (error) {
    console.error("Migration Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

migrateLegacyEnums();
