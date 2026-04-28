/**
 * Bridge Ingress API
 * v2.0.0 — Ground Truth Hardening
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { nextSourcePublicId, TRANSACTION_SETTINGS } from "@/lib/source-public-ids";
import crypto from "crypto";

export const dynamic = 'force-dynamic';

function verifyHmac(payload: any, signature: string, secret: string) {
  const hmac = crypto.createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex");
  return hmac === signature;
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const signature = request.headers.get("x-bridge-signature");
    const timestamp = request.headers.get("x-bridge-timestamp");
    const companyId = request.headers.get("x-company-id");

    if (!signature || !timestamp || !companyId) {
      return NextResponse.json({ error: "Missing security headers (v2.0.0)" }, { status: 401 });
    }

    // 1. Clock Consistency: Timestamp Window (5 minutes)
    const now = Date.now();
    const reqTime = parseInt(timestamp, 10);
    if (Math.abs(now - reqTime) > 5 * 60 * 1000) {
      return NextResponse.json({ error: "Request outside 5-minute window" }, { status: 403 });
    }

    // 2. Identify and Validate Secret (v2.0.0 uses hashed secrets)
    const settings = await prisma.communicationSettings.findUnique({
      where: { companyId },
      include: { company: true }
    });

    if (!settings || !settings.isEnabled || !settings.bridgeSecretHash) {
      return NextResponse.json({ error: "Bridge unavailable or misconfigured" }, { status: 403 });
    }

    // 3. HMAC Verification
    // Note: In v2.0.0, we verify against the raw secret provided in a secure way 
    // OR we use the hash as a salt. For simplicity in this LLD context:
    if (!verifyHmac(data, signature, settings.bridgeSecretHash)) {
      return NextResponse.json({ error: "Signature mismatch" }, { status: 401 });
    }

    const content = typeof data.text === "string" ? data.text.trim() : "";
    const sender = typeof data.sender === "string" ? data.sender.trim() : "unknown-bridge";

    if (!content) {
      return NextResponse.json({ error: "Empty content ignored" }, { status: 400 });
    }

    // 4. Atomic Ingestion
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
            v: "2.0.0"
          }
        },
      });
    }, TRANSACTION_SETTINGS);

    return NextResponse.json({
      success: true,
      sourceId: created.id,
      publicId: created.publicId
    });
  } catch (error) {
    console.error("[Bridge Inbound Error]:", error);
    return NextResponse.json({ error: "Internal security failure" }, { status: 500 });
  }
}
