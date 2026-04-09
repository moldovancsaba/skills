import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import {
  ensureSourcePublicIds,
  nextSourcePublicId,
  TRANSACTION_SETTINGS,
} from "@/lib/source-public-ids";
import { normalizeSourceHashtags } from "@/lib/hashtags";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;
  
  try {
    await ensureSourcePublicIds(companyId ?? undefined);
    const customers = await prisma.customer.findMany({
      where: { companyId: companyId as string },
      orderBy: [{ publicId: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json(
      customers.map((customer) => ({
        ...customer,
        hashtags: normalizeSourceHashtags(customer.hashtags, "customer"),
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
    
    const customer = await prisma.$transaction(async (tx) => {
      const publicId = await nextSourcePublicId(tx);

      return tx.customer.create({
        data: {
          publicId,
          company: { connect: { id: data.companyId } },
          name: data.name,
          hashtags: normalizeSourceHashtags(data.hashtags, "customer"),
          entityTag: data.entityTag ?? null,
          email: data.email,
          segments: data.segments || [],
          painPoints: data.painPoints || [],
          channels: data.channels || [],
          lifetimeValue: data.lifetimeValue ?? 0,
          notes: data.notes,
          updatedAt: new Date(),
        },
      });
    }, TRANSACTION_SETTINGS);

    return NextResponse.json(customer);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const data = await request.json();
    const existing = await prisma.customer.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const auth = await verifyMembership(request, existing.companyId);
    if (auth.error) return auth.error;

    const customer = await prisma.customer.update({
      where: { id },
      data: {
        name: data.name ?? existing.name,
        hashtags: normalizeSourceHashtags(data.hashtags ?? existing.hashtags, "customer"),
        entityTag: data.entityTag !== undefined ? data.entityTag : existing.entityTag,
        email: data.email ?? existing.email,
        segments: data.segments ?? existing.segments,
        painPoints: data.painPoints ?? existing.painPoints,
        channels: data.channels ?? existing.channels,
        lifetimeValue: data.lifetimeValue ?? existing.lifetimeValue,
        notes: data.notes ?? existing.notes,
      },
    });
    return NextResponse.json(customer);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  
  try {
    const existing = await prisma.customer.findUnique({
      where: { id },
      select: { companyId: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const auth = await verifyMembership(request, existing.companyId);
    if (auth.error) return auth.error;

    await prisma.customer.delete({ where: { id } });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
