import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { listVisitorCandidates } from "@/lib/visitor-candidate-pipeline";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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
    const candidates = await listVisitorCandidates(companyId, visitorKey, destinationKey);
    // Keep internal routes explicit; public callers get the reduced projection.
    const rows = includeInternal ? candidates : candidates.map((candidate) => mapPublicCandidate(candidate));
    return NextResponse.json({ ok: true, visitorKey, candidates: rows });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}
