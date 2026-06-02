import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";
import { resolveDestinationKeyForVisitorWithHint } from "@/lib/visitor-blueprints";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((entry) => asString(entry)).filter(Boolean);
}

function asNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
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
  const destinationKey = String(request.nextUrl.searchParams.get("destinationKey") || "").trim()
    || resolveDestinationKeyForVisitorWithHint(visitorKey, undefined);
  if (!destinationKey) return NextResponse.json({ ok: true, visitorKey, opportunities: [] });
  try {
    const instance = await prisma.destinationInstance.findFirst({
      where: { companyId, destinationKey, isActive: true },
      select: { id: true },
    });
    if (!instance) return NextResponse.json({ ok: true, visitorKey, opportunities: [] });
    const rows = await prisma.destinationCandidate.findMany({
      where: {
        companyId,
        destinationInstanceId: instance.id,
      },
      select: {
        id: true,
        canonicalSourceUrl: true,
        proposedType: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 500,
    });
    const opportunities = rows
      .map((row) => {
        const opportunity = asRecord(asRecord(row.metadata)?.miniappOpportunityCard);
        if (!opportunity) return null;
        return {
          id: asString(opportunity.id),
          candidateId: row.id,
          miniappKey: asString(opportunity.miniappKey),
          destinationKey: asString(opportunity.destinationKey),
          contractKey: asString(opportunity.contractKey),
          evidenceArtifactId: asString(opportunity.evidenceArtifactId),
          sourceUrl: asString(opportunity.sourceUrl) || row.canonicalSourceUrl,
          title: asString(opportunity.title) || row.canonicalSourceUrl,
          expectedEvidenceType: asString(opportunity.expectedEvidenceType) || asString(row.proposedType),
          evidenceScore: asNumber(opportunity.evidenceScore),
          sourceAuthorityScore: asNumber(opportunity.sourceAuthorityScore),
          candidateScore: asNumber(opportunity.candidateScore),
          status: asString(opportunity.status),
          blockingReasons: asStringArray(opportunity.blockingReasons),
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        };
      })
      .filter(Boolean);
    return NextResponse.json({ ok: true, visitorKey, opportunities });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
