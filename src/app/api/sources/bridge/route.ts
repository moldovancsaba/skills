import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyIngestSecret } from "@/lib/ingest-auth";
import { normalizeHashtagList } from "@/lib/hashtags";
import { nextSourcePublicId, TRANSACTION_SETTINGS } from "@/lib/source-public-ids";

export const dynamic = "force-dynamic";

/**
 * CRM Context Bridge API (NBA 4)
 * Specialized ingestor for structured customer and sales data.
 */
export async function POST(request: NextRequest) {
  const auth = await verifyIngestSecret(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const items = Array.isArray(body) ? body : [body];
    const results = [];

    for (const item of items) {
      const { 
        companyId, 
        customerName, 
        note, 
        painPoint, 
        opportunityValue, 
        tags 
      } = item;

      if (!companyId || (!note && !painPoint)) {
        results.push({ success: false, error: "companyId and (note or painPoint) required", item });
        continue;
      }

      const content = [
        customerName ? `Customer: ${customerName}` : "",
        painPoint ? `Pain Point: ${painPoint}` : "",
        note ? `Note: ${note}` : "",
        opportunityValue ? `Opp Value: ${opportunityValue}` : ""
      ].filter(Boolean).join("\n");

      const hashtags = normalizeHashtagList([...(tags || []), "crm-context", "high-priority"]);

      const created = await prisma.$transaction(async (tx) => {
        const publicId = await nextSourcePublicId(tx);
        return tx.source.create({
          data: {
            companyId,
            publicId,
            content,
            hashtags,
            sourceType: "BRIDGE",
            provenance: "crm-bridge",
            metadata: {
              customerName,
              opportunityValue,
              isContextSignal: true
            },
            freshnessWindowDays: 60 // Context signals last longer
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
    console.error("[API:BRIDGE] Failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
