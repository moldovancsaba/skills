import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { syncCompanyKnowledge } from "@/lib/flashcards";
import { normalizeSourceHashtags } from "@/lib/hashtags";
import {
  ensureSourcePublicIds,
  nextSourcePublicId,
  TRANSACTION_SETTINGS,
} from "@/lib/source-public-ids";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function parseHashtags(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  try {
    await ensureSourcePublicIds(companyId as string);
    const files = await prisma.uploadedSourceFile.findMany({
      where: { companyId: companyId as string },
      orderBy: [{ publicId: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        publicId: true,
        companyId: true,
        name: true,
        hashtags: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(files);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const companyId = formData.get("companyId");

    if (typeof companyId !== "string" || !companyId) {
      return NextResponse.json({ error: "companyId required" }, { status: 400 });
    }

    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;

    const hashtags = normalizeSourceHashtags(
      parseHashtags(formData.get("hashtags")),
      "product",
    );
    const entries = formData.getAll("files");

    const files = entries.filter((entry): entry is File => entry instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "At least one file required" }, { status: 400 });
    }

    const created = await prisma.$transaction(async (tx) => {
      const results = [];

      for (const file of files) {
        if (file.size > MAX_FILE_SIZE_BYTES) {
          throw new Error(`File too large: ${file.name}`);
        }

        const publicId = await nextSourcePublicId(tx);
        const arrayBuffer = await file.arrayBuffer();

        const saved = await tx.uploadedSourceFile.create({
          data: {
            publicId,
            companyId,
            name: file.name,
            hashtags,
            mimeType: file.type || "application/octet-stream",
            sizeBytes: file.size,
            content: Buffer.from(arrayBuffer),
          },
          select: {
            id: true,
            publicId: true,
            companyId: true,
            name: true,
            hashtags: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        results.push(saved);
      }

      return results;
    }, TRANSACTION_SETTINGS);

    await syncCompanyKnowledge(companyId);
    return NextResponse.json(created);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.startsWith("File too large") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");

  try {
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const existing = await prisma.uploadedSourceFile.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const auth = await verifyMembership(request, existing.companyId);
    if (auth.error) return auth.error;

    await prisma.uploadedSourceFile.delete({ where: { id } });
    await syncCompanyKnowledge(existing.companyId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
