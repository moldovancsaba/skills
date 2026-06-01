import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db";
import { recordInteractionEventFromRequest } from "@/lib/audit-ledger";
import { decorateWithBoardState, SURFACE_BOARD_CONFIG, updateBoardEntityState } from "@/lib/board-state";
import { verifyMembership } from "@/lib/permissions";

function normalizeTopicLabel(value: unknown) {
  return String(value || "").trim();
}

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  try {
    const topics = await prisma.topic.findMany({
      where: { companyId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json(await decorateWithBoardState(companyId, SURFACE_BOARD_CONFIG.topics, topics));
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
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

    const label = normalizeTopicLabel(data.label);
    if (!companyId || !label) {
      return NextResponse.json({ error: "companyId and label required" }, { status: 400 });
    }

    const maxTopic = await prisma.topic.findFirst({
      where: { companyId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    const created = await prisma.topic.create({
      data: {
        companyId,
        label,
        active: data.active !== false,
        sortOrder: (maxTopic?.sortOrder ?? -1) + 1,
        notes: typeof data.notes === "string" ? data.notes.trim() || null : null,
        hashtags: Array.isArray(data.hashtags) ? data.hashtags.filter((item: unknown): item is string => typeof item === "string") : [],
      },
    });

    await recordInteractionEventFromRequest(request, {
      companyId,
      surface: "topics",
      interactionType: "TOPIC_CREATE",
      entityType: "TOPIC",
      entityId: created.id,
      afterState: {
        label: created.label,
        active: created.active,
        sortOrder: created.sortOrder,
      },
      teachingWeight: 75,
    });

    return NextResponse.json(created);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    const dataRaw = await request.json().catch(() => ({}));
    if (!dataRaw || typeof dataRaw !== "object" || Array.isArray(dataRaw)) {
      return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
    }
    const data = dataRaw as Record<string, any>;
    const existing = await prisma.topic.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }

    const auth = await verifyMembership(request, existing.companyId);
    if (auth.error) return auth.error;

    if (typeof data.destinationColumn === "string") {
      const updatedBoardState = await updateBoardEntityState({
        companyId: existing.companyId,
        config: SURFACE_BOARD_CONFIG.topics,
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
      label: data.label !== undefined ? normalizeTopicLabel(data.label) : existing.label,
      active: data.active !== undefined ? Boolean(data.active) : existing.active,
      sortOrder: data.sortOrder !== undefined ? Number(data.sortOrder) : existing.sortOrder,
      notes: data.notes !== undefined ? (typeof data.notes === "string" ? data.notes.trim() || null : null) : existing.notes,
      hashtags: data.hashtags !== undefined && Array.isArray(data.hashtags)
        ? data.hashtags.filter((item: unknown): item is string => typeof item === "string")
        : existing.hashtags,
    };
    const updated = await prisma.topic.update({
      where: { id },
      data: {
        ...nextData,
      },
    });

    await recordInteractionEventFromRequest(request, {
      companyId: existing.companyId,
      surface: "topics",
      interactionType:
        data.active !== undefined
          ? "TOPIC_TOGGLE_ACTIVE"
          : data.sortOrder !== undefined
            ? "TOPIC_DRAG_REORDER"
            : "TOPIC_EDIT",
      entityType: "TOPIC",
      entityId: existing.id,
      beforeState: {
        label: existing.label,
        active: existing.active,
        sortOrder: existing.sortOrder,
        notes: existing.notes,
      },
      afterState: {
        label: updated.label,
        active: updated.active,
        sortOrder: updated.sortOrder,
        notes: updated.notes,
      },
      teachingWeight: data.active !== undefined ? 80 : data.sortOrder !== undefined ? 70 : 40,
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    const existing = await prisma.topic.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }

    const auth = await verifyMembership(request, existing.companyId);
    if (auth.error) return auth.error;

    await recordInteractionEventFromRequest(request, {
      companyId: existing.companyId,
      surface: "topics",
      interactionType: "TOPIC_ARCHIVE",
      entityType: "TOPIC",
      entityId: existing.id,
      beforeState: existing,
      teachingWeight: 65,
    });

    await prisma.topic.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
