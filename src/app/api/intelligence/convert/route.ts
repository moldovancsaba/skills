import { NextRequest, NextResponse } from "next/server";
import type { FlashcardSourceType, IntelligenceType } from "@prisma/client";
import { recordDecisionEvent, recordInteractionEvent, recordOutcomeEvent } from "@/lib/audit-ledger";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { normalizeKnowledgeScores, normalizeTaskScores } from "@/lib/scoring-contract";

type ConvertibleSourceType = "FLASHCARD" | "GOALCARD" | "TASKCARD" | "SOURCE";
type ConvertibleTargetType = "FLASHCARD" | "GOALCARD" | "TASKCARD";

type SourceLink = {
  sourceId: string;
  sourceType: FlashcardSourceType;
  sourceName?: string | null;
};

type ConvertibleRecord = {
  id: string;
  companyId: string;
  title?: string | null;
  body?: string | null;
  description?: string | null;
  content?: string | null;
  provenance?: string | null;
  publicId?: number | null;
  confidence?: number | null;
  confidenceScore?: number | null;
  impact?: number | null;
  weight?: number | null;
  ease?: number | null;
  hashtags?: string[] | null;
  intelligenceType?: string | null;
  generatedFromIds?: string[] | null;
  sources?: SourceLink[];
};

function isConvertibleSourceType(value: unknown): value is ConvertibleSourceType {
  return value === "FLASHCARD" || value === "GOALCARD" || value === "TASKCARD" || value === "SOURCE";
}

function isConvertibleTargetType(value: unknown): value is ConvertibleTargetType {
  return value === "FLASHCARD" || value === "GOALCARD" || value === "TASKCARD";
}

function deriveSourceTitle(source: Pick<ConvertibleRecord, "title" | "content" | "provenance" | "publicId">) {
  if (typeof source.title === "string" && source.title.trim()) return source.title.trim();
  if (typeof source.provenance === "string" && source.provenance.trim()) return source.provenance.trim();
  const content = typeof source.content === "string" ? source.content.replace(/\s+/g, " ").trim() : "";
  if (content) return content.length > 80 ? `${content.slice(0, 80).trimEnd()}...` : content;
  return source.publicId ? `Source #${source.publicId}` : "Converted Source";
}

function normalizeIntelligenceType(value: unknown): IntelligenceType {
  return value === "COMPETITOR" ? "COMPETITOR" : "INTERNAL";
}

function buildBaseData(sourceType: ConvertibleSourceType, sourceData: ConvertibleRecord) {
  return {
    companyId: sourceData.companyId,
    title: sourceType === "SOURCE" ? deriveSourceTitle(sourceData) : String(sourceData.title || "").trim(),
    body: sourceType === "SOURCE"
      ? String(sourceData.content || "")
      : String(sourceData.body || sourceData.description || ""),
    confidence: sourceData.confidenceScore ?? sourceData.confidence ?? 5,
    impact: sourceData.impact ?? 5,
    weight: sourceData.weight ?? sourceData.ease ?? 5,
    hashtags: Array.isArray(sourceData.hashtags) ? sourceData.hashtags : [],
    intelligenceType: normalizeIntelligenceType(sourceData.intelligenceType),
    userAnnotation: `Converted from ${sourceType} ${sourceData.id}. original title: ${sourceType === "SOURCE" ? deriveSourceTitle(sourceData) : sourceData.title || "Untitled"}`,
  };
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const sourceId = typeof payload?.sourceId === "string" ? payload.sourceId : "";
    const sourceType = payload?.sourceType;
    const targetType = payload?.targetType;
    const companyId = typeof payload?.companyId === "string" ? payload.companyId : "";

    if (!sourceId || !companyId || !isConvertibleSourceType(sourceType) || !isConvertibleTargetType(targetType)) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const auth = await verifyMembership(req, companyId);
    if (auth.error) return auth.error;

    if (sourceType === targetType) {
      return NextResponse.json({ error: "Source and target types are the same" }, { status: 400 });
    }

    let sourceData: ConvertibleRecord | null = null;

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
      sourceData = await prisma.checklistTask.findUnique({
        where: { id: sourceId },
        include: { feedback: true }
      });
    } else if (sourceType === "SOURCE") {
      sourceData = await prisma.source.findUnique({
        where: { id: sourceId },
        select: {
          id: true,
          companyId: true,
          content: true,
          provenance: true,
          publicId: true,
          confidence: true,
          confidenceScore: true,
          impact: true,
          weight: true,
          hashtags: true,
          intelligenceType: true,
        },
      });
    }

    if (!sourceData) {
      return NextResponse.json({ error: "Source card not found" }, { status: 404 });
    }

    // 2. Create Target Data
    let createdItem: { id: string } | null = null;
    const baseData = buildBaseData(sourceType, sourceData);

    if (!baseData.title) {
      return NextResponse.json({ error: "Source card has no usable title" }, { status: 400 });
    }

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
      const generatedFromIds = Array.isArray(sourceData.sources)
        ? sourceData.sources.map((source) => source.sourceId)
        : Array.isArray(sourceData.generatedFromIds)
          ? sourceData.generatedFromIds
          : [];
      const normalizedScores = normalizeTaskScores(baseData);
      createdItem = await prisma.checklistTask.create({
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

    if (!createdItem) {
      return NextResponse.json({ error: "Unsupported conversion target" }, { status: 400 });
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
    if (Array.isArray(sourceData.sources) && sourceData.sources.length > 0 && targetType !== "TASKCARD") {
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
      await prisma.checklistTask.update({
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
