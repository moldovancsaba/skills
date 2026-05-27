import { randomUUID } from "node:crypto";
import { DestinationMissionState, DestinationWorkflowState, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { extractClassScoutCandidate, prepareClassScoutCandidateReview, scoreClassScoutCandidate, type ClassScoutDiscoveryArtifact } from "@/lib/destination-classscout";
import {
  advanceDestinationMissionAttempt,
  claimDestinationMissionAttempt,
  getDestinationMissionRun,
  markDestinationMissionTerminal,
  transitionDestinationMissionState,
} from "@/lib/destination-missions";
import { createDestinationFactSnapshot } from "@/lib/destination-workflows";

type CandidateRecord = Awaited<ReturnType<typeof listMissionCandidates>>[number];

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asJsonRecord(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function readCandidateScore(candidate: CandidateRecord) {
  const metadata = asRecord(candidate.metadata);
  const directScore = asRecord(metadata?.scoreResult);
  if (typeof directScore?.score === "number") return directScore.score;

  const discoveryArtifact = asRecord(metadata?.discoveryArtifact);
  const artifactScore = asRecord(discoveryArtifact?.scoreResult);
  if (typeof artifactScore?.score === "number") return artifactScore.score;

  return -1;
}

function inferCandidateDomain(candidate: CandidateRecord) {
  const metadata = asRecord(candidate.metadata);
  const discoveryArtifact = asRecord(metadata?.discoveryArtifact);
  const sourceHost = typeof discoveryArtifact?.sourceHost === "string" ? discoveryArtifact.sourceHost.trim().toLowerCase() : "";
  if (sourceHost) return sourceHost;

  try {
    return new URL(candidate.canonicalSourceUrl).hostname.trim().toLowerCase();
  } catch {
    return "";
  }
}

function buildDomainAttemptMap(mission: NonNullable<Awaited<ReturnType<typeof getDestinationMissionRun>>>) {
  const counts = new Map<string, number>();

  for (const attempt of mission.attempts) {
    const metadata = asRecord(attempt.metadata);
    const outcome = asRecord(metadata?.outcome);
    const candidateDomain =
      typeof outcome?.candidateDomain === "string"
        ? outcome.candidateDomain.trim().toLowerCase()
        : typeof metadata?.candidateDomain === "string"
          ? metadata.candidateDomain.trim().toLowerCase()
          : "";
    if (!candidateDomain) continue;
    counts.set(candidateDomain, (counts.get(candidateDomain) ?? 0) + 1);
  }

  return counts;
}

async function listMissionCandidates(companyId: string, missionId: string) {
  return prisma.destinationCandidate.findMany({
    where: { companyId, workflowRunId: missionId },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "asc" }],
    include: {
      factSnapshots: { orderBy: { version: "desc" }, take: 1 },
    },
  });
}

function selectNextCandidate(
  mission: NonNullable<Awaited<ReturnType<typeof getDestinationMissionRun>>>,
  candidates: CandidateRecord[],
  maxDomainRetries: number,
) {
  const attemptedIds = new Set(mission.attempts.map((attempt) => attempt.candidateId).filter((value): value is string => Boolean(value)));
  const attemptedFingerprints = new Set(
    mission.attempts.map((attempt) => attempt.candidateFingerprint).filter((value): value is string => Boolean(value)),
  );
  const domainAttempts = buildDomainAttemptMap(mission);
  const skipped: Array<{ candidateId: string; domain: string | null; reason: string }> = [];

  const eligible = candidates
    .filter((candidate) => {
      if (attemptedIds.has(candidate.id)) {
        skipped.push({ candidateId: candidate.id, domain: inferCandidateDomain(candidate) || null, reason: "already_attempted_candidate" });
        return false;
      }
      if (attemptedFingerprints.has(candidate.candidateFingerprint)) {
        skipped.push({ candidateId: candidate.id, domain: inferCandidateDomain(candidate) || null, reason: "already_attempted_fingerprint" });
        return false;
      }
      if (candidate.status === DestinationWorkflowState.REJECTED) {
        skipped.push({ candidateId: candidate.id, domain: inferCandidateDomain(candidate) || null, reason: "candidate_rejected" });
        return false;
      }
      const candidateDomain = inferCandidateDomain(candidate);
      if (candidateDomain && (domainAttempts.get(candidateDomain) ?? 0) >= maxDomainRetries) {
        skipped.push({ candidateId: candidate.id, domain: candidateDomain, reason: "domain_retry_budget_exhausted" });
        return false;
      }
      return true;
    })
    .sort((left, right) => readCandidateScore(right) - readCandidateScore(left) || left.createdAt.getTime() - right.createdAt.getTime());

  return {
    candidate: eligible[0] ?? null,
    skipped,
    domainAttempts: Object.fromEntries([...domainAttempts.entries()].sort((left, right) => left[0].localeCompare(right[0]))),
  };
}

