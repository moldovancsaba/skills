import { NextResponse } from "next/server";
import { recordDecisionEvent, recordInteractionEvent, recordOutcomeEvent } from "@/lib/audit-ledger";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { normalizeKnowledgeScores, normalizeTaskScores } from "@/lib/scoring-contract";

export async function POST(req: Request) {
  try {
    const { sourceId, sourceType, targetType, companyId } = await req.json();

    if (!sourceId || !sourceType || !targetType || !companyId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const auth = await verifyMembership(req as any, companyId);
    if (auth.error) return auth.error;

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
      confidence: sourceData.confidenceScore ?? sourceData.confidence ?? 5,
      impact: sourceData.impact ?? 5,
      weight: sourceData.weight ?? sourceData.ease ?? 5,
      hashtags: sourceData.hashtags || [],
      intelligenceType: sourceData.intelligenceType || "INTERNAL",
      userAnnotation: `Converted from ${sourceType} ${sourceId}. original title: ${sourceData.title}`,
    };

    if (targetType === "FLASHCARD") {
      const normalizedScores = normalizeKnowledgeScores(baseData);
      createdItem = await prisma.flashcard.create({
        data: {
          ...baseData,
          confidence: normalizedScores.confidence,
          confidenceScore: normalizedScores.confidenceScore,
          impact: normalizedScores.impact,
          weight: normalizedScores.weight,
          iceScore: normalizedScores.iceScore,
          processingStatus: "ACCEPTED",
          kind: "SUMMARY",
        }
      });
    } else if (targetType === "GOALCARD") {
      const normalizedScores = normalizeKnowledgeScores(baseData);
      createdItem = await prisma.goalcard.create({
        data: {
          ...baseData,
          confidence: normalizedScores.confidence,
          confidenceScore: normalizedScores.confidenceScore,
          impact: normalizedScores.impact,
          weight: normalizedScores.weight,
          iceScore: normalizedScores.iceScore,
          processingStatus: "ACCEPTED",
          kind: "GOAL",
        }
      });
    } else if (targetType === "TASKCARD") {
      const generatedFromIds = sourceData.sources ? sourceData.sources.map((s: any) => s.sourceId) : 
                               sourceData.generatedFromIds ? sourceData.generatedFromIds : [];
      const normalizedScores = normalizeTaskScores(baseData);
      createdItem = await prisma.nBAItem.create({
        data: {
          companyId: baseData.companyId,
          title: baseData.title,
          description: baseData.body,
          status: "PENDING",
          confidence: normalizedScores.confidence,
          confidenceScore: normalizedScores.confidenceScore,
          impact: normalizedScores.impact,
          ease: normalizedScores.ease,
          iceScore: normalizedScores.iceScore,
          hashtags: baseData.hashtags,
          generatedFromIds: generatedFromIds,
        }
      });
    }

    await recordInteractionEvent({
      companyId,
      surface: "intelligence-convert",
      interactionType:
        targetType === "FLASHCARD"
          ? "DATACARD_PROMOTE_KNOWLEDGE"
          : targetType === "GOALCARD"
            ? "DATACARD_PROMOTE_GOAL"
            : "DATACARD_PROMOTE_TASK",
      entityType: sourceType,
      entityId: sourceId,
      afterState: {
        targetType,
        targetId: createdItem.id,
      },
      teachingWeight: 50,
    });

    await recordDecisionEvent({
      companyId,
      decisionMaker: "human-convert",
      decisionType: "INTELLIGENCE_RECATEGORIZATION",
      entityType: sourceType,
      entityId: sourceId,
      beforeState: { sourceType },
      afterState: { targetType, targetId: createdItem.id },
      teachingWeight: 50,
    });

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

    await recordOutcomeEvent({
      companyId,
      actorType: "USER",
      entityType: targetType,
      entityId: createdItem.id,
      outcomeType: "CONVERTED",
      outcomeValue: `${sourceType}->${targetType}`,
      payload: { sourceId, sourceType },
      teachingWeight: 50,
    });

    return NextResponse.json({ success: true, targetId: createdItem.id });
  } catch (error) {
    console.error("Conversion error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
