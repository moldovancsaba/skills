import { HashtagEntityType, HashtagFeedbackAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { normalizeHashtag, normalizeHashtagList } from "@/lib/hashtags";
import { verifyMembership } from "@/lib/permissions";

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

    if (![HashtagEntityType.SOURCE, HashtagEntityType.FLASHCARD, HashtagEntityType.CHECKLIST].includes(entityType)) {
      return NextResponse.json({ error: "Invalid entityType" }, { status: 400 });
    }

    const lookup =
      entityType === HashtagEntityType.FLASHCARD
        ? await prisma.flashcard.findUnique({ where: { id: entityId }, select: { id: true, companyId: true, hashtags: true } })
        : entityType === HashtagEntityType.CHECKLIST
          ? await prisma.nBAItem.findUnique({ where: { id: entityId }, select: { id: true, companyId: true, hashtags: true } })
          : await prisma.product.findUnique({ where: { id: entityId }, select: { id: true, companyId: true, hashtags: true } })
            ?? await prisma.customer.findUnique({ where: { id: entityId }, select: { id: true, companyId: true, hashtags: true } })
            ?? await prisma.competitor.findUnique({ where: { id: entityId }, select: { id: true, companyId: true, hashtags: true } })
            ?? await prisma.uploadedSourceFile.findUnique({ where: { id: entityId }, select: { id: true, companyId: true, hashtags: true } });

    if (!lookup) {
      return NextResponse.json({ error: "Entity not found" }, { status: 404 });
    }

    const auth = await verifyMembership(request, lookup.companyId);
    if (auth.error) return auth.error;

    const nextHashtags = removeTag(lookup.hashtags, normalizedTag);

    if (entityType === HashtagEntityType.FLASHCARD) {
      await prisma.flashcard.update({
        where: { id: entityId },
        data: { hashtags: nextHashtags, updatedAt: new Date() },
      });
    } else if (entityType === HashtagEntityType.CHECKLIST) {
      await prisma.nBAItem.update({
        where: { id: entityId },
        data: { hashtags: nextHashtags, updatedAt: new Date() },
      });
    } else {
      const updates = { hashtags: nextHashtags, updatedAt: new Date() };
      await prisma.product.updateMany({ where: { id: entityId }, data: updates });
      await prisma.customer.updateMany({ where: { id: entityId }, data: updates });
      await prisma.competitor.updateMany({ where: { id: entityId }, data: updates });
      await prisma.uploadedSourceFile.updateMany({ where: { id: entityId }, data: updates });
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

    return NextResponse.json({ success: true, hashtags: nextHashtags });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
