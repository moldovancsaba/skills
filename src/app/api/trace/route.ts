import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";

/**
 * Intelligence trace API.
 *
 * Reconstructs the evidence -> flashcard -> task provenance chain for a
 * version family using the current persisted schema relationships.
 */
type TraceNode = {
  id: string;
  type: "TASK" | "FLASHCARD" | "SOURCE";
  title: string;
  timestamp: Date;
};

export async function GET(req: NextRequest) {
  const familyId = req.nextUrl.searchParams.get("familyId");

  if (!familyId) {
    return NextResponse.json({ error: "familyId required" }, { status: 400 });
  }

  try {
    // Fetch tasks in this version family
    const tasks = await prisma.checklistTask.findMany({
      where: { versionFamilyId: familyId },
      select: { id: true, title: true, createdAt: true, sourceFlashcardIds: true, generatedFromIds: true, companyId: true }
    });

    const companyId = tasks[0]?.companyId;
    if (!companyId) {
      return NextResponse.json([]);
    }

    const auth = await verifyMembership(req, companyId);
    if (auth.error) return auth.error;

    const nodes: TraceNode[] = [];
    tasks.forEach(t => nodes.push({ id: t.id, type: "TASK", title: t.title, timestamp: t.createdAt }));

    // Collect flashcard IDs referenced by these tasks
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

      // Collect source IDs from the FlashcardSource join table
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
