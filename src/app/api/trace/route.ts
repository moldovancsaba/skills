import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * INTELLIGENCE TRACE API (Phase 4)
 * v0.14.0-PRODUCTION
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const familyId = searchParams.get("familyId");

  if (!familyId) {
    return NextResponse.json({ error: "familyId required" }, { status: 400 });
  }

  try {
    // Fetch all related items in the family
    const [tasks, flashcards] = await Promise.all([
      prisma.nBAItem.findMany({ 
        where: { versionFamilyId: familyId },
        select: { id: true, title: true, createdAt: true, generatedFromIds: true }
      }),
      prisma.flashcard.findMany({ 
        where: { versionFamilyId: familyId },
        select: { id: true, title: true, createdAt: true, generatedFromIds: true }
      })
    ]);

    // Build the node list
    const nodes: any[] = [];

    tasks.forEach(t => nodes.push({ id: t.id, type: 'TASK', title: t.title, timestamp: t.createdAt }));
    flashcards.forEach(f => nodes.push({ id: f.id, type: 'FLASHCARD', title: f.title, timestamp: f.createdAt }));

    // Fetch related sources
    const sourceIds = Array.from(new Set(flashcards.flatMap(f => f.generatedFromIds)));
    const sources = await prisma.source.findMany({
      where: { id: { in: sourceIds } },
      select: { id: true, content: true, createdAt: true, publicId: true }
    });

    sources.forEach(s => nodes.push({ 
      id: s.id, 
      type: 'SOURCE', 
      title: `Source #${s.publicId || s.id.slice(0, 4)}`, 
      timestamp: s.createdAt 
    }));

    // Sort by timestamp asc
    nodes.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return NextResponse.json(nodes);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
