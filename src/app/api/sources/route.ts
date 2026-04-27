import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db";
import { normalizeHashtagList } from "@/lib/hashtags";
import { verifyMembership } from "@/lib/permissions";
import {
  ensureSourcePublicIds,
  nextSourcePublicId,
  TRANSACTION_SETTINGS,
} from "@/lib/source-public-ids";
import { ensureUnifiedSources } from "@/lib/sources";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;
  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

  try {
    const sources = await prisma.source.findMany({
      where: { companyId },
      orderBy: [{ publicId: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json(
      sources.map((source) => ({
        ...source,
        hashtags: normalizeHashtagList(source.hashtags),
        aiClusters: normalizeHashtagList(source.aiClusters),
      })),
    );
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
      return tx.source.create({
        data: {
          companyId,
          publicId,
          content,
          hashtags: normalizeHashtagList(data.hashtags),
          entityTag: typeof data.entityTag === "string" && data.entityTag.trim() ? data.entityTag.trim() : null,
          aiClusters: normalizeHashtagList(data.aiClusters),
          metadata: data.metadata ?? null,
        },
      });
    }, TRANSACTION_SETTINGS);

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

    const updated = await prisma.source.update({
      where: { id },
      data: {
        content: typeof data.content === "string" ? data.content.trim() || existing.content : existing.content,
        hashtags: data.hashtags !== undefined ? normalizeHashtagList(data.hashtags) : existing.hashtags,
        entityTag:
          data.entityTag !== undefined
            ? (typeof data.entityTag === "string" && data.entityTag.trim() ? data.entityTag.trim() : null)
            : existing.entityTag,
        aiClusters: data.aiClusters !== undefined ? normalizeHashtagList(data.aiClusters) : existing.aiClusters,
        metadata: data.metadata !== undefined ? data.metadata : existing.metadata,
      },
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
    await prisma.source.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
