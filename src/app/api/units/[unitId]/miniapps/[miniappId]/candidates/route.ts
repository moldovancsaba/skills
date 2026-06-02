import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveMiniappRouteContext } from "@/lib/check-foundation/miniapp-route-guard";

export const dynamic = "force-dynamic";

type CompareCandidateContractStatus = "new" | "needs_evidence" | "ready_for_packet" | "rejected";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickString(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function pickStringArray(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry || "").trim()).filter(Boolean);
}

function pickNumber(record: Record<string, unknown> | null, key: string) {
  const numeric = Number(record?.[key]);
  return Number.isFinite(numeric) ? numeric : 0;
}

function pickBoolean(record: Record<string, unknown> | null, key: string) {
  return record?.[key] === true;
}

function isTruthy(value: string | null) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function readProjectionGate(metadata: Record<string, unknown> | null) {
  const gate = asRecord(metadata?.publicProjectionGate) ?? asRecord(metadata?.projectionGate);
  const blockedReasons = pickStringArray(gate, "blockedReasons");
  return {
    blocked: gate?.blocked === true,
    blockedReasons,
  };
}

function normalizeContractStatus(rawStatus: string): CompareCandidateContractStatus {
  const normalized = String(rawStatus || "").toUpperCase();
  if (normalized === "FAILED" || normalized === "REJECTED") return "rejected";
  if (normalized === "DISCOVERED" || normalized === "FACTS_EXTRACTED") return "needs_evidence";
  if (normalized === "DRAFTED" || normalized === "REVIEW_REQUIRED" || normalized === "APPROVED") return "ready_for_packet";
  return "new";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ unitId: string; miniappId: string }> },
) {
  try {
    const { unitId, miniappId } = await params;
    const guard = await resolveMiniappRouteContext({
      request,
      unitId,
      miniappIdRaw: miniappId,
    });
    if ("error" in guard) return guard.error;

    const take = Math.max(1, Math.min(100, Number(request.nextUrl.searchParams.get("take") || 50)));
    // Public candidates are projected-only by default; add `?includeInternal=true` for operator/admin flows.
    const includeInternal = isTruthy(request.nextUrl.searchParams.get("includeInternal")) || request.nextUrl.searchParams.get("mode") === "internal";
    const includeBlocked = isTruthy(request.nextUrl.searchParams.get("includeBlocked"));
    const shouldExposeBlocked = includeInternal || includeBlocked;

    const candidates = await prisma.destinationCandidate.findMany({
      where: {
        companyId: guard.context.unitId,
        destinationInstance: {
          destinationKey: guard.context.miniappId,
        },
      },
      include: {
        reviewPackets: {
          select: {
            id: true,
            packetState: true,
            submittedAt: true,
          },
          orderBy: { submittedAt: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
      take,
    });

    const items = [];
    let blockedCount = 0;
    for (const candidate of candidates) {
      const metadata = asRecord(candidate.metadata);
      const projectionGate = readProjectionGate(metadata);
      const eligibilityFlags = pickStringArray(metadata, "eligibilityFlags");
      const qualityScore = pickNumber(metadata, "qualityScore");
      const requiresReview = pickBoolean(metadata, "requiresReview");
      const sourceUrls = pickStringArray(metadata, "sourceUrls");
      const latestPacket = candidate.reviewPackets[0] ?? null;
      const normalizedStatus = projectionGate.blocked
        ? "rejected"
        : normalizeContractStatus(candidate.status);
      const publicCandidate = {
        id: candidate.id,
        unitId: guard.context.unitId,
        miniappId: guard.context.miniappId,
        name: pickString(metadata, "name") ?? candidate.canonicalSourceUrl,
        activityType: pickString(metadata, "activityType") ?? candidate.proposedType ?? "unknown",
        region: pickString(metadata, "region"),
        season: pickString(metadata, "season"),
        provider: pickString(metadata, "provider"),
        sourceUrls: sourceUrls.length > 0 ? sourceUrls : [candidate.canonicalSourceUrl],
        evidenceScore: pickNumber(metadata, "evidenceScore"),
        freshnessScore: pickNumber(metadata, "freshnessScore"),
        eligibilityFlags,
        isProjectionBlocked: projectionGate.blocked,
        isReviewRecommended: requiresReview,
        projectionConfidence:
          metadata?.regionConfidence !== undefined || metadata?.seasonConfidence !== undefined || metadata?.providerConfidence !== undefined
            ? {
                region: metadata?.regionConfidence ?? null,
                season: metadata?.seasonConfidence ?? null,
                provider: metadata?.providerConfidence ?? null,
              }
            : null,
        scoreMinimumMet: qualityScore >= 55,
      };

      if (projectionGate.blocked) {
        blockedCount += 1;
        if (!shouldExposeBlocked) {
          continue;
        }
      }

      const publicCandidateResult = includeInternal
        ? {
            ...publicCandidate,
            status: normalizedStatus,
            runtime: {
              destinationStatus: candidate.status,
              dedupeStatus: candidate.dedupeStatus,
              latestReviewPacketId: latestPacket?.id ?? null,
              latestReviewPacketState: latestPacket?.packetState ?? null,
              compareQuality: {
                qualityScore,
                minimumQualityScore: 55,
                acceptable: pickBoolean(metadata, "qualityAcceptable"),
                requiresReview,
                reasons: pickStringArray(metadata, "qualityReasons"),
                projectionBlocked: projectionGate.blocked,
                projectionBlockedReasons: projectionGate.blockedReasons,
                regionConfidence: metadata?.regionConfidence ?? null,
                seasonConfidence: metadata?.seasonConfidence ?? null,
                providerConfidence: metadata?.providerConfidence ?? null,
              },
            },
          }
        : publicCandidate;

      // Public API callers get the projected output only.
      items.push(publicCandidateResult);
    }

    return NextResponse.json({
      ok: true,
      unitId: guard.context.unitId,
      miniappId: guard.context.miniappId,
      count: items.length,
      blockedCount,
      items,
    });
  } catch (error) {
    console.error("[API:Units:Miniapp:Candidates] failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
