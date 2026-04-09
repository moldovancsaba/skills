import { prisma } from "@/lib/db";
import { normalizeHashtagList } from "@/lib/hashtags";

type HashtagRecord = {
  id: string;
  tags: string[];
};

async function listCompanyHashtagRecords(companyId: string): Promise<HashtagRecord[]> {
  const [products, customers, competitors, files, flashcards, checklist] = await Promise.all([
    prisma.product.findMany({ where: { companyId }, select: { id: true, hashtags: true } }),
    prisma.customer.findMany({ where: { companyId }, select: { id: true, hashtags: true } }),
    prisma.competitor.findMany({ where: { companyId }, select: { id: true, hashtags: true } }),
    prisma.uploadedSourceFile.findMany({ where: { companyId }, select: { id: true, hashtags: true } }),
    prisma.flashcard.findMany({ where: { companyId }, select: { id: true, hashtags: true } }),
    prisma.nBAItem.findMany({ where: { companyId }, select: { id: true, hashtags: true } }),
  ]);

  return [...products, ...customers, ...competitors, ...files, ...flashcards, ...checklist].map((record) => ({
    id: record.id,
    tags: normalizeHashtagList(record.hashtags),
  }));
}

export async function getRecommendedHashtags(companyId: string, selected: string[], limit = 5) {
  const normalizedSelected = normalizeHashtagList(selected);
  const records = await listCompanyHashtagRecords(companyId);
  const globalCounts = new Map<string, number>();
  const conditionalCounts = new Map<string, number>();

  for (const record of records) {
    const tags = normalizeHashtagList(record.tags);
    for (const tag of tags) {
      globalCounts.set(tag, (globalCounts.get(tag) ?? 0) + 1);
    }

    const matchesSelection =
      normalizedSelected.length === 0 || normalizedSelected.every((tag) => tags.includes(tag));
    if (!matchesSelection) {
      continue;
    }

    for (const tag of tags) {
      if (normalizedSelected.includes(tag)) continue;
      conditionalCounts.set(tag, (conditionalCounts.get(tag) ?? 0) + 1);
    }
  }

  const rank = (entries: Map<string, number>) =>
    [...entries.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([tag]) => tag);

  const recommended = rank(conditionalCounts);
  const fallback = rank(globalCounts).filter((tag) => !normalizedSelected.includes(tag));
  const merged = [...recommended, ...fallback].filter((tag, index, array) => array.indexOf(tag) === index);

  return {
    selected: normalizedSelected,
    recommendations: merged.slice(0, limit),
    popular: rank(globalCounts).slice(0, limit),
  };
}
