import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import {
  ensureSourcePublicIds,
  nextSourcePublicId,
  TRANSACTION_SETTINGS,
} from "@/lib/source-public-ids";
import {
  prepareRawSourceInput,
} from "@/lib/url-enrichment";
import { normalizeSourceHashtags } from "@/lib/hashtags";
import { syncCompanyKnowledge } from "@/lib/flashcards";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const auth = await verifyMembership(request, companyId ?? undefined);
  if (auth.error) return auth.error;
  
  try {
    await ensureSourcePublicIds(companyId ?? undefined);
    const where = companyId ? { companyId } : {};
    const competitors = await prisma.competitor.findMany({
      where,
      orderBy: [{ publicId: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json(
      competitors.map((competitor) => ({
        ...competitor,
        hashtags: normalizeSourceHashtags(competitor.hashtags, "competitor"),
      })),
    );
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const auth = await verifyMembership(request, data.companyId);
    if (auth.error) return auth.error;

    const raw = prepareRawSourceInput(data.name ?? "", data.urls || []);
    
    const competitor = await prisma.$transaction(async (tx) => {
      const publicId = await nextSourcePublicId(tx);

      return tx.competitor.create({
        data: {
          publicId,
          company: { connect: { id: data.companyId } },
          name: raw.name,
          hashtags: normalizeSourceHashtags(data.hashtags, "competitor"),
          entityTag: data.entityTag ?? null,
          urls: raw.urls,
          pricing: data.pricing ?? null,
          strengths: data.strengths || [],
          weaknesses: data.weaknesses || [],
          positioning: data.positioning ?? null,
          watchedContent: data.watchedContent || null,
          updatedAt: new Date(),
        },
      });
    }, TRANSACTION_SETTINGS);

    await syncCompanyKnowledge(competitor.companyId);
    
    return NextResponse.json(competitor);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  
  try {
    const data = await request.json();
    const existing = await prisma.competitor.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const auth = await verifyMembership(request, existing.companyId);
    if (auth.error) return auth.error;

    const raw = prepareRawSourceInput(
      data.name ?? existing.name,
      data.urls ?? existing.urls,
    );

    const competitor = await prisma.competitor.update({
      where: { id },
      data: {
        name: raw.name,
        hashtags: normalizeSourceHashtags(data.hashtags ?? existing.hashtags, "competitor"),
        entityTag: data.entityTag !== undefined ? data.entityTag : existing.entityTag,
        urls: raw.urls,
        pricing: data.pricing ?? existing.pricing,
        strengths: data.strengths ?? existing.strengths,
        weaknesses: data.weaknesses ?? existing.weaknesses,
        positioning: data.positioning ?? existing.positioning,
        watchedContent: data.watchedContent !== undefined
          ? (data.watchedContent || null)
          : existing.watchedContent,
      },
    });
    await syncCompanyKnowledge(competitor.companyId);
    return NextResponse.json(competitor);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  
  try {
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const existing = await prisma.competitor.findUnique({
      where: { id },
      select: { companyId: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const auth = await verifyMembership(request, existing.companyId);
    if (auth.error) return auth.error;

    await prisma.competitor.delete({ where: { id } });
    if (existing?.companyId) {
      await syncCompanyKnowledge(existing.companyId);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
