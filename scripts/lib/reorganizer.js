/**
 * TRINITY REORGANIZER
 * M4.1 — Self-Healing Intelligence Pipeline
 * v1.0.0
 * 
 * Responsibilities:
 *   - Executes re-classification of misclassified cards.
 *   - Preserves lineage and metadata during migration.
 *   - Archives/Deletes original cards after successful migration.
 */


/**
 * Reorganizes a card into a different layer.
 * 
 * @param {object} card - The source card record
 * @param {string} sourceLayer - KNOWLEDGE | GOAL | TASK
 * @param {string} targetLayer - KNOWLEDGE | GOAL | TASK
 * @returns {Promise<boolean>} Success status
 */
async function reorganizeCard(prisma, card, sourceLayer, targetLayer) {
  if (sourceLayer === targetLayer) return true;

  console.log(`[REORGANIZER] 🔄 Migrating ${card.id} from ${sourceLayer} to ${targetLayer}`);

  const sourceTypeMap = {
    KNOWLEDGE: "FLASHCARD",
    GOAL: "GOALCARD",
    TASK: "TASKCARD"
  };

  const targetTypeMap = {
    KNOWLEDGE: "FLASHCARD",
    GOAL: "GOALCARD",
    TASK: "TASKCARD"
  };

  try {
    const sType = sourceTypeMap[sourceLayer];
    const tType = targetTypeMap[targetLayer];

    // Reuse the conversion logic (simplified for script use)
    const baseData = {
      companyId: card.companyId,
      title: card.title,
      body: card.body || card.description || card.generatedBody || "",
      confidence: card.confidence ?? 50,
      impact: card.impact ?? 5,
      weight: card.weight ?? card.ease ?? 5,
      hashtags: card.hashtags || [],
      intelligenceType: card.intelligenceType || "INTERNAL",
      userAnnotation: `AUTO-REORGANIZED by Trinity Auditor from ${sourceLayer} to ${targetLayer}.`,
    };

    let createdItem;

    if (tType === "FLASHCARD") {
      createdItem = await prisma.flashcard.create({
        data: {
          ...baseData,
          processingStatus: "ACCEPTED",
          kind: "SUMMARY",
        }
      });
    } else if (tType === "GOALCARD") {
      createdItem = await prisma.goalcard.create({
        data: {
          ...baseData,
          processingStatus: "ACCEPTED",
          kind: "GOAL",
        }
      });
    } else if (tType === "TASKCARD") {
      const generatedFromIds = card.sources ? card.sources.map(s => s.sourceId) : 
                               card.generatedFromIds ? card.generatedFromIds : [];
      createdItem = await prisma.nBAItem.create({
        data: {
          companyId: baseData.companyId,
          title: baseData.title,
          description: baseData.body,
          status: "PENDING",
          confidence: baseData.confidence,
          impact: baseData.impact,
          ease: baseData.weight,
          hashtags: baseData.hashtags,
          generatedFromIds: generatedFromIds,
          candidateState: "GENERATED",
          kanbanColumn: "IDEABANK",
        }
      });
    }

    // Migrate Lineage if possible
    if (card.sources && card.sources.length > 0 && tType !== "TASKCARD") {
      for (const s of card.sources) {
        if (tType === "FLASHCARD") {
          await prisma.flashcardSource.create({
            data: {
              flashcardId: createdItem.id,
              sourceType: s.sourceType,
              sourceId: s.sourceId,
              sourceName: s.sourceName || "Migrated Source",
            }
          }).catch(() => {});
        } else if (tType === "GOALCARD") {
          await prisma.goalcardSource.create({
            data: {
              goalcardId: createdItem.id,
              sourceType: s.sourceType,
              sourceId: s.sourceId,
              sourceName: s.sourceName || "Migrated Source",
            }
          }).catch(() => {});
        }
      }
    }

    // Archive original
    if (sType === "FLASHCARD") {
      await prisma.flashcard.update({ where: { id: card.id }, data: { activityState: "ARCHIVED" } });
    } else if (sType === "GOALCARD") {
      await prisma.goalcard.update({ where: { id: card.id }, data: { activityState: "ARCHIVED" } });
    } else if (sType === "TASKCARD") {
      await prisma.nBAItem.update({ where: { id: card.id }, data: { status: "ARCHIVED" } });
    }

    console.log(`[REORGANIZER] ✅ Migration successful. New ID: ${createdItem.id}`);
    return true;
  } catch (e) {
    console.error(`[REORGANIZER] ❌ Migration failed for ${card.id}:`, e.message);
    return false;
  }
}

module.exports = {
  reorganizeCard
};
