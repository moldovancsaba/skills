import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/db";
import { recordInteractionEventFromRequest } from "@/lib/audit-ledger";
import { verifyMembership } from "@/lib/permissions";
import { normalizeSourceHashtags } from "@/lib/hashtags";
import {
  ensureSourcePublicIds,
  nextSourcePublicId,
  TRANSACTION_SETTINGS,
} from "@/lib/source-public-ids";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function stripUtf8Bom(value: string) {
  return value.replace(/^\uFEFF/, "");
}

function looksBinary(bytes: Uint8Array) {
  const sample = bytes.subarray(0, Math.min(bytes.length, 512));
  for (const byte of sample) {
    if (byte === 0) return true;
  }
  return false;
}

function isMarkdownLikeFile(name: string, mimeType: string) {
  const normalizedName = String(name || "").toLowerCase();
  const normalizedMime = String(mimeType || "").toLowerCase();
  return (
    normalizedMime === "text/markdown" ||
    normalizedMime === "text/x-markdown" ||
    normalizedName.endsWith(".md") ||
    normalizedName.endsWith(".markdown")
  );
}

function isPlainTextLikeFile(name: string, mimeType: string) {
  const normalizedName = String(name || "").toLowerCase();
  const normalizedMime = String(mimeType || "").toLowerCase();
  return (
    normalizedMime.startsWith("text/") ||
    normalizedName.endsWith(".txt") ||
    normalizedName.endsWith(".log") ||
    normalizedName.endsWith(".csv") ||
    normalizedName.endsWith(".tsv") ||
    normalizedName.endsWith(".json") ||
    normalizedName.endsWith(".yaml") ||
    normalizedName.endsWith(".yml") ||
    normalizedName.endsWith(".xml")
  );
}

function fileSizeLabel(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return "Unknown size";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function decodeUploadedFileBody(file: {
  name: string;
  mimeType: string;
  sizeBytes: number;
  content: Uint8Array | Buffer | null;
}) {
  if (!file.content || file.content.length === 0) {
    return `${file.mimeType || "file"} • ${fileSizeLabel(file.sizeBytes)}`;
  }

  if (!isMarkdownLikeFile(file.name, file.mimeType) && !isPlainTextLikeFile(file.name, file.mimeType)) {
    return `${file.mimeType || "file"} • ${fileSizeLabel(file.sizeBytes)}`;
  }

  const bytes = file.content instanceof Uint8Array ? file.content : new Uint8Array(file.content);
  if (looksBinary(bytes)) {
    return `${file.mimeType || "file"} • ${fileSizeLabel(file.sizeBytes)}`;
  }

  const decoded = stripUtf8Bom(Buffer.from(bytes).toString("utf8")).trim();
  return decoded || `${file.mimeType || "file"} • ${fileSizeLabel(file.sizeBytes)}`;
}

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
        confidence: true,
        confidenceScore: true,
        impact: true,
        weight: true,
        iceScore: true,
        hashtags: true,
        entityTag: true,
        mimeType: true,
        sizeBytes: true,
        content: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json(
      files.map((file) => ({
        ...file,
        body: decodeUploadedFileBody(file),
      })),
    );
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

    const hashtags = normalizeSourceHashtags(parseHashtags(formData.get("hashtags")));
    const entityTagRaw = formData.get("entityTag");
    const entityTag = typeof entityTagRaw === "string" && entityTagRaw.trim() ? entityTagRaw.trim() : null;
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
            entityTag,
            mimeType: file.type || "application/octet-stream",
            sizeBytes: file.size,
            content: Buffer.from(arrayBuffer),
          },
          select: {
            id: true,
            publicId: true,
            companyId: true,
            name: true,
            confidence: true,
            confidenceScore: true,
            impact: true,
            weight: true,
            iceScore: true,
            hashtags: true,
            entityTag: true,
            mimeType: true,
            sizeBytes: true,
            content: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        results.push({
          ...saved,
          body: decodeUploadedFileBody(saved),
        });
      }

      return results;
    }, TRANSACTION_SETTINGS);

    for (const file of created) {
      await recordInteractionEventFromRequest(request, {
        companyId,
        surface: "data-ingress",
        interactionType: "INGRESS_FILE_UPLOAD",
        entityType: "FILE",
        entityId: file.id,
        afterState: {
          name: file.name,
          hashtags: file.hashtags,
          sizeBytes: file.sizeBytes,
        },
        teachingWeight: 30,
      });
    }

    return NextResponse.json(created);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.startsWith("File too large") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const data = await request.json();
    const existing = await prisma.uploadedSourceFile.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const auth = await verifyMembership(request, existing.companyId);
    if (auth.error) return auth.error;

    const nextData = {
      name: data.name ?? existing.name,
      hashtags: normalizeSourceHashtags(data.hashtags ?? existing.hashtags),
      entityTag: data.entityTag !== undefined ? data.entityTag : existing.entityTag,
    };

    const file = await prisma.uploadedSourceFile.update({
      where: { id },
      data: {
        ...nextData,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        companyId: true,
        name: true,
        confidence: true,
        confidenceScore: true,
        impact: true,
        weight: true,
        iceScore: true,
        hashtags: true,
        entityTag: true,
        mimeType: true,
        sizeBytes: true,
        updatedAt: true,
        content: true,
      },
    });

    await recordInteractionEventFromRequest(request, {
      companyId: existing.companyId,
      surface: "datacard",
      interactionType: "DATACARD_EDIT",
      entityType: "FILE",
      entityId: existing.id,
      beforeState: {
        name: existing.name,
        hashtags: existing.hashtags,
        entityTag: existing.entityTag,
      },
      afterState: file,
      teachingWeight: 40,
    });

    return NextResponse.json({
      ...file,
      body: decodeUploadedFileBody(file),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
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

    await recordInteractionEventFromRequest(request, {
      companyId: existing.companyId,
      surface: "datacard",
      interactionType: "DATACARD_DELETE",
      entityType: "FILE",
      entityId: existing.id,
      beforeState: {
        name: existing.name,
        hashtags: existing.hashtags,
        sizeBytes: existing.sizeBytes,
      },
      teachingWeight: 35,
    });

    await prisma.uploadedSourceFile.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
