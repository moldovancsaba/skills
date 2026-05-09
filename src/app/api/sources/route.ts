import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db";
import { recordInteractionEventFromRequest } from "@/lib/audit-ledger";
import { normalizeHashtagList } from "@/lib/hashtags";
import { verifyMembership } from "@/lib/permissions";
import {
  ensureSourcePublicIds,
  nextSourcePublicId,
  TRANSACTION_SETTINGS,
} from "@/lib/source-public-ids";
import { ensureUnifiedSources } from "@/lib/sources";
import { deriveDataCardScoreProfile } from "@/lib/upstream-card-scoring";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const limitParam = request.nextUrl.searchParams.get("limit");
  const offsetParam = request.nextUrl.searchParams.get("offset");
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;
  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

  try {
    const limit = limitParam ? Number(limitParam) : null;
    const offset = offsetParam ? Number(offsetParam) : 0;
    const safeLimit = limit && Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : null;
    const safeOffset = Number.isFinite(offset) && offset > 0 ? offset : 0;

    const sources = await prisma.source.findMany({
      where: { companyId },
      orderBy: [{ publicId: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        publicId: true,
        content: true,
        hashtags: true,
        aiClusters: true,
        entityTag: true,
        createdAt: true,
        updatedAt: true,
        intelligenceType: true,
      },
      ...(safeLimit ? { skip: safeOffset, take: safeLimit } : {}),
    });
    const normalized = sources.map((source) => ({
        ...source,
        hashtags: normalizeHashtagList(source.hashtags),
        aiClusters: normalizeHashtagList(source.aiClusters),
      }));

    if (safeLimit) {
      const total = await prisma.source.count({ where: { companyId } });
      return NextResponse.json({
        items: normalized,
        total,
        hasMore: safeOffset + normalized.length < total,
      });
    }

    return NextResponse.json(normalized);
  } catch (error) {
    console.error("[API:SOURCES] Get failure:", error);
    // Iron-Clad: Never return a non-array crash object to the dashboard
    return NextResponse.json([]);
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const companyId = typeof data.companyId === "string" ? data.companyId : "";
    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;
    const content = typeof data.content === "string" ? data.content.trim() : "";

    if (!companyId || !content) {
      return NextResponse.json({ error: "companyId and content required" }, { status: 400 });
    }

    const created = await prisma.$transaction(async (tx) => {
      const publicId = await nextSourcePublicId(tx);
      const scoreProfile = deriveDataCardScoreProfile({
        content,
        hashtags: normalizeHashtagList(data.hashtags),
        entityTag: typeof data.entityTag === "string" && data.entityTag.trim() ? data.entityTag.trim() : null,
        aiClusters: normalizeHashtagList(data.aiClusters),
        metadata: data.metadata ?? null,
        intelligenceType: data.intelligenceType === "COMPETITOR" ? "COMPETITOR" : "INTERNAL",
      });
      return tx.source.create({
        data: {
          companyId,
          publicId,
          content,
          hashtags: normalizeHashtagList(data.hashtags),
          entityTag: typeof data.entityTag === "string" && data.entityTag.trim() ? data.entityTag.trim() : null,
          aiClusters: normalizeHashtagList(data.aiClusters),
          metadata: data.metadata ?? null,
          intelligenceType: data.intelligenceType === "COMPETITOR" ? "COMPETITOR" : "INTERNAL",
          confidence: scoreProfile.confidence,
          confidenceScore: scoreProfile.confidence,
          impact: scoreProfile.impact,
          weight: scoreProfile.weight,
          iceScore: scoreProfile.iceScore,
        },
      });
    }, TRANSACTION_SETTINGS);

    await recordInteractionEventFromRequest(request, {
      companyId,
      surface: "data-ingress",
      interactionType: "INGRESS_TEXT_CAPTURE",
      entityType: "SOURCE",
      entityId: created.id,
      afterState: {
        intelligenceType: created.intelligenceType,
        hashtags: created.hashtags,
      },
      payload: {
        entityTag: created.entityTag,
      },
      teachingWeight: 30,
    });

    return NextResponse.json(created);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const data = await request.json();
    const existing = await prisma.source.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const auth = await verifyMembership(request, existing.companyId);
    if (auth.error) return auth.error;

    const nextData = {
      content: typeof data.content === "string" ? data.content.trim() || existing.content : existing.content,
      hashtags: data.hashtags !== undefined ? normalizeHashtagList(data.hashtags) : existing.hashtags,
      entityTag:
        data.entityTag !== undefined
          ? (typeof data.entityTag === "string" && data.entityTag.trim() ? data.entityTag.trim() : null)
          : existing.entityTag,
      aiClusters: data.aiClusters !== undefined ? normalizeHashtagList(data.aiClusters) : existing.aiClusters,
      metadata: data.metadata !== undefined ? data.metadata : existing.metadata,
      intelligenceType: data.intelligenceType === "COMPETITOR" || data.intelligenceType === "INTERNAL" ? data.intelligenceType : existing.intelligenceType,
    };
    const scoreProfile = deriveDataCardScoreProfile(nextData);

    const updated = await prisma.source.update({
      where: { id },
      data: {
        ...nextData,
        confidence: scoreProfile.confidence,
        confidenceScore: scoreProfile.confidence,
        impact: scoreProfile.impact,
        weight: scoreProfile.weight,
        iceScore: scoreProfile.iceScore,
      },
    });

    await recordInteractionEventFromRequest(request, {
      companyId: existing.companyId,
      surface: "datacard",
      interactionType: "DATACARD_EDIT",
      entityType: "SOURCE",
      entityId: existing.id,
      beforeState: {
        content: existing.content,
        hashtags: existing.hashtags,
        intelligenceType: existing.intelligenceType,
      },
      afterState: {
        content: updated.content,
        hashtags: updated.hashtags,
        intelligenceType: updated.intelligenceType,
      },
      teachingWeight: 40,
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const existing = await prisma.source.findUnique({
      where: { id },
      select: { companyId: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const auth = await verifyMembership(request, existing.companyId);
    if (auth.error) return auth.error;
    await recordInteractionEventFromRequest(request, {
      companyId: existing.companyId,
      surface: "datacard",
      interactionType: "DATACARD_DELETE",
      entityType: "SOURCE",
      entityId: id,
      beforeState: existing,
      teachingWeight: 35,
    });
    await prisma.source.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
