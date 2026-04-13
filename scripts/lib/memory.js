/**
 * The MEMORY engine harvests human feedback (History) into rigid constraints.
 * It scavenges FlashcardAction and Feedback history.
 */
async function getHumanMemoryPrompt(prisma, company) {
  // 1. Scavenge FlashcardAction History (Accept/Decline signals)
  const actions = await prisma.flashcardAction.findMany({
    where: { 
      flashcard: { companyId: company.id },
      action: { in: ["DECLINE", "REJECT", "ANNOTATE"] }
    },
    take: 15,
    orderBy: { createdAt: "desc" }
  });

  // 2. Scavenge Feedback History (General signals)
  const feedbacks = await prisma.feedback.findMany({
    where: { nbaItem: { companyId: company.id } },
    take: 10,
    orderBy: { createdAt: "desc" }
  });

  // 3. Scavenge Card Corrections
  const corrections = await prisma.flashcardCorrection.findMany({
    where: { companyId: company.id },
    take: 10,
    orderBy: { createdAt: "desc" }
  });

  if (!actions.length && !feedbacks.length && !corrections.length) {
    return "No prior human feedback detected. Focus on high-quality marketing extraction.";
  }

  const guidelines = [];
  
  actions.forEach(a => {
    if (a.note) guidelines.push(`- USER ACTION REJECTION: "${a.note}"`);
  });

  feedbacks.forEach(f => {
    if (f.comment) guidelines.push(`- USER FEEDBACK SIGNAL: "${f.comment}"`);
  });

  corrections.forEach(c => {
    guidelines.push(`- USER CORRECTION: Change "${c.originalValue}" to "${c.correctedValue}"`);
  });

  return [
    "### RIGID HUMAN CONSTRAINTS (MANDATORY)",
    "The following feedback from the owner is ABSOLUTE LAW. You MUST NOT violate these principles:",
    ...new Set(guidelines.slice(0, 20))
  ].join("\n");
}

module.exports = {
  getHumanMemoryPrompt
};
