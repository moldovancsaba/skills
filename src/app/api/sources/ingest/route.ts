import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyIngestSecret } from "@/lib/ingest-auth";
import { normalizeHashtagList } from "@/lib/hashtags";
import { nextSourcePublicId, TRANSACTION_SETTINGS } from "@/lib/source-public-ids";
import { deriveDataCardScoreProfile } from "@/lib/upstream-card-scoring";

export const dynamic = "force-dynamic";

/**
 * Programmatic Ingress API (NBA 1)
 * Allows external systems to push raw intelligence sources.
 */
export async function POST(request: NextRequest) {
  const auth = await verifyIngestSecret(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    
    // Support both single object and array for batch ingestion
    const items = Array.isArray(body) ? body : [body];
    const results = [];

    for (const item of items) {
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
        const scoreProfile = deriveDataCardScoreProfile({
          content,
          hashtags: normalizedHashtags,
          metadata: metadata || null,
        });
        return tx.source.create({
          data: {
            companyId,
            publicId,
            content,
            confidence: scoreProfile.confidence,
            confidenceScore: scoreProfile.confidence,
            impact: scoreProfile.impact,
            weight: scoreProfile.weight,
            iceScore: scoreProfile.iceScore,
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
