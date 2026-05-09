import { HashtagEntityType, HashtagFeedbackAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { normalizeHashtag, normalizeHashtagList } from "@/lib/hashtags";
import { verifyMembership } from "@/lib/permissions";
import { recordInteractionEventFromRequest, recordOutcomeEvent } from "@/lib/audit-ledger";
import { deriveDataCardScoreProfile, deriveTopicCardScoreProfile } from "@/lib/upstream-card-scoring";

function removeTag(values: string[] | null | undefined, tag: string) {
  return normalizeHashtagList(values).filter((item) => item !== tag);
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const entityType = String(data.entityType || "").toUpperCase() as HashtagEntityType;
    const entityId = typeof data.entityId === "string" ? data.entityId : "";
    const normalizedTag = normalizeHashtag(data.tag ?? "");

    if (!entityId || !normalizedTag) {
      return NextResponse.json({ error: "entityId and tag required" }, { status: 400 });
    }

    if (
      entityType !== HashtagEntityType.SOURCE &&
      entityType !== HashtagEntityType.FILE &&
      entityType !== HashtagEntityType.FLASHCARD &&
      entityType !== HashtagEntityType.CHECKLIST &&
      entityType !== HashtagEntityType.TOPIC
    ) {
      return NextResponse.json({ error: "Invalid entityType" }, { status: 400 });
    }

    const lookup =
      entityType === HashtagEntityType.FLASHCARD
        ? await prisma.flashcard.findUnique({ where: { id: entityId }, select: { id: true, companyId: true, hashtags: true } })
        : entityType === HashtagEntityType.CHECKLIST
          ? await prisma.nBAItem.findUnique({ where: { id: entityId }, select: { id: true, companyId: true, hashtags: true } })
          : entityType === HashtagEntityType.TOPIC
            ? await prisma.topic.findUnique({ where: { id: entityId }, select: { id: true, companyId: true, hashtags: true } })
            : entityType === HashtagEntityType.FILE
              ? await prisma.uploadedSourceFile.findUnique({ where: { id: entityId }, select: { id: true, companyId: true, hashtags: true } })
              : await prisma.source.findUnique({ where: { id: entityId }, select: { id: true, companyId: true, hashtags: true } });

    if (!lookup) {
      return NextResponse.json({ error: "Entity not found" }, { status: 404 });
    }

    const auth = await verifyMembership(request, lookup.companyId);
    if (auth.error) return auth.error;

    const nextHashtags = removeTag(lookup.hashtags, normalizedTag);

    if (entityType === HashtagEntityType.FLASHCARD) {
      await prisma.flashcard.update({
        where: { id: entityId },
        data: { hashtags: nextHashtags, updatedAt: new Date(), hashtagEvaluationPending: true },
      });
    } else if (entityType === HashtagEntityType.CHECKLIST) {
      await prisma.nBAItem.update({
        where: { id: entityId },
        data: { hashtags: nextHashtags, updatedAt: new Date(), hashtagEvaluationPending: true },
      });
    } else if (entityType === HashtagEntityType.TOPIC) {
      const topic = await prisma.topic.findUnique({ where: { id: entityId } });
      if (!topic) {
        return NextResponse.json({ error: "Topic not found" }, { status: 404 });
      }
      const scoreProfile = deriveTopicCardScoreProfile({
        label: topic.label,
        notes: topic.notes,
        active: topic.active,
        sortOrder: topic.sortOrder,
        hashtags: nextHashtags,
      });
      await prisma.topic.update({
        where: { id: entityId },
        data: {
          hashtags: nextHashtags,
          confidence: scoreProfile.confidence,
          confidenceScore: scoreProfile.confidence,
          impact: scoreProfile.impact,
          weight: scoreProfile.weight,
          iceScore: scoreProfile.iceScore,
          updatedAt: new Date(),
          hashtagEvaluationPending: true,
        },
      });
    } else if (entityType === HashtagEntityType.FILE) {
      const file = await prisma.uploadedSourceFile.findUnique({ where: { id: entityId } });
      if (!file) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }
      const scoreProfile = deriveDataCardScoreProfile({
        name: file.name,
        content: file.name,
        hashtags: nextHashtags,
        entityTag: file.entityTag,
        sourceName: file.name,
      });
      await prisma.uploadedSourceFile.update({
        where: { id: entityId },
        data: {
          hashtags: nextHashtags,
          confidence: scoreProfile.confidence,
          confidenceScore: scoreProfile.confidence,
          impact: scoreProfile.impact,
          weight: scoreProfile.weight,
          iceScore: scoreProfile.iceScore,
          updatedAt: new Date(),
          hashtagEvaluationPending: true,
        },
      });
    } else {
      const source = await prisma.source.findUnique({ where: { id: entityId } });
      if (!source) {
        return NextResponse.json({ error: "Source not found" }, { status: 404 });
      }
      const scoreProfile = deriveDataCardScoreProfile({
        content: source.content,
        hashtags: nextHashtags,
        entityTag: source.entityTag,
        aiClusters: source.aiClusters,
        metadata: source.metadata,
        intelligenceType: source.intelligenceType,
      });
      await prisma.source.update({
        where: { id: entityId },
        data: {
          hashtags: nextHashtags,
          confidence: scoreProfile.confidence,
          confidenceScore: scoreProfile.confidence,
          impact: scoreProfile.impact,
          weight: scoreProfile.weight,
          iceScore: scoreProfile.iceScore,
          updatedAt: new Date(),
          hashtagEvaluationPending: true,
        },
      });
    }

    await prisma.hashtagFeedback.create({
      data: {
        companyId: lookup.companyId,
        entityType,
        entityId,
        tag: normalizedTag,
        action: HashtagFeedbackAction.USER_REMOVE,
      },
    });

    await recordInteractionEventFromRequest(request, {
      companyId: lookup.companyId,
      surface: "hashtag-controls",
      interactionType: "HASHTAG_REMOVE",
      entityType,
      entityId,
      beforeState: {
        hashtags: lookup.hashtags,
      },
      afterState: {
        hashtags: nextHashtags,
      },
      payload: {
        tag: normalizedTag,
      },
      teachingWeight: 45,
    });

    await recordOutcomeEvent({
      companyId: lookup.companyId,
      actorType: "HUMAN",
      entityType,
      entityId,
      outcomeType: "HASHTAG_TAXONOMY_CHANGED",
      outcomeValue: "USER_REMOVE",
      payload: {
        tag: normalizedTag,
      },
      teachingWeight: 45,
    });

    return NextResponse.json({ success: true, hashtags: nextHashtags });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
