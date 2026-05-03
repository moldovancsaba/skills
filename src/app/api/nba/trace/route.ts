import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * NBA Lineage Trace API (NBA 2)
 * Fetches the chain of evidence for a specific TaskCard.
 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    const item = await prisma.nBAItem.findUnique({
      where: { id },
      select: { 
        id: true, 
        companyId: true, 
        title: true, 
        generatedFromIds: true 
      }
    });

    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    const auth = await verifyMembership(request, item.companyId);
    if (auth.error) return auth.error;

    // 1. Fetch triggering Flashcards
    const flashcards = await prisma.flashcard.findMany({
      where: { id: { in: item.generatedFromIds } },
      include: {
        sources: true // These are FlashcardSource records
      }
    });

    // 2. Fetch original Sources & Files
    const sourceIds = flashcards.flatMap(f => f.sources.filter(s => s.sourceType === "SOURCE").map(s => s.sourceId));
    const fileIds = flashcards.flatMap(f => f.sources.filter(s => s.sourceType === "FILE").map(s => s.sourceId));

    const [sources, files] = await Promise.all([
      prisma.source.findMany({ where: { id: { in: sourceIds } } }),
      prisma.uploadedSourceFile.findMany({ where: { id: { in: fileIds } } })
    ]);

    // 3. Assemble the Trace
    const trace = flashcards.map(fc => ({
      flashcard: {
        id: fc.id,
        title: fc.title,
        content: fc.body,
        kind: fc.kind
      },
      evidence: fc.sources.map(fcs => {
        if (fcs.sourceType === "SOURCE") {
          const s = sources.find(src => src.id === fcs.sourceId);
          return {
            id: fcs.id,
            type: "SOURCE",
            name: s?.content.slice(0, 50) + "..." || fcs.sourceName,
            provenance: s?.provenance || "manual"
          };
        } else {
          const f = files.find(file => file.id === fcs.sourceId);
          return {
            id: fcs.id,
            type: "FILE",
            name: f?.name || fcs.sourceName,
            provenance: "upload"
          };
        }
      })
    }));

    return NextResponse.json({
      nbaItemId: item.id,
      title: item.title,
      trace
    });

  } catch (error) {
    console.error("[API:TRACE] Failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
