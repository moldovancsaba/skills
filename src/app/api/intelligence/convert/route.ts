import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const { sourceId, sourceType, targetType, companyId } = await req.json();

    if (!sourceId || !sourceType || !targetType || !companyId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (sourceType === targetType) {
      return NextResponse.json({ error: "Source and target types are the same" }, { status: 400 });
    }

    let sourceData: any;

    // 1. Fetch Source Data
    if (sourceType === "FLASHCARD") {
      sourceData = await prisma.flashcard.findUnique({
        where: { id: sourceId },
        include: { sources: true, actions: true }
      });
    } else if (sourceType === "GOALCARD") {
      sourceData = await prisma.goalcard.findUnique({
        where: { id: sourceId },
        include: { sources: true, actions: true }
      });
    } else if (sourceType === "TASKCARD") {
      sourceData = await prisma.nBAItem.findUnique({
        where: { id: sourceId },
        include: { feedback: true }
      });
    } else if (sourceType === "SOURCE") {
      sourceData = await prisma.source.findUnique({
        where: { id: sourceId },
      });
    }

    if (!sourceData) {
      return NextResponse.json({ error: "Source card not found" }, { status: 404 });
    }

    // 2. Create Target Data
    let createdItem: any;
    const baseData = {
      companyId: sourceData.companyId,
      title: sourceData.title,
      body: sourceData.body || sourceData.description || "",
      confidence: sourceData.confidence ?? 50,
      impact: sourceData.impact ?? 5,
      weight: sourceData.weight ?? 5,
      hashtags: sourceData.hashtags || [],
      intelligenceType: sourceData.intelligenceType || "INTERNAL",
      userAnnotation: `Converted from ${sourceType} ${sourceId}. original title: ${sourceData.title}`,
    };

    if (targetType === "FLASHCARD") {
      createdItem = await prisma.flashcard.create({
        data: {
          ...baseData,
          processingStatus: "ACCEPTED",
          kind: "SUMMARY",
        }
      });
    } else if (targetType === "GOALCARD") {
      createdItem = await prisma.goalcard.create({
        data: {
          ...baseData,
          processingStatus: "ACCEPTED",
          kind: "GOAL",
        }
      });
    } else if (targetType === "TASKCARD") {
      const generatedFromIds = sourceData.sources ? sourceData.sources.map((s: any) => s.sourceId) : 
                               sourceData.generatedFromIds ? sourceData.generatedFromIds : [];
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
        }
      });
    }

    // 3. Migrate Sources (Lineage)
    if (sourceData.sources && sourceData.sources.length > 0 && targetType !== "TASKCARD") {
      for (const s of sourceData.sources) {
        if (targetType === "FLASHCARD") {
          await prisma.flashcardSource.create({
            data: {
              flashcardId: createdItem.id,
              sourceType: s.sourceType,
              sourceId: s.sourceId,
              sourceName: s.sourceName || "Original Source",
            }
          }).catch(() => {}); // Ignore duplicates
        } else if (targetType === "GOALCARD") {
          await prisma.goalcardSource.create({
            data: {
              goalcardId: createdItem.id,
              sourceType: s.sourceType,
              sourceId: s.sourceId,
              sourceName: s.sourceName || "Original Source",
            }
          }).catch(() => {});
        }
      }
    }

    // 4. Archive/Delete Source
    if (sourceType === "FLASHCARD") {
      await prisma.flashcard.update({
        where: { id: sourceId },
        data: { activityState: "ARCHIVED" }
      });
    } else if (sourceType === "GOALCARD") {
      await prisma.goalcard.update({
        where: { id: sourceId },
        data: { activityState: "ARCHIVED" }
      });
    } else if (sourceType === "TASKCARD") {
      await prisma.nBAItem.update({
        where: { id: sourceId },
        data: { 
          activityState: "ARCHIVED",
          status: "ARCHIVED" // Keeping legacy for safety
        }
      });
    } else if (sourceType === "SOURCE") {
      await prisma.source.delete({
        where: { id: sourceId }
      });
    }

    return NextResponse.json({ success: true, targetId: createdItem.id });
  } catch (error) {
    console.error("Conversion error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
