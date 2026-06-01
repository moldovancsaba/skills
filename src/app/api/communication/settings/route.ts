/**
 * Communication Settings API
 * Manages notification channels, bridge secrets, and ICE thresholds.
 */
import { NextRequest, NextResponse } from "next/server";
import { ChannelType } from "@prisma/client";
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

function normalizeChannel(value: unknown): ChannelType | undefined {
  if (value === ChannelType.IMESSAGE) return ChannelType.IMESSAGE;
  if (value === ChannelType.WHATSAPP) return ChannelType.WHATSAPP;
  if (value === ChannelType.EMAIL) return ChannelType.EMAIL;
  if (value === ChannelType.WEBHOOK) return ChannelType.WEBHOOK;
  return undefined;
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
    const payload = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
    }
    const data = payload as {
      channel?: string;
      handle?: string | null;
      isEnabled?: boolean;
      minIceScore?: number;
    };
    const channel = normalizeChannel(data.channel);
    const handle = typeof data.handle === "string" || data.handle === null ? data.handle : undefined;
    const isEnabled = typeof data.isEnabled === "boolean" ? data.isEnabled : undefined;
    const minIceScore = typeof data.minIceScore === "number" && Number.isFinite(data.minIceScore)
      ? data.minIceScore
      : undefined;
    const existing = await prisma.communicationSettings.findUnique({
      where: { companyId },
    });
    const updated = await prisma.communicationSettings.upsert({
      where: { companyId },
      update: {
        channel,
        handle,
        isEnabled,
        minIceScore,
      },
      create: {
        companyId,
        channel: channel ?? ChannelType.IMESSAGE,
        handle,
        isEnabled: isEnabled ?? false,
        minIceScore: minIceScore ?? 600,
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
          channel: channel !== undefined,
          handle: handle !== undefined,
          isEnabled: isEnabled !== undefined,
          minIceScore: minIceScore !== undefined,
        },
      },
      teachingWeight: minIceScore !== undefined ? 35 : 30,
    });

    if (minIceScore !== undefined || channel !== undefined || handle !== undefined || isEnabled !== undefined) {
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
        teachingWeight: minIceScore !== undefined ? 35 : 30,
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
