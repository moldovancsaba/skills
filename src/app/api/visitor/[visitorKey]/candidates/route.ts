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

function isTruthy(value: string | null) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function pickFromRecord(record: Record<string, unknown> | null, keys: string[]) {
  for (const key of keys) {
    const value = asString(record?.[key]);
    if (value) return value;
  }
  return "";
}

function toBoolean(value: string | null) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function readCandidateState(metadata: unknown) {
  return asString(asRecord(metadata)?.visitorCandidateState).toUpperCase() || "DISCOVERED";
}

function isProjectionBlocked(metadata: unknown) {
  const record = asRecord(metadata);
  const gate = asRecord(record?.publicProjectionGate) ?? asRecord(record?.projectionGate);
  return gate?.blocked === true;
}

function mapPublicCandidate(candidate: {
  id: string;
  canonicalSourceUrl: string;
  proposedType: string | null;
  metadata: unknown;
  extractedFacts: unknown;
  qualityScore: number | null;
  uncertaintyReasons: string[];
  createdAt: string;
  updatedAt: string;
}) {
  // Public endpoint strips candidate internals and exposes only safe publish-ready fields.
  const metadata = asRecord(candidate.metadata) ?? {};
  const facts = asRecord(candidate.extractedFacts) ?? {};
  const name = pickFromRecord(metadata, ["name", "title", "provider"]) || pickFromRecord(facts, ["name", "title"]);
  const provider = pickFromRecord(metadata, ["provider", "company"]) || pickFromRecord(facts, ["provider", "company"]);
  const location =
    pickFromRecord(metadata, ["region", "location", "address", "neighborhood"]) ||
    pickFromRecord(facts, ["location", "address"]);
  const canonical = String(candidate.canonicalSourceUrl || "").trim();
  return {
    id: candidate.id,
    name: name || canonical,
    activityType: pickFromRecord(metadata, ["activityType", "contentType", "proposedType"]) || candidate.proposedType || "unknown",
    provider: provider || null,
    location,
    sourceUrl: canonical,
    qualityScore: candidate.qualityScore,
    uncertaintyReasons: candidate.uncertaintyReasons,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  };
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
  try {
    const destinationKey = String(request.nextUrl.searchParams.get("destinationKey") || "").trim() || undefined;
    const includeInternal =
      isTruthy(request.nextUrl.searchParams.get("includeInternal")) || request.nextUrl.searchParams.get("mode") === "internal";
    const includeBlocked = toBoolean(request.nextUrl.searchParams.get("includeBlocked"));
    const shouldExposeBlocked = includeInternal || includeBlocked;
    const resolvedDestinationKey = destinationKey ?? resolveDestinationKeyForVisitorWithHint(visitorKey, undefined);
    if (!resolvedDestinationKey) {
      return NextResponse.json({ ok: true, visitorKey, blockedCount: 0, candidates: [], totalCandidates: 0 });
    }

    const instance = await prisma.destinationInstance.findFirst({
      where: { companyId, destinationKey: resolvedDestinationKey, isActive: true },
      select: { id: true },
    });
    if (!instance) {
      return NextResponse.json({ ok: true, visitorKey, blockedCount: 0, candidates: [], totalCandidates: 0 });
    }
    const candidates = await prisma.destinationCandidate.findMany({
      where: {
        companyId,
        destinationInstanceId: instance.id,
      },
      orderBy: { updatedAt: "desc" },
      take: 500,
    });
    // Keep internal routes explicit; public callers get the reduced projection.
    const rows: Array<Record<string, unknown>> = [];
    let blockedCount = 0;
    for (const row of candidates) {
      const metadata = asRecord(row.metadata) ?? {};
      const candidate = {
        id: row.id,
        visitorKey,
        status: readCandidateState(metadata),
        canonicalSourceUrl: row.canonicalSourceUrl,
        proposedType: row.proposedType,
        extractedFacts: asRecord(metadata.extractedFacts) ?? {},
        classification: asRecord(metadata.classification) ?? null,
        qualityScore: asNumber(metadata.qualityScore) || null,
        uncertaintyReasons: asStringArray(metadata.uncertaintyReasons),
        metadata,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };

      if (isProjectionBlocked(candidate.metadata)) {
        blockedCount += 1;
        if (!shouldExposeBlocked) continue;
      }

      rows.push(includeInternal ? candidate : mapPublicCandidate(candidate));
    }

    return NextResponse.json({
      ok: true,
      visitorKey,
      blockedCount,
      candidates: rows,
      totalCandidates: candidates.length,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
