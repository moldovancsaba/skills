import { HashtagEntityType, HashtagFeedbackAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { normalizeHashtag, normalizeHashtagList } from "@/lib/hashtags";
import { verifyMembership } from "@/lib/permissions";
import { recordInteractionEventFromRequest, recordOutcomeEvent } from "@/lib/audit-ledger";

function removeTag(values: string[] | null | undefined, tag: string) {
  return normalizeHashtagList(values).filter((item) => item !== tag);
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
    }
    const data = payload as {
      entityType?: string;
      entityId?: string;
      tag?: unknown;
    };
    const entityType = (typeof data.entityType === "string" ? data.entityType : "").toUpperCase() as HashtagEntityType;
    const entityId = typeof data.entityId === "string" ? data.entityId : "";
    const normalizedTag = normalizeHashtag(String(data.tag ?? ""));

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
          ? await prisma.checklistTask.findUnique({ where: { id: entityId }, select: { id: true, companyId: true, hashtags: true } })
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
      await prisma.checklistTask.update({
        where: { id: entityId },
        data: { hashtags: nextHashtags, updatedAt: new Date(), hashtagEvaluationPending: true },
      });
    } else if (entityType === HashtagEntityType.TOPIC) {
      await prisma.topic.update({
        where: { id: entityId },
        data: {
          hashtags: nextHashtags,
          updatedAt: new Date(),
          hashtagEvaluationPending: true,
        },
      });
    } else if (entityType === HashtagEntityType.FILE) {
      await prisma.uploadedSourceFile.update({
        where: { id: entityId },
        data: {
          hashtags: nextHashtags,
          updatedAt: new Date(),
          hashtagEvaluationPending: true,
        },
      });
    } else {
      await prisma.source.update({
        where: { id: entityId },
        data: {
          hashtags: nextHashtags,
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
