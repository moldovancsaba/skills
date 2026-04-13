/**
 * Bridge Ingress API
 * Handles authenticated external data ingestion for the Checklist Marketing OS.
 * Maps inbound messages (iMessage, WhatsApp, etc.) to Source records.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeHashtagList } from "@/lib/hashtags";
import { nextSourcePublicId, TRANSACTION_SETTINGS } from "@/lib/source-public-ids";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const secret = data.secret || request.headers.get("x-bridge-secret");

    if (!secret) {
      return NextResponse.json({ error: "Missing identity secret" }, { status: 401 });
    }

    // Identify company via bridge secret
    const settings = await prisma.communicationSettings.findFirst({
      where: { bridgeSecret: secret },
      include: { company: true }
    });

    if (!settings || !settings.isEnabled) {
      return NextResponse.json({ error: "Invalid or inactive bridge" }, { status: 403 });
    }

    const companyId = settings.companyId;
    const content = typeof data.text === "string" ? data.text.trim() : "";
    const sender = typeof data.sender === "string" ? data.sender.trim() : "unknown-bridge";

    if (!content) {
      return NextResponse.json({ error: "Empty content ignored" }, { status: 400 });
    }

    // Ingest as Source
    const created = await prisma.$transaction(async (tx) => {
      const publicId = await nextSourcePublicId(tx);
      return tx.source.create({
        data: {
          companyId,
          publicId,
          content: `[Bridge Inbound from ${sender}]: ${content}`,
          entityTag: sender,
          hashtags: ["#bridge", "#inbound"],
          metadata: {
            bridgeChannel: settings.channel,
            senderVerified: settings.handle === sender,
            rawPayload: data
          }
        },
      });
    }, TRANSACTION_SETTINGS);

    return NextResponse.json({
      success: true,
      sourceId: created.id,
      publicId: created.publicId,
      message: "Data ingested into Checklist memory"
    });
  } catch (error) {
    console.error("[Bridge Inbound Error]:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
