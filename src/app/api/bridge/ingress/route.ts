/**
 * Bridge Ingress API
 * v2.0.0 — Ground Truth Hardening
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { nextSourcePublicId, TRANSACTION_SETTINGS } from "@/lib/source-public-ids";
import crypto from "crypto";

export const dynamic = 'force-dynamic';

function hashBridgeSecret(secret: string) {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

function isHashedBridgeSecret(secret: string | null | undefined) {
  return Boolean(secret && /^[a-f0-9]{64}$/i.test(secret));
}

function timingSafeHexEqual(leftHex: string, rightHex: string) {
  const left = Buffer.from(leftHex, "hex");
  const right = Buffer.from(rightHex, "hex");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function verifyBridgeSecret(secret: string, storedSecret: string) {
  const providedHash = hashBridgeSecret(secret);
  const storedHash = isHashedBridgeSecret(storedSecret) ? storedSecret : hashBridgeSecret(storedSecret);
  return timingSafeHexEqual(providedHash, storedHash);
}

function verifyLegacyHmac(payload: unknown, signature: string, secret: string) {
  const expected = crypto.createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex");
  return timingSafeHexEqual(expected, signature);
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const bridgeSecret = request.headers.get("x-bridge-secret");
    const signature = request.headers.get("x-bridge-signature");
    const timestamp = request.headers.get("x-bridge-timestamp");
    const companyId = request.headers.get("x-company-id");

    if (!signature || !timestamp || !companyId) {
      return NextResponse.json({ error: "Missing security headers (v2.0.0)" }, { status: 401 });
    }

    // 1. Clock Consistency: Timestamp Window (15 minutes)
    const now = Date.now();
    const reqTime = parseInt(timestamp, 10);
    if (Math.abs(now - reqTime) > 15 * 60 * 1000) {
      return NextResponse.json({ error: "Request outside 15-minute window" }, { status: 403 });
    }

    // 2. Identify and Validate Secret
    const settings = await prisma.communicationSettings.findUnique({
      where: { companyId },
      include: { company: true }
    });

    if (!settings || !settings.isEnabled || !settings.bridgeSecretHash) {
      return NextResponse.json({ error: "Bridge unavailable or misconfigured" }, { status: 403 });
    }

    const storedSecret = settings.bridgeSecretHash;
    const hasModernSecret = typeof bridgeSecret === "string" && bridgeSecret.length > 0;
    const hasLegacySignature = typeof signature === "string" && signature.length > 0;

    if (hasModernSecret) {
      if (!verifyBridgeSecret(bridgeSecret, storedSecret)) {
        return NextResponse.json({ error: "Bridge key rejected" }, { status: 401 });
      }
    } else if (hasLegacySignature && !isHashedBridgeSecret(storedSecret)) {
      if (!verifyLegacyHmac(data, signature, storedSecret)) {
        return NextResponse.json({ error: "Signature mismatch" }, { status: 401 });
      }
    } else {
      return NextResponse.json({ error: "Missing or incompatible bridge authentication" }, { status: 401 });
    }

    const content = typeof data.text === "string" ? data.text.trim() : "";
    const sender = typeof data.sender === "string" ? data.sender.trim() : "unknown-bridge";

    if (!content) {
      return NextResponse.json({ error: "Empty content ignored" }, { status: 400 });
    }

    // 4. Atomic Ingestion
    const created = await prisma.$transaction(async (tx) => {
      const publicId = await nextSourcePublicId(tx);
      const persistedContent = `[Bridge Inbound from ${sender}]: ${content}`;
      return tx.source.create({
        data: {
          companyId,
          publicId,
          content: persistedContent,
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
