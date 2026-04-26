const { tokenizeText, unique } = require("./shared");

/**
 * SOVEREIGN RESEARCH ENGINE
 * v0.12.0-STABLE
 * 
 * Aggregates strategic focus areas into actionable search keywords.
 * Used to optimize the "Research Harvest Yield" (#112).
 */

/**
 * Extracts and weights strategic keywords for a company based on its Industry tags and active TopicCards.
 * 
 * @param {PrismaClient} prisma - Database client
 * @param {object} company - Company record
 * @returns {Promise<string[]>} Array of unique strategic keywords
 */
async function generateStrategicKeywords(prisma, company) {
  const cid = company.id;
  
  // 1. Industries (from Company model)
  const industries = company.industries || [];
  const primaryIndustry = company.industry ? [company.industry] : [];
  
  // 2. Active Topics
  const topics = await prisma.topic.findMany({
    where: { companyId: cid, active: true },
    select: { label: true, hashtags: true }
  });

  const topicLabels = topics.map(t => t.label);
  const topicHashtags = topics.flatMap(t => t.hashtags || []);

  // 3. Combine and Clean
  const rawPool = [
    ...primaryIndustry,
    ...industries,
    ...topicLabels,
    ...topicHashtags
  ];

  // Tokenize and ensure uniqueness
  const keywords = unique(rawPool.flatMap(item => {
    if (!item) return [];
    // If it's a hashtag, strip the # but keep the word
    const cleaned = item.replace(/^#/, "");
    return tokenizeText(cleaned);
  }));
  
  return keywords;
}

module.exports = {
  generateStrategicKeywords
};
