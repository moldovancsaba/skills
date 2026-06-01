import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { DepartmentKey, type SourceProcessingStatus } from "@prisma/client";

import { prisma } from "@/lib/db";
import { recordInteractionEventFromRequest } from "@/lib/audit-ledger";
import { decorateWithBoardState, SURFACE_BOARD_CONFIG, updateBoardEntityState } from "@/lib/board-state";
import { normalizeHashtagList } from "@/lib/hashtags";
import { verifyMembership } from "@/lib/permissions";
import {
  ensureSourcePublicIds,
  nextSourcePublicId,
  TRANSACTION_SETTINGS,
} from "@/lib/source-public-ids";
import { buildSourceLifecycleData } from "@/lib/source-contract";
import { ensureUnifiedSources } from "@/lib/sources";

function normalizeDepartmentKey(value: unknown): DepartmentKey | null {
  if (typeof value !== "string") return null;
  return Object.values(DepartmentKey).includes(value as DepartmentKey) ? value as DepartmentKey : null;
}

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const limitParam = request.nextUrl.searchParams.get("limit");
  const offsetParam = request.nextUrl.searchParams.get("offset");
  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

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
        departmentKey: true,
        createdAt: true,
        updatedAt: true,
        processingStatus: true,
        intelligenceType: true,
      },
      ...(safeLimit ? { skip: safeOffset, take: safeLimit } : {}),
    });
    const normalized = sources.map((source) => ({
        ...source,
        hashtags: normalizeHashtagList(source.hashtags),
        aiClusters: normalizeHashtagList(source.aiClusters),
      }));

    const decorated = await decorateWithBoardState(companyId, SURFACE_BOARD_CONFIG.data, normalized);

    if (safeLimit) {
      const total = await prisma.source.count({ where: { companyId } });
      return NextResponse.json({
        items: decorated,
        total,
        hasMore: safeOffset + decorated.length < total,
      });
    }

    return NextResponse.json(decorated);
  } catch (error) {
    console.error("[API:SOURCES] Get failure:", error);
    // Iron-Clad: Never return a non-array crash object to the dashboard
    return NextResponse.json([]);
  }
}

export async function POST(request: NextRequest) {
  try {
    const dataRaw = await request.json().catch(() => ({}));
    if (!dataRaw || typeof dataRaw !== "object" || Array.isArray(dataRaw)) {
      return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
    }
    const data = dataRaw as Record<string, any>;
    const companyId = typeof data.companyId === "string" ? data.companyId : "";
    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;
    const content = typeof data.content === "string" ? data.content.trim() : "";

    if (!companyId || !content) {
      return NextResponse.json({ error: "companyId and content required" }, { status: 400 });
    }

    const created = await prisma.$transaction(async (tx) => {
      const publicId = await nextSourcePublicId(tx);
      const lifecycleData = buildSourceLifecycleData({
        content,
        provenance: typeof data.provenance === "string" ? data.provenance : null,
        sourceType: typeof data.sourceType === "string" ? data.sourceType : "MANUAL",
        metadata: data.metadata ?? null,
      });
      return tx.source.create({
        data: {
          companyId,
          publicId,
          content,
          canonicalContent: lifecycleData.canonicalContent,
          canonicalContentHash: lifecycleData.canonicalContentHash,
          processingStatus: lifecycleData.processingStatus as SourceProcessingStatus,
          hashtags: normalizeHashtagList(data.hashtags),
          entityTag: typeof data.entityTag === "string" && data.entityTag.trim() ? data.entityTag.trim() : null,
          aiClusters: normalizeHashtagList(data.aiClusters),
          metadata: data.metadata ?? null,
          provenance: typeof data.provenance === "string" ? data.provenance : null,
          sourceType: typeof data.sourceType === "string" ? data.sourceType : "MANUAL",
          intelligenceType: data.intelligenceType === "COMPETITOR" ? "COMPETITOR" : "INTERNAL",
          departmentKey: normalizeDepartmentKey(data.departmentKey),
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
        departmentKey: created.departmentKey,
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
    const dataRaw = await request.json().catch(() => ({}));
    if (!dataRaw || typeof dataRaw !== "object" || Array.isArray(dataRaw)) {
      return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
    }
    const data = dataRaw as Record<string, any>;
    const existing = await prisma.source.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const auth = await verifyMembership(request, existing.companyId);
    if (auth.error) return auth.error;

    if (typeof data.destinationColumn === "string") {
      const updatedBoardState = await updateBoardEntityState({
        companyId: existing.companyId,
        config: SURFACE_BOARD_CONFIG.data,
        entityId: existing.id,
        destinationColumn: data.destinationColumn,
        beforeId: typeof data.beforeId === "string" ? data.beforeId : null,
        afterId: typeof data.afterId === "string" ? data.afterId : null,
      });
      return NextResponse.json({
        ...existing,
        boardState: {
          boardKey: updatedBoardState.boardKey,
          entityType: updatedBoardState.entityType,
          columnKey: updatedBoardState.columnKey,
          orderRank: Number(updatedBoardState.orderRank ?? 0),
          priority: Number(updatedBoardState.priority ?? 0),
        },
      });
    }

    const nextData = {
      content: typeof data.content === "string" ? data.content.trim() || existing.content : existing.content,
      hashtags: data.hashtags !== undefined ? normalizeHashtagList(data.hashtags) : existing.hashtags,
      entityTag:
        data.entityTag !== undefined
          ? (typeof data.entityTag === "string" && data.entityTag.trim() ? data.entityTag.trim() : null)
          : existing.entityTag,
      aiClusters: data.aiClusters !== undefined ? normalizeHashtagList(data.aiClusters) : existing.aiClusters,
      metadata: data.metadata !== undefined ? data.metadata : existing.metadata,
      provenance: data.provenance !== undefined ? data.provenance : existing.provenance,
      sourceType: data.sourceType !== undefined ? data.sourceType : existing.sourceType,
      intelligenceType: data.intelligenceType === "COMPETITOR" || data.intelligenceType === "INTERNAL" ? data.intelligenceType : existing.intelligenceType,
      departmentKey: data.departmentKey !== undefined ? normalizeDepartmentKey(data.departmentKey) : existing.departmentKey,
    };
    const lifecycleData = buildSourceLifecycleData({
      ...existing,
      ...nextData,
    });
    const updated = await prisma.source.update({
      where: { id },
      data: {
        ...nextData,
        canonicalContent: lifecycleData.canonicalContent,
        canonicalContentHash: lifecycleData.canonicalContentHash,
        processingStatus: lifecycleData.processingStatus as SourceProcessingStatus,
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
        departmentKey: existing.departmentKey,
      },
      afterState: {
        content: updated.content,
        hashtags: updated.hashtags,
        intelligenceType: updated.intelligenceType,
        departmentKey: updated.departmentKey,
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
