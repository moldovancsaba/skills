import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getVisitorTaxonomy, resolveDestinationKeyForVisitorWithHint } from "@/lib/visitor-blueprints";
import { ensureDestinationInstance } from "@/lib/destination-workflows";
import { evaluateVisitorQualityGate } from "@/lib/visitor-quality-gate";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ visitorKey: string; candidateId: string }> },
) {
  const companyId = String(request.nextUrl.searchParams.get("companyId") || "").trim();
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });
  const auth = await verifyMembership(request, companyId, "MEMBER");
  if (auth.error) return auth.error;
  const { visitorKey, candidateId } = await params;
  const destinationKeyHint = String(request.nextUrl.searchParams.get("destinationKey") || "").trim() || undefined;
  const destinationKey = resolveDestinationKeyForVisitorWithHint(visitorKey, destinationKeyHint);
  if (!destinationKey) return NextResponse.json({ ok: false, error: "Unsupported visitorKey" }, { status: 400 });
  const instance = await ensureDestinationInstance(companyId, destinationKey);
  const candidate = await prisma.destinationCandidate.findFirst({
    where: {
      id: candidateId,
      companyId,
      destinationInstanceId: instance.id,
    },
    select: {
      id: true,
      proposedType: true,
      canonicalSourceUrl: true,
      metadata: true,
    },
  });
  if (!candidate) return NextResponse.json({ ok: false, error: "candidate not found" }, { status: 404 });
  const taxonomy = await getVisitorTaxonomy(companyId, visitorKey, destinationKeyHint);
  const metadata = asRecord(candidate.metadata) ?? {};
  const classification = asRecord(metadata.classification) ?? {};
  const contentType = asString(classification.contentType || candidate.proposedType);
  const gateResult = evaluateVisitorQualityGate({
    taxonomy,
    contentType,
    sourceUrl: candidate.canonicalSourceUrl,
    extractedFacts: asRecord(metadata.extractedFacts) ?? {},
    metadata,
  });
  return NextResponse.json({
    ok: true,
    visitorKey,
    candidateId: candidate.id,
    contentType,
    gateResult,
  });
}
