import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readAppSession } from "@/lib/auth";
import { normalizeHashtag } from "@/lib/hashtags";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await readAppSession(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const companyId = request.nextUrl.searchParams.get("companyId");
    if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

    // Verify membership
    const member = await prisma.user.findFirst({ where: { companyId, email: session.email } });
    if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const [sources, files] = await Promise.all([
      prisma.source.findMany({ where: { companyId }, select: { content: true, entityTag: true } }),
      prisma.uploadedSourceFile.findMany({ where: { companyId }, select: { name: true, entityTag: true } }),
    ]);

    const entitySet = new Set<string>();

    // Add normalized names as suggested entity tags
    [...sources.map(({ content, entityTag }) => ({ name: content, entityTag })), ...files].forEach(({ name, entityTag }) => {
      const normalized = normalizeHashtag(name.split("\n")[0] || name);
      if (normalized) entitySet.add(normalized);
      if (entityTag) entitySet.add(entityTag);
    });

    return NextResponse.json(Array.from(entitySet).sort());
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
