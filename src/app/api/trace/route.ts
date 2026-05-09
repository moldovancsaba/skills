import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";

/**
 * Intelligence trace API.
 *
 * Reconstructs the evidence -> flashcard -> task provenance chain for a
 * version family using the current persisted schema relationships.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const familyId = searchParams.get("familyId");

  if (!familyId) {
    return NextResponse.json({ error: "familyId required" }, { status: 400 });
  }

  try {
    // 1. Fetch tasks in this version family
    const tasks = await prisma.nBAItem.findMany({
      where: { versionFamilyId: familyId },
      select: { id: true, title: true, createdAt: true, sourceFlashcardIds: true, generatedFromIds: true, companyId: true }
    });

    const companyId = tasks[0]?.companyId;
    if (!companyId) {
      return NextResponse.json([]);
    }

    const auth = await verifyMembership(req as any, companyId);
    if (auth.error) return auth.error;

    const nodes: any[] = [];
    tasks.forEach(t => nodes.push({ id: t.id, type: "TASK", title: t.title, timestamp: t.createdAt }));

    // 2. Collect flashcard IDs referenced by these tasks
    const flashcardIds = Array.from(new Set([
      ...tasks.flatMap(t => t.sourceFlashcardIds),
      ...tasks.flatMap(t => t.generatedFromIds),
    ])).filter(Boolean);

    if (flashcardIds.length > 0) {
      const flashcards = await prisma.flashcard.findMany({
        where: { id: { in: flashcardIds } },
        select: { id: true, title: true, createdAt: true, sources: { select: { sourceId: true } } }
      });

      flashcards.forEach(f => nodes.push({ id: f.id, type: "FLASHCARD", title: f.title, timestamp: f.createdAt }));

      // 3. Collect source IDs from the FlashcardSource join table
      const sourceIds = Array.from(new Set(flashcards.flatMap(f => f.sources.map(s => s.sourceId)))).filter(Boolean);

      if (sourceIds.length > 0) {
        const sources = await prisma.source.findMany({
          where: { id: { in: sourceIds } },
          select: { id: true, createdAt: true, publicId: true }
        });
        sources.forEach(s => nodes.push({
          id: s.id,
          type: "SOURCE",
          title: `Source #${s.publicId || s.id.slice(0, 6)}`,
          timestamp: s.createdAt
        }));
      }
    }

    // Sort chronologically ascending (Evidence first, Task last)
    nodes.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return NextResponse.json(nodes);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
