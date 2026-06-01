import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  advanceDestinationMissionAttempt,
  getDestinationMissionRun,
  transitionDestinationMissionState,
} from "@/lib/destination-missions";
import { scoreClassScoutCandidate } from "@/lib/destination-classscout";
import { scoreCompareCandidate } from "@/lib/destination-compare";
import { verifyMembership } from "@/lib/permissions";
import { normalizeDestinationKey } from "@/lib/destination-scope";

export const dynamic = "force-dynamic";

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function candidateFingerprint(input: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const bodyRaw = await request.json().catch(() => null);
  if (!bodyRaw || typeof bodyRaw !== "object" || Array.isArray(bodyRaw)) {
    return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
  }
  const body = bodyRaw as Record<string, unknown>;
  const companyId = typeof body.companyId === "string" ? body.companyId : "";
  if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  const destinationKeyRaw = body.destinationKey;
  if (destinationKeyRaw !== undefined && !normalizeDestinationKey(destinationKeyRaw)) {
    return NextResponse.json({ error: "destinationKey must be one of: classscout, compare" }, { status: 400 });
  }
  const destinationKey = normalizeDestinationKey(destinationKeyRaw);
  const auth = await verifyMembership(request, companyId, "ADMIN");
  if (auth.error) return auth.error;

  const normalizedListing = asRecord(body.normalizedListing);
  if (!normalizedListing) {
    return NextResponse.json({ error: "normalizedListing is required" }, { status: 400 });
  }

  const { id } = await params;
  const mission = await getDestinationMissionRun(companyId, id);
  if (!mission) return NextResponse.json({ error: "Mission run not found" }, { status: 404 });
  if (destinationKey && mission.destinationKey !== destinationKey) {
    return NextResponse.json({ error: "Mission run not found" }, { status: 404 });
  }
  if (mission.destinationKey !== "classscout" && mission.destinationKey !== "compare") {
    return NextResponse.json({ error: "Mission destination is not supported for this route" }, { status: 400 });
  }
  if (mission.state === "PAUSED") {
    return NextResponse.json({ error: "Mission run is paused" }, { status: 409 });
  }

  if (mission.state === "QUEUED") {
    await transitionDestinationMissionState({
      companyId,
      missionId: mission.id,
      nextState: "CATALOG_INSPECTED",
      metadata: { movedBy: auth.session.email, source: "score-candidate" },
    });
  }

  const scoreResult = mission.destinationKey === "classscout"
    ? await scoreClassScoutCandidate({
        normalizedListing: normalizedListing as never,
      })
    : await scoreCompareCandidate({
        normalizedListing: normalizedListing as never,
      });

  if (!scoreResult.ok) {
    return NextResponse.json(
      {
        error: `${mission.destinationKey === "classscout" ? "ClassScout" : "Compare"} scoring failed`,
        detail: scoreResult.data ?? scoreResult.error ?? null,
      },
      { status: scoreResult.status || 502 },
    );
  }

  const result = asRecord(scoreResult.data?.result ?? scoreResult.data);
  const score = typeof result?.score === "number" ? result.score : null;
  const eligible = typeof result?.eligible === "boolean" ? result.eligible : false;
  const blockingReasons = asStringArray(result?.blockingReasons);
  const fingerprint = candidateFingerprint(normalizedListing);

  if (!eligible) {
    const nextRun = await advanceDestinationMissionAttempt({
      companyId,
      missionId: mission.id,
      candidateFingerprint: fingerprint,
      candidateId:
        typeof body.candidateId === "string" ? body.candidateId : `candidate-${fingerprint.slice(0, 12)}`,
      outcome: {
        terminalKind: "rejected",
        rejectionCode: blockingReasons[0] ?? "scarcity_score_below_threshold",
        rejectionDetail:
          score === null
            ? "Candidate scoring did not return an eligible score."
            : `Candidate scored ${score} and did not pass the rulebook threshold.`,
      },
      metadata: {
        scoredBy: auth.session.email,
        score,
        blockingReasons,
        scoringVersion: result?.version ?? null,
      },
    });

    return NextResponse.json({
      ok: true,
      eligible: false,
      scoreResult: scoreResult.data,
      run: nextRun,
    });
  }

  const run = await transitionDestinationMissionState({
    companyId,
    missionId: mission.id,
    nextState: "DISCOVERING",
    metadata: {
      scoredBy: auth.session.email,
      candidateFingerprint: fingerprint,
      lastEligibleScore: score,
      lastEligibleBlockingReasons: blockingReasons,
    },
  });

  return NextResponse.json({
    ok: true,
    eligible: true,
    scoreResult: scoreResult.data,
    run,
    candidateFingerprint: fingerprint,
  });
}
