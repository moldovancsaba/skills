import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { applyVisitorFeedback, listVisitorFeedbackMemory } from "@/lib/visitor-learning";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ visitorKey: string }> },
) {
  const companyId = String(request.nextUrl.searchParams.get("companyId") || "").trim();
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });
  const auth = await verifyMembership(request, companyId, "MEMBER");
  if (auth.error) return auth.error;
  const { visitorKey } = await params;
  const destinationKey = String(request.nextUrl.searchParams.get("destinationKey") || "").trim() || undefined;
  const feedbackMemory = await listVisitorFeedbackMemory(companyId, visitorKey, destinationKey);
  return NextResponse.json({ ok: true, visitorKey, feedbackMemory });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ visitorKey: string }> },
) {
  const body = asRecord(await request.json().catch(() => null));
  const companyId = asString(body.companyId);
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });
  const auth = await verifyMembership(request, companyId, "MEMBER");
  if (auth.error) return auth.error;
  const { visitorKey } = await params;
  const destinationKey = asString(body.destinationKey) || undefined;

  const result = await applyVisitorFeedback(companyId, visitorKey, {
    feedbackType: asString(body.feedbackType) as never,
    contentType: asString(body.contentType) || undefined,
    sourceTerm: asString(body.sourceTerm) || undefined,
    reason: asString(body.reason),
    candidateIds: Array.isArray(body.candidateIds)
      ? body.candidateIds.map((value) => asString(value)).filter(Boolean)
      : undefined,
    metadata: asRecord(body.metadata),
    actor: auth.session.email,
  }, destinationKey);
  return NextResponse.json({ ok: true, visitorKey, ...result });
}
