import { NextRequest, NextResponse } from "next/server";
import { OpportunitycardActionType, OpportunitycardDeclineReason } from "@prisma/client";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { recordOpportunityOutcomeAndLearning } from "@/lib/customer-value-delivery";

export const dynamic = "force-dynamic";

function parseAction(value: unknown) {
  const action = String(value || "").trim().toUpperCase();
  if (Object.values(OpportunitycardActionType).includes(action as OpportunitycardActionType)) {
    return action as OpportunitycardActionType;
  }
  return null;
}

function parseDeclineReason(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const reason = String(value).trim().toUpperCase();
  if (Object.values(OpportunitycardDeclineReason).includes(reason as OpportunitycardDeclineReason)) {
    return reason as OpportunitycardDeclineReason;
  }
  return null;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing opportunitycard id" }, { status: 400 });
  }

  const card = await prisma.opportunitycard.findUnique({
    where: { id },
    select: { id: true, companyId: true },
  });
  if (!card) {
    return NextResponse.json({ error: "Opportunitycard not found" }, { status: 404 });
  }

  const auth = await verifyMembership(request, card.companyId);
  if (auth.error) return auth.error;

  const rawBody = await request.json().catch(() => null);
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
  }
  const body = rawBody as Record<string, unknown>;
  const action = parseAction(body.action);
  if (!action) {
    return NextResponse.json({ error: "action must be a supported OpportunitycardActionType" }, { status: 400 });
  }
  const declineReason = parseDeclineReason(body.declineReason);
  if (action === "DECLINE" && !declineReason) {
    return NextResponse.json({ error: "declineReason is required for DECLINE outcomes" }, { status: 400 });
  }

  try {
    const result = await recordOpportunityOutcomeAndLearning({
      cardId: card.id,
      action,
      declineReason,
      annotation: optionalString(body.annotation),
      actorId: auth.membership.id,
      actorEmail: auth.session.email,
      idempotencyKey: optionalString(body.idempotencyKey) || optionalString(request.headers.get("Idempotency-Key")),
      modified: {
        companyName: optionalString(body.companyName),
        title: optionalString(body.title),
        body: optionalString(body.body),
        website: optionalString(body.website),
        location: optionalString(body.location),
        coreOffer: optionalString(body.coreOffer),
        fitRationale: optionalString(body.fitRationale),
      },
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: result.status });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("[API:OpportunitycardOutcome] Failure:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
