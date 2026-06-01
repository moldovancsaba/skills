import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { scoreVisitorCandidate } from "@/lib/visitor-candidate-pipeline";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ visitorKey: string; id: string }> },
) {
  const body = asRecord(await request.json().catch(() => null));
  const companyId = asString(body.companyId);
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });
  const auth = await verifyMembership(request, companyId, "MEMBER");
  if (auth.error) return auth.error;

  const { visitorKey, id } = await params;
  const score = await scoreVisitorCandidate(companyId, visitorKey, id, {
    sourceTrustScore: asNumber(body.sourceTrustScore),
    evidenceCompleteness: asNumber(body.evidenceCompleteness),
    taxonomyFit: asNumber(body.taxonomyFit),
    locationFit: asNumber(body.locationFit),
    audienceFit: asNumber(body.audienceFit),
  });
  if (!score) return NextResponse.json({ ok: false, error: "Candidate not found" }, { status: 404 });
  return NextResponse.json({ ok: true, visitorKey, candidateId: id, score });
}
