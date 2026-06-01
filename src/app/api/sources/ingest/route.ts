import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyIngestSecret } from "@/lib/ingest-auth";
import { normalizeHashtagList } from "@/lib/hashtags";
import { buildSourceLifecycleData } from "@/lib/source-contract";
import { nextSourcePublicId, TRANSACTION_SETTINGS } from "@/lib/source-public-ids";
import type { SourceProcessingStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * Programmatic ingress API
 * Allows external systems to push raw intelligence sources.
 */
export async function POST(request: NextRequest) {
  const auth = await verifyIngestSecret(request);
  if (auth.error) return auth.error;

  try {
    const rawBody = await request.json().catch(() => null);
    if (!rawBody || (typeof rawBody !== "object" && !Array.isArray(rawBody))) {
      return NextResponse.json({ error: "JSON object or array body is required" }, { status: 400 });
    }
    
    // Support both single object and array for batch ingestion
    const items = Array.isArray(rawBody) ? rawBody : [rawBody];
    const results = [];

    for (const item of items) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        results.push({ success: false, error: "Each item must be a JSON object", item });
        continue;
      }
      const { companyId, content, hashtags, provenance, metadata } = item;

      if (!companyId || !content) {
        results.push({ success: false, error: "companyId and content required", item });
        continue;
      }

      // Verify company exists
      const company = await prisma.company.findUnique({ where: { id: companyId } });
      if (!company) {
        results.push({ success: false, error: `Company ${companyId} not found`, item });
        continue;
      }

      const created = await prisma.$transaction(async (tx) => {
        const publicId = await nextSourcePublicId(tx);
        const normalizedHashtags = normalizeHashtagList(hashtags || []);
        const lifecycleData = buildSourceLifecycleData({
          content,
          provenance: provenance || "api-ingress",
          sourceType: "BRIDGE",
          metadata: metadata || null,
        });
        return tx.source.create({
          data: {
            companyId,
            publicId,
            content,
            canonicalContent: lifecycleData.canonicalContent,
            canonicalContentHash: lifecycleData.canonicalContentHash,
            processingStatus: lifecycleData.processingStatus as SourceProcessingStatus,
            hashtags: normalizedHashtags,
            sourceType: "BRIDGE",
            provenance: provenance || "api-ingress",
            metadata: metadata || null,
          },
        });
      }, TRANSACTION_SETTINGS);

      results.push({ success: true, id: created.id, publicId: created.publicId });
    }

    return NextResponse.json({
      processed: items.length,
      results
    });

  } catch (error) {
    console.error("[API:INGEST] Failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
