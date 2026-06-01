import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveMiniappRouteContext } from "@/lib/check-foundation/miniapp-route-guard";
import {
  deriveCompareQualitySignals,
  evaluateCompareCandidate,
  scoreCompareCandidate,
} from "@/lib/destination-compare-quality";
import { evaluateCompareProjectionGate } from "@/lib/visitor-public-projection-gate";

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

function isTruthy(value: string | null) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
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

    const items = candidates.map((candidate) => {
      const metadata = asRecord(candidate.metadata);
      const qualitySignals = deriveCompareQualitySignals(metadata);
      const qualityScore = scoreCompareCandidate(qualitySignals);
      const projectionGate = evaluateCompareProjectionGate({
        metadata,
      });
      const qualityEvaluation = evaluateCompareCandidate({
        qualityScore,
        eligibilityFlags: qualitySignals.eligibilityFlags,
        metadata,
      });
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
        evidenceScore: qualitySignals.evidenceScore,
        freshnessScore: qualitySignals.freshnessScore,
        eligibilityFlags: qualitySignals.eligibilityFlags,
        isProjectionBlocked: projectionGate.blocked,
        isReviewRecommended: qualityEvaluation.requiresReview,
        projectionConfidence:
          qualitySignals.regionConfidence !== null || qualitySignals.seasonConfidence !== null || qualitySignals.providerConfidence !== null
            ? {
                region: qualitySignals.regionConfidence,
                season: qualitySignals.seasonConfidence,
                provider: qualitySignals.providerConfidence,
              }
            : null,
        scoreMinimumMet: qualityScore >= 55,
      };

      if (!includeInternal) {
        return publicCandidate;
      }

      // Internal mode preserves legacy/local debugging context used by reviewer flows.
      return {
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
            acceptable: qualityEvaluation.acceptable,
            requiresReview: qualityEvaluation.requiresReview,
            reasons: qualityEvaluation.reasons,
            projectionBlocked: projectionGate.blocked,
            projectionBlockedReasons: projectionGate.blockedReasons,
            regionConfidence: qualitySignals.regionConfidence,
            seasonConfidence: qualitySignals.seasonConfidence,
            providerConfidence: qualitySignals.providerConfidence,
          },
        },
      };
    });

    return NextResponse.json({
      ok: true,
      unitId: guard.context.unitId,
      miniappId: guard.context.miniappId,
      count: items.length,
      items,
    });
  } catch (error) {
    console.error("[API:Units:Miniapp:Candidates] failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
