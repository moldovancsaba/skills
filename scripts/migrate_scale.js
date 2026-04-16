const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("Starting Axiom Migration: Rescaling Metrics to 1-10...");

  // 1. Process Flashcards (confidence, weight, confidenceScore)
  console.log("\n--- Processing Flashcards ---");
  const flashcards = await prisma.flashcard.findMany({
    select: { id: true, confidence: true, weight: true, confidenceScore: true }
  });

  let fcUpdated = 0;
  for (const fc of flashcards) {
    const newConf = Math.max(1, Math.min(10, Math.floor((fc.confidence || 50) / 10)));
    const newWeight = Math.max(1, Math.min(10, Math.floor((fc.weight || 50) / 10)));
    const newConfScore = Math.max(1, Math.min(10, Math.floor((fc.confidenceScore || 50) / 10)));
    
    // Only update if it needs changing to save DB ops
    if (newConf !== fc.confidence || newWeight !== fc.weight || newConfScore !== fc.confidenceScore) {
       await prisma.flashcard.update({
         where: { id: fc.id },
         data: { 
           confidence: newConf, 
           weight: newWeight, 
           confidenceScore: newConfScore 
         }
       });
       fcUpdated++;
    }
  }
  console.log(`Updated ${fcUpdated} Flashcards.`);

  // 2. Process NBA Items (confidence, confidenceScore, ease, impact, iceScore)
  console.log("\n--- Processing TaskCards (NBA Items) ---");
  const nbaItems = await prisma.nBAItem.findMany({
    select: { id: true, confidence: true, confidenceScore: true, ease: true, impact: true }
  });

  let nbaUpdated = 0;
  for (const nba of nbaItems) {
    const newConf = Math.max(1, Math.min(10, Math.floor((nba.confidence || 50) / 10)));
    const newConfScore = Math.max(1, Math.min(10, Math.floor((nba.confidenceScore || 50) / 10)));
    
    // Ensure Ease and Impact are 1-10 (They were bounded 1-10 before, but just to be safe)
    const newEase = Math.max(1, Math.min(10, Math.round(nba.ease || 5)));
    const newImpact = Math.max(1, Math.min(10, Math.round(nba.impact || 5)));
    
    // Recalculate ICE using strict I * C * E
    const newIce = newImpact * newConfScore * newEase;

    if (newConf !== nba.confidence || newConfScore !== nba.confidenceScore || newIce !== nba.iceScore) {
      await prisma.nBAItem.update({
        where: { id: nba.id },
        data: {
          confidence: newConf,
          confidenceScore: newConfScore,
          ease: newEase,
          impact: newImpact,
          iceScore: newIce
        }
      });
      nbaUpdated++;
    }
  }
  console.log(`Updated ${nbaUpdated} TaskCards.`);
  
  console.log("\nAxiom Migration Complete.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
