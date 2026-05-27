import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  advanceDestinationMissionAttempt,
  getDestinationMissionRun,
  transitionDestinationMissionState,
} from "@/lib/destination-missions";
import { prepareClassScoutCandidateReview } from "@/lib/destination-classscout";
import { verifyMembership } from "@/lib/permissions";

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
  const body = await request.json().catch(() => ({}));
  const companyId = String(body.companyId || "");
  const auth = await verifyMembership(request, companyId, "ADMIN");
  if (auth.error) return auth.error;

  const normalizedListing = asRecord(body.normalizedListing);
  if (!companyId || !normalizedListing) {
    return NextResponse.json({ error: "companyId and normalizedListing are required" }, { status: 400 });
  }

  const { id } = await params;
  const mission = await getDestinationMissionRun(companyId, id);
  if (!mission) return NextResponse.json({ error: "Mission run not found" }, { status: 404 });
  if (mission.destinationKey !== "classscout") {
    return NextResponse.json({ error: "Mission destination is not supported for this route" }, { status: 400 });
  }
  if (mission.state === "PAUSED") {
    return NextResponse.json({ error: "Mission run is paused" }, { status: 409 });
  }

  const fingerprint = candidateFingerprint(normalizedListing);
  const candidateId = typeof body.candidateId === "string" ? body.candidateId : `candidate-${fingerprint.slice(0, 12)}`;
  const draftId = typeof body.draftId === "string" ? body.draftId : `draft-${randomUUID()}`;
  const evidenceSummary = asRecord(body.evidenceSummary) ?? {};
  const mediaRequest = asRecord(body.mediaRequest);
  const metadata = asRecord(body.metadata);

  const prepareResult = await prepareClassScoutCandidateReview({
    normalizedListing: normalizedListing as never,
    draftId,
    evidenceSummary,
    workflowMetadata: {
      checklistCompanyId: companyId,
      workflowRunId: mission.id,
      candidateId,
      bridgeVersion: "v1",
    },
    mediaRequest,
    metadata,
  });

  if (!prepareResult.ok) {
    return NextResponse.json(
      { error: "ClassScout candidate preparation failed", detail: prepareResult.data ?? prepareResult.error ?? null },
      { status: prepareResult.status || 502 },
    );
  }

  const result = asRecord(prepareResult.data);
  const status = typeof result?.status === "string" ? result.status : null;
  const diagnostics = asStringArray(result?.diagnostics);

  if (status === "blocked") {
    const nextRun = await advanceDestinationMissionAttempt({
      companyId,
      missionId: mission.id,
      candidateId,
      candidateFingerprint: fingerprint,
      workflowRunId: mission.id,
      outcome: {
        terminalKind: "rejected",
        rejectionCode: diagnostics[0] ?? "publish_gate_blocked",
        rejectionDetail: diagnostics.join(" | ") || "Candidate was blocked during preparation.",
      },
      metadata: {
        preparedBy: auth.session.email,
        draftId,
        diagnostics,
      },
    });

    return NextResponse.json({
      ok: true,
      prepared: false,
      result: prepareResult.data,
      run: nextRun,
    });
  }

  const run = await transitionDestinationMissionState({
    companyId,
    missionId: mission.id,
    nextState: "CANDIDATE_IN_REVIEW",
    metadata: {
      preparedBy: auth.session.email,
      candidateId,
      candidateFingerprint: fingerprint,
      draftId,
      preparationStatus: status,
    },
  });

  return NextResponse.json({
    ok: true,
    prepared: true,
    result: prepareResult.data,
    run,
    candidateId,
    draftId,
  });
}
