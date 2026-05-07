/**
 * Communication Settings API
 * Manages notification channels, bridge secrets, and ICE thresholds.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { recordInteractionEventFromRequest, recordOutcomeEvent } from "@/lib/audit-ledger";
import crypto from "crypto";

export const dynamic = 'force-dynamic';

function hashBridgeSecret(secret: string) {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

function isHashedBridgeSecret(secret: string | null | undefined) {
  return Boolean(secret && /^[a-f0-9]{64}$/i.test(secret));
}

function serializeSettings(settings: any, bridgeSecret?: string) {
  return {
    ...settings,
    bridgeSecret: bridgeSecret || "",
    bridgeSecretConfigured: Boolean(settings.bridgeSecretHash),
    bridgeSecretStoredHashed: isHashedBridgeSecret(settings.bridgeSecretHash),
  };
}

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  try {
    let settings = await prisma.communicationSettings.findUnique({
      where: { companyId },
    });

    if (!settings) {
      settings = await prisma.communicationSettings.create({
        data: {
          companyId,
          isEnabled: false,
          channel: "IMESSAGE",
        },
      });
    }

    return NextResponse.json(serializeSettings(settings));
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

  const auth = await verifyMembership(request, companyId, "ADMIN");
  if (auth.error) return auth.error;

  try {
    const data = await request.json();
    const existing = await prisma.communicationSettings.findUnique({
      where: { companyId },
    });
    const updated = await prisma.communicationSettings.upsert({
      where: { companyId },
      update: {
        channel: data.channel,
        handle: data.handle,
        isEnabled: data.isEnabled,
        minIceScore: data.minIceScore,
      },
      create: {
        companyId,
        channel: data.channel ?? "IMESSAGE",
        handle: data.handle,
        isEnabled: data.isEnabled ?? false,
        minIceScore: data.minIceScore ?? 600,
      },
    });

    await recordInteractionEventFromRequest(request, {
      companyId,
      surface: "settings-communication",
      interactionType: "COMMUNICATION_SETTINGS_UPDATE",
      entityType: "COMMUNICATION_SETTINGS",
      entityId: updated.id,
      beforeState: existing
        ? {
            channel: existing.channel,
            handle: existing.handle,
            isEnabled: existing.isEnabled,
            minIceScore: existing.minIceScore,
          }
        : null,
      afterState: {
        channel: updated.channel,
        handle: updated.handle,
        isEnabled: updated.isEnabled,
        minIceScore: updated.minIceScore,
      },
      payload: {
        changedFields: {
          channel: data.channel !== undefined,
          handle: data.handle !== undefined,
          isEnabled: data.isEnabled !== undefined,
          minIceScore: data.minIceScore !== undefined,
        },
      },
      teachingWeight: data.minIceScore !== undefined ? 35 : 30,
    });

    if (data.minIceScore !== undefined || data.channel !== undefined || data.handle !== undefined || data.isEnabled !== undefined) {
      await recordOutcomeEvent({
        companyId,
        actorType: "HUMAN",
        entityType: "COMMUNICATION_SETTINGS",
        entityId: updated.id,
        outcomeType: "SETTINGS_POLICY_CHANGED",
        outcomeValue: updated.channel,
        beforeState: existing
          ? {
              channel: existing.channel,
              handle: existing.handle,
              isEnabled: existing.isEnabled,
              minIceScore: existing.minIceScore,
            }
          : null,
        afterState: {
          channel: updated.channel,
          handle: updated.handle,
          isEnabled: updated.isEnabled,
          minIceScore: updated.minIceScore,
        },
        teachingWeight: data.minIceScore !== undefined ? 35 : 30,
      });
    }

    return NextResponse.json(serializeSettings(updated));
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // Use POST to regenerate bridge secret
  const companyId = request.nextUrl.searchParams.get("companyId");
  const action = request.nextUrl.searchParams.get("action");
  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

  const auth = await verifyMembership(request, companyId, "ADMIN");
  if (auth.error) return auth.error;

  try {
    if (action === "regenerate-secret") {
      const newSecret = crypto.randomUUID();
      const existing = await prisma.communicationSettings.findUnique({
        where: { companyId },
      });
      const updated = await prisma.communicationSettings.upsert({
        where: { companyId },
        update: { bridgeSecretHash: hashBridgeSecret(newSecret) },
        create: {
          companyId,
          channel: "IMESSAGE",
          isEnabled: false,
          minIceScore: 600,
          bridgeSecretHash: hashBridgeSecret(newSecret),
        },
      });

      await recordInteractionEventFromRequest(request, {
        companyId,
        surface: "settings-communication",
        interactionType: "BRIDGE_SECRET_ROTATE",
        entityType: "COMMUNICATION_SETTINGS",
        entityId: updated.id,
        beforeState: {
          bridgeSecretConfigured: Boolean(existing?.bridgeSecretHash),
        },
        afterState: {
          bridgeSecretConfigured: true,
          bridgeSecretStoredHashed: true,
        },
        teachingWeight: 30,
      });

      await recordOutcomeEvent({
        companyId,
        actorType: "HUMAN",
        entityType: "COMMUNICATION_SETTINGS",
        entityId: updated.id,
        outcomeType: "SECURITY_SECRET_ROTATED",
        outcomeValue: "BRIDGE_SECRET",
        teachingWeight: 30,
      });

      return NextResponse.json(serializeSettings(updated, newSecret));
    }
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
