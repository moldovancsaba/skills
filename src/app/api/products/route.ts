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

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;
  
  try {
    await ensureSourcePublicIds(companyId ?? undefined);
    const products = await prisma.product.findMany({
      where: { companyId: companyId as string },
      orderBy: [{ publicId: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json(
      products.map((product) => ({
        ...product,
        hashtags: normalizeSourceHashtags(product.hashtags, "product"),
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
    
    const product = await prisma.$transaction(async (tx) => {
      const publicId = await nextSourcePublicId(tx);

      return tx.product.create({
        data: {
          publicId,
          company: { connect: { id: data.companyId } },
          name: raw.name,
          hashtags: normalizeSourceHashtags(data.hashtags, "product"),
          entityTag: data.entityTag ?? null,
          description: data.description ?? null,
          pricing: data.pricing ?? null,
          features: data.features || [],
          urls: raw.urls,
          updatedAt: new Date(),
        },
      });
    }, TRANSACTION_SETTINGS);

    return NextResponse.json(product);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? undefined;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const existing = await prisma.product.findUnique({
      where: { id },
      select: { companyId: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const auth = await verifyMembership(request, existing.companyId);
    if (auth.error) return auth.error;

    await prisma.product.delete({ where: { id } });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const data = await request.json();
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const auth = await verifyMembership(request, existing.companyId);
    if (auth.error) return auth.error;

    const raw = prepareRawSourceInput(
      data.name ?? existing.name,
      data.urls ?? existing.urls,
    );

    const product = await prisma.product.update({
      where: { id },
      data: {
        name: raw.name,
        hashtags: normalizeSourceHashtags(data.hashtags ?? existing.hashtags, "product"),
        entityTag: data.entityTag !== undefined ? data.entityTag : existing.entityTag,
        description: data.description ?? existing.description,
        pricing: data.pricing ?? existing.pricing,
        features: data.features ?? existing.features,
        urls: raw.urls,
      },
    });
    return NextResponse.json(product);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
