/**
 * Communication Settings API
 * Manages notification channels, bridge secrets, and ICE thresholds.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = 'force-dynamic';

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

    return NextResponse.json(settings);
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
        channel: data.channel || "IMESSAGE",
        handle: data.handle,
        isEnabled: data.isEnabled || false,
        minIceScore: data.minIceScore || 600,
      },
    });

    return NextResponse.json(updated);
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
      const crypto = require("crypto");
      const newSecret = crypto.randomUUID();
      const updated = await prisma.communicationSettings.update({
        where: { companyId },
        data: { bridgeSecret: newSecret },
      });
      return NextResponse.json(updated);
    }
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
