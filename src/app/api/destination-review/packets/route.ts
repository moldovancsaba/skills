import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyIngestSecret } from "@/lib/ingest-auth";
import { verifyMembership } from "@/lib/permissions";
import { submitDestinationReviewPacket } from "@/lib/destination-review-bridge";
import { normalizeDestinationKey } from "@/lib/destination-scope";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function GET(request: NextRequest) {
  const companyId = String(request.nextUrl.searchParams.get("companyId") || "");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  const packetState = request.nextUrl.searchParams.get("packetState");
  const destinationKeyRaw = request.nextUrl.searchParams.get("destinationKey");
  if (destinationKeyRaw && !normalizeDestinationKey(destinationKeyRaw)) {
    return NextResponse.json({ error: "destinationKey must be one of: classscout, compare" }, { status: 400 });
  }
  const destinationKey = normalizeDestinationKey(destinationKeyRaw);
  const packets = await prisma.destinationReviewPacket.findMany({
    where: {
      companyId,
      ...(packetState ? { packetState } : {}),
      ...(destinationKey
        ? {
            destinationInstance: {
              destinationKey,
            },
          }
        : {}),
    },
    orderBy: [{ submittedAt: "desc" }],
    include: {
      reviewDecisions: {
        orderBy: { reviewedAt: "desc" },
        take: 1,
      },
      outcomeMemories: {
        orderBy: { createdAt: "desc" },
        take: 3,
      },
    },
  });

  return NextResponse.json(packets);
}

export async function POST(request: NextRequest) {
  const auth = await verifyIngestSecret(request);
  if (auth.error) return auth.error;

  try {
    const rawBody = await request.json();
    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
      return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
    }
    const body = rawBody as Record<string, unknown>;
    const required = ["companyId", "destinationKey", "workflowRunId", "candidateId", "draftId", "bridgeVersion", "draftPayload", "evidenceSummary", "diagnostics"];
    for (const field of required) {
      if (!(field in body)) {
        return NextResponse.json({ error: `${field} is required` }, { status: 400 });
      }
    }
    const companyId = String(body.companyId || "");
    if (!companyId) {
      return NextResponse.json({ error: "companyId is required" }, { status: 400 });
    }
    const destinationKey = normalizeDestinationKey(body.destinationKey);
    if (!destinationKey) {
      return NextResponse.json({ error: "destinationKey must be one of: classscout, compare" }, { status: 400 });
    }

    const packet = await submitDestinationReviewPacket({
      companyId,
      destinationKey,
      workflowRunId: String(body.workflowRunId || ""),
      candidateId: String(body.candidateId || ""),
      draftId: String(body.draftId || ""),
      bridgeVersion: String(body.bridgeVersion || ""),
      packetFingerprint: typeof body.packetFingerprint === "string" && body.packetFingerprint.trim()
        ? body.packetFingerprint.trim()
        : undefined,
      draftPayload: asRecord(body.draftPayload),
      evidenceSummary: asRecord(body.evidenceSummary),
      diagnostics: asRecord(body.diagnostics),
      mediaSummary: asRecord(body.mediaSummary),
      metadata: asRecord(body.metadata),
    } as never);
    return NextResponse.json({ ok: true, packet });
  } catch (error) {
    console.error("[API:DestinationReview:Packets] POST failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