function buildEvidenceSummary(candidate: CandidateRecord, evidenceMap: Record<string, unknown>) {
  const metadata = asRecord(candidate.metadata);
  const discoveryArtifact = asRecord(metadata?.discoveryArtifact);
  return {
    sourceUrl: candidate.canonicalSourceUrl,
    evidenceMap,
    searchQuery: typeof discoveryArtifact?.searchQuery === "string" ? discoveryArtifact.searchQuery : null,
    scarcityTargets: asStringArray(discoveryArtifact?.scarcityTargets),
    rationale: asStringArray(discoveryArtifact?.rationale),
  };
}

export async function executeClassScoutMissionNextAttempt(input: {
  companyId: string;
  missionId: string;
  actorId: string;
  maxAutoRejections?: number;
}) {
  const maxAutoRejections = Math.max(1, Math.min(input.maxAutoRejections ?? 5, 10));
  const trail: Array<Record<string, unknown>> = [];

  for (let index = 0; index < maxAutoRejections; index += 1) {
    const mission = await getDestinationMissionRun(input.companyId, input.missionId);
    if (!mission) {
      return { ok: false, error: "Mission run not found", status: 404, trail };
    }
    if (mission.destinationKey !== "classscout") {
      return { ok: false, error: "Mission destination is not supported", status: 400, trail };
    }
    if (mission.state === DestinationMissionState.PAUSED) {
      return { ok: false, error: "Mission run is paused", status: 409, trail };
    }
    const terminalStates: DestinationMissionState[] = [
      DestinationMissionState.PUBLISHED_VERIFIED,
      DestinationMissionState.EXHAUSTED,
      DestinationMissionState.FAILED_TERMINAL,
    ];
    if (terminalStates.includes(mission.state)) {
      return { ok: true, mission, trail, terminal: true };
    }

    const policy = mission.policySnapshot.policyJson as unknown as { maxDomainRetries?: number };
    const candidates = await listMissionCandidates(input.companyId, input.missionId);
    const selection = selectNextCandidate(mission, candidates, Math.max(1, policy.maxDomainRetries ?? 2));
    trail.push({
      step: "selection",
      availableCandidates: candidates.length,
      skipped: selection.skipped,
      domainAttempts: selection.domainAttempts,
    });
    const candidate = selection.candidate;
    if (!candidate) {
      const exhausted = await markDestinationMissionTerminal({
        companyId: input.companyId,
        missionId: mission.id,
        outcome: "EXHAUSTED",
        metadata: {
          source: "executeClassScoutMissionNextAttempt",
          actorId: input.actorId,
          lastSelectionSkipped: selection.skipped,
          domainAttempts: selection.domainAttempts,
        },
      });
      trail.push({ step: "exhausted", reason: "no_remaining_candidates", skipped: selection.skipped });
      return { ok: true, mission: exhausted, trail, terminal: true };
    }

    const metadata = asRecord(candidate.metadata);
    const discoveryArtifact = asRecord(metadata?.discoveryArtifact) as ClassScoutDiscoveryArtifact | null;
    const candidateDomain = inferCandidateDomain(candidate);
    if (!discoveryArtifact) {
      const nextRun = await advanceDestinationMissionAttempt({
        companyId: input.companyId,
        missionId: mission.id,
        candidateId: candidate.id,
        workflowRunId: mission.id,
        candidateFingerprint: candidate.candidateFingerprint,
        outcome: {
          terminalKind: "rejected",
          rejectionCode: "missing_discovery_artifact",
          rejectionDetail: "The mission candidate is missing its discovery artifact metadata.",
          candidateDomain: candidateDomain || undefined,
        },
        metadata: {
          source: "executeClassScoutMissionNextAttempt",
          actorId: input.actorId,
          candidateDomain: candidateDomain || null,
        },
      });
      await prisma.destinationCandidate.update({
        where: { id: candidate.id },
        data: { status: DestinationWorkflowState.REJECTED },
      });
      trail.push({ step: "reject", candidateId: candidate.id, reason: "missing_discovery_artifact" });
      if (nextRun?.state === DestinationMissionState.EXHAUSTED) {
        return { ok: true, mission: nextRun, trail, terminal: true };
      }
      continue;
    }

    await claimDestinationMissionAttempt({
      companyId: input.companyId,
      missionId: mission.id,
      candidateId: candidate.id,
      workflowRunId: mission.id,
        candidateFingerprint: candidate.candidateFingerprint,
        metadata: {
          source: "executeClassScoutMissionNextAttempt",
          actorId: input.actorId,
          selectedCandidateId: candidate.id,
          candidateDomain: candidateDomain || null,
        },
      });

    let normalizedListing = asRecord(candidate.factSnapshots[0]?.factsJson);
    let evidenceMap = asRecord(asRecord(candidate.factSnapshots[0]?.provenanceJson)?.evidenceMap);
    let mediaRequest: Record<string, unknown> | null = null;

    if (!normalizedListing || !evidenceMap) {
      const extraction = await extractClassScoutCandidate({ discoveryArtifact });
      if (!extraction.ok) {
        const nextRun = await advanceDestinationMissionAttempt({
          companyId: input.companyId,
          missionId: mission.id,
          candidateId: candidate.id,
          workflowRunId: mission.id,
          candidateFingerprint: candidate.candidateFingerprint,
          outcome: {
            terminalKind: "retryable_failure",
            rejectionCode: "extraction_failed",
            rejectionDetail: typeof extraction.error === "string" ? extraction.error : "Candidate extraction failed.",
            candidateDomain: candidateDomain || undefined,
          },
          metadata: {
            source: "executeClassScoutMissionNextAttempt",
            actorId: input.actorId,
            candidateDomain: candidateDomain || null,
          },
        });
        await prisma.destinationCandidate.update({
          where: { id: candidate.id },
          data: { status: DestinationWorkflowState.FAILED },
        });
        trail.push({ step: "reject", candidateId: candidate.id, reason: "extraction_failed" });
        if (nextRun?.state === DestinationMissionState.EXHAUSTED) {
          return { ok: true, mission: nextRun, trail, terminal: true };
        }
        continue;
      }

      const result = asRecord(extraction.data?.result ?? extraction.data);
      normalizedListing = asRecord(result?.normalizedListing);
      evidenceMap = asRecord(result?.evidenceMap);
      mediaRequest = asRecord(result?.mediaRequest);
      const extractorVersion = typeof result?.extractorVersion === "string" ? result.extractorVersion : "classscout-extractor@unknown";

      if (!normalizedListing || !evidenceMap) {
        const nextRun = await advanceDestinationMissionAttempt({
          companyId: input.companyId,
          missionId: mission.id,
          candidateId: candidate.id,
          workflowRunId: mission.id,
          candidateFingerprint: candidate.candidateFingerprint,
          outcome: {
            terminalKind: "rejected",
            rejectionCode: "extraction_missing_facts",
            rejectionDetail: "Extraction did not return normalized listing facts.",
            candidateDomain: candidateDomain || undefined,
          },
          metadata: {
            source: "executeClassScoutMissionNextAttempt",
            actorId: input.actorId,
            candidateDomain: candidateDomain || null,
          },
        });
        await prisma.destinationCandidate.update({
          where: { id: candidate.id },
          data: { status: DestinationWorkflowState.REJECTED },
        });
        trail.push({ step: "reject", candidateId: candidate.id, reason: "extraction_missing_facts" });
        if (nextRun?.state === DestinationMissionState.EXHAUSTED) {
          return { ok: true, mission: nextRun, trail, terminal: true };
        }
        continue;
      }

      await createDestinationFactSnapshot({
        companyId: input.companyId,
        destinationKey: "classscout",
        candidateId: candidate.id,
        factsJson: normalizedListing,
        provenanceJson: {
          evidenceMap,
          discoveryArtifact,
          extractedBy: input.actorId,
          extractionMode: "mission-auto-runner",
        },
        extractorVersion,
      });
      trail.push({ step: "extract", candidateId: candidate.id });
    }

    const scoreResult = await scoreClassScoutCandidate({
      normalizedListing: normalizedListing as never,
    });

    if (!scoreResult.ok) {
      const nextRun = await advanceDestinationMissionAttempt({
        companyId: input.companyId,
        missionId: mission.id,
        candidateId: candidate.id,
        workflowRunId: mission.id,
        candidateFingerprint: candidate.candidateFingerprint,
        outcome: {
            terminalKind: "retryable_failure",
            rejectionCode: "scoring_failed",
            rejectionDetail: typeof scoreResult.error === "string" ? scoreResult.error : "Candidate scoring failed.",
            candidateDomain: candidateDomain || undefined,
          },
          metadata: {
            source: "executeClassScoutMissionNextAttempt",
            actorId: input.actorId,
            candidateDomain: candidateDomain || null,
          },
        });
      await prisma.destinationCandidate.update({
        where: { id: candidate.id },
        data: { status: DestinationWorkflowState.FAILED },
      });
      trail.push({ step: "reject", candidateId: candidate.id, reason: "scoring_failed" });
      if (nextRun?.state === DestinationMissionState.EXHAUSTED) {
        return { ok: true, mission: nextRun, trail, terminal: true };
      }
      continue;
    }

    const scorePayload = asRecord(scoreResult.data?.result ?? scoreResult.data);
    const eligible = scorePayload?.eligible === true;
    const score = typeof scorePayload?.score === "number" ? scorePayload.score : null;
    const blockingReasons = asStringArray(scorePayload?.blockingReasons);

    await prisma.destinationCandidate.update({
      where: { id: candidate.id },
      data: {
        metadata: asJsonRecord({
          ...((metadata ?? {}) as Record<string, unknown>),
          scoreResult: scorePayload ?? {},
        }),
      },
    });

    if (!eligible) {
      const nextRun = await advanceDestinationMissionAttempt({
        companyId: input.companyId,
        missionId: mission.id,
        candidateId: candidate.id,
        workflowRunId: mission.id,
        candidateFingerprint: candidate.candidateFingerprint,
        outcome: {
          terminalKind: "rejected",
          rejectionCode: blockingReasons[0] ?? "scarcity_score_below_threshold",
          rejectionDetail:
            score === null
              ? "Candidate scoring did not return an eligible score."
              : `Candidate scored ${score} and did not pass the rulebook threshold.`,
          candidateDomain: candidateDomain || undefined,
        },
        metadata: {
          source: "executeClassScoutMissionNextAttempt",
          actorId: input.actorId,
          score,
          blockingReasons,
          candidateDomain: candidateDomain || null,
        },
      });
      await prisma.destinationCandidate.update({
        where: { id: candidate.id },
        data: { status: DestinationWorkflowState.REJECTED },
      });
      trail.push({ step: "reject", candidateId: candidate.id, reason: blockingReasons[0] ?? "scarcity_score_below_threshold", score });
      if (nextRun?.state === DestinationMissionState.EXHAUSTED) {
        return { ok: true, mission: nextRun, trail, terminal: true };
      }
      continue;
    }

    const draftId = `draft-${randomUUID()}`;
    const prepare = await prepareClassScoutCandidateReview({
      normalizedListing: normalizedListing as never,
      draftId,
      evidenceSummary: buildEvidenceSummary(candidate, evidenceMap),
      workflowMetadata: {
        checklistCompanyId: input.companyId,
        workflowRunId: mission.id,
        candidateId: candidate.id,
        bridgeVersion: "v1",
      },
      mediaRequest,
      metadata: {
        preparedFrom: "mission-auto-runner",
        actorId: input.actorId,
      },
    });

    if (!prepare.ok) {
      const nextRun = await advanceDestinationMissionAttempt({
        companyId: input.companyId,
        missionId: mission.id,
        candidateId: candidate.id,
        workflowRunId: mission.id,
        candidateFingerprint: candidate.candidateFingerprint,
        outcome: {
            terminalKind: "retryable_failure",
            rejectionCode: "prepare_failed",
            rejectionDetail: typeof prepare.error === "string" ? prepare.error : "Candidate preparation failed.",
            candidateDomain: candidateDomain || undefined,
          },
          metadata: {
            source: "executeClassScoutMissionNextAttempt",
            actorId: input.actorId,
            draftId,
            candidateDomain: candidateDomain || null,
          },
        });
      await prisma.destinationCandidate.update({
        where: { id: candidate.id },
        data: { status: DestinationWorkflowState.FAILED },
      });
      trail.push({ step: "reject", candidateId: candidate.id, reason: "prepare_failed" });
      if (nextRun?.state === DestinationMissionState.EXHAUSTED) {
        return { ok: true, mission: nextRun, trail, terminal: true };
      }
      continue;
    }

    const preparePayload = asRecord(prepare.data);
    const status = typeof preparePayload?.status === "string" ? preparePayload.status : null;
    const diagnostics = asStringArray(preparePayload?.diagnostics);

    if (status === "blocked") {
      const nextRun = await advanceDestinationMissionAttempt({
        companyId: input.companyId,
        missionId: mission.id,
        candidateId: candidate.id,
        workflowRunId: mission.id,
        candidateFingerprint: candidate.candidateFingerprint,
        outcome: {
          terminalKind: "rejected",
          rejectionCode: diagnostics[0] ?? "publish_gate_blocked",
          rejectionDetail: diagnostics.join(" | ") || "Candidate was blocked during preparation.",
          candidateDomain: candidateDomain || undefined,
        },
        metadata: {
          source: "executeClassScoutMissionNextAttempt",
          actorId: input.actorId,
          draftId,
          candidateDomain: candidateDomain || null,
        },
      });
      await prisma.destinationCandidate.update({
        where: { id: candidate.id },
        data: { status: DestinationWorkflowState.REJECTED },
      });
      trail.push({ step: "reject", candidateId: candidate.id, reason: diagnostics[0] ?? "publish_gate_blocked" });
      if (nextRun?.state === DestinationMissionState.EXHAUSTED) {
        return { ok: true, mission: nextRun, trail, terminal: true };
      }
      continue;
    }

    await transitionDestinationMissionState({
      companyId: input.companyId,
      missionId: mission.id,
      nextState: "CANDIDATE_IN_REVIEW",
      metadata: {
        source: "executeClassScoutMissionNextAttempt",
        actorId: input.actorId,
        activeCandidateId: candidate.id,
        draftId,
        automationStatus: "review_ready",
      },
    });
    await prisma.destinationCandidate.update({
      where: { id: candidate.id },
      data: { status: DestinationWorkflowState.REVIEW_REQUIRED },
    });
    trail.push({ step: "prepared", candidateId: candidate.id, draftId, score });

    return {
      ok: true,
      reviewReady: true,
      candidateId: candidate.id,
      draftId,
      mission: await getDestinationMissionRun(input.companyId, mission.id),
      trail,
      result: prepare.data,
    };
  }

  const mission = await transitionDestinationMissionState({
    companyId: input.companyId,
    missionId: input.missionId,
    nextState: "FAILED_RECOVERABLE",
    failureCode: "auto_runner_retry_budget_exhausted",
    failureDetail: "The auto runner exhausted its local retry budget before reaching review readiness.",
    metadata: {
      source: "executeClassScoutMissionNextAttempt",
      actorId: input.actorId,
    },
  });

  return { ok: true, mission, trail, reviewReady: false, terminal: false };
}
