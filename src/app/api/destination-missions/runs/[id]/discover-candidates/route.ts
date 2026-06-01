import { NextRequest, NextResponse } from "next/server";
import { discoverClassScoutCandidates } from "@/lib/destination-classscout";
import { discoverCompareCandidates } from "@/lib/destination-compare";
import { getDestinationMissionRun, transitionDestinationMissionState } from "@/lib/destination-missions";
import { upsertDestinationCandidate, upsertDestinationSourceDocument } from "@/lib/destination-workflows";
import type { DestinationKey } from "@/lib/destination-workflow-contract";
import { verifyMembership } from "@/lib/permissions";
import { normalizeDestinationKey } from "@/lib/destination-scope";

export const dynamic = "force-dynamic";

function asArray<T>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
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

  const { id } = await params;
  const mission = await getDestinationMissionRun(companyId, id);
  if (!mission) return NextResponse.json({ error: "Mission run not found" }, { status: 404 });
  if (destinationKey && mission.destinationKey !== destinationKey) {
    return NextResponse.json({ error: "Mission run not found" }, { status: 404 });
  }
  if (mission.destinationKey !== "classscout" && mission.destinationKey !== "compare") {
    return NextResponse.json({ error: "Mission destination is not supported for discovery" }, { status: 400 });
  }
  const missionDestinationKey: DestinationKey = mission.destinationKey;

  const discovery = mission.destinationKey === "classscout"
    ? await discoverClassScoutCandidates({
        maxTargets: typeof body.maxTargets === "number" ? body.maxTargets : undefined,
        maxCandidates: typeof body.maxCandidates === "number" ? body.maxCandidates : undefined,
      })
    : await discoverCompareCandidates({
        maxTargets: typeof body.maxTargets === "number" ? body.maxTargets : undefined,
        maxCandidates: typeof body.maxCandidates === "number" ? body.maxCandidates : undefined,
      });
  if (!discovery.ok) {
    return NextResponse.json(
      {
        error: `${mission.destinationKey === "classscout" ? "ClassScout" : "Compare"} discovery failed`,
        detail: discovery.data ?? discovery.error ?? null,
      },
      { status: discovery.status || 502 },
    );
  }

  const artifacts = asArray<Record<string, unknown>>(discovery.data?.artifacts);
  const persisted = [];

  for (const artifact of artifacts) {
    const artifactId = typeof artifact.artifactId === "string" ? artifact.artifactId : null;
    const sourceUrl = typeof artifact.sourceUrl === "string" ? artifact.sourceUrl : null;
    if (!artifactId || !sourceUrl) continue;

    const sourceDocument = await upsertDestinationSourceDocument({
      companyId,
      destinationKey: missionDestinationKey,
      workflowRunId: mission.id,
      sourceUrl,
      sourceType: "officialDiscovery",
      officialnessScore: typeof artifact.officialnessScore === "number" ? artifact.officialnessScore : undefined,
      rawText: typeof artifact.rawText === "string" ? artifact.rawText : "",
      metadata: {
        artifactId,
        authorityGrade: typeof artifact.authorityGrade === "string" ? artifact.authorityGrade : null,
        searchQuery: typeof artifact.searchQuery === "string" ? artifact.searchQuery : null,
        sourceHost: typeof artifact.sourceHost === "string" ? artifact.sourceHost : null,
        title: typeof artifact.title === "string" ? artifact.title : null,
      },
      fetchedAt: new Date().toISOString(),
    });

    const candidate = await upsertDestinationCandidate({
      companyId,
      destinationKey: missionDestinationKey,
      workflowRunId: mission.id,
      candidateFingerprint: artifactId,
      canonicalSourceUrl: sourceUrl,
      proposedType: typeof artifact.listingKindHint === "string" ? artifact.listingKindHint : undefined,
      metadata: {
        title: typeof artifact.title === "string" ? artifact.title : null,
        categoryHint: typeof artifact.categoryHint === "string" ? artifact.categoryHint : null,
        boroughGuess: typeof artifact.boroughGuess === "string" ? artifact.boroughGuess : null,
        neighborhoodGuess: typeof artifact.neighborhoodGuess === "string" ? artifact.neighborhoodGuess : null,
        authorityGrade: typeof artifact.authorityGrade === "string" ? artifact.authorityGrade : null,
        prefilterReasons: Array.isArray(artifact.prefilterReasons) ? artifact.prefilterReasons : [],
        searchQuery: typeof artifact.searchQuery === "string" ? artifact.searchQuery : null,
        scarcityTargets: Array.isArray(artifact.scarcityTargets) ? artifact.scarcityTargets : [],
        scoreResult: asRecord(artifact.scoreResult),
        sourceDocumentId: sourceDocument.id,
        discoveryArtifact: artifact,
      },
    });

    persisted.push({ artifact, candidate, sourceDocument });
  }

  if (mission.state === "QUEUED") {
    await transitionDestinationMissionState({
      companyId,
      missionId: mission.id,
      nextState: "CATALOG_INSPECTED",
      metadata: { discoveredBy: auth.session.email, discoveredCount: persisted.length },
    }).catch(() => null);
  }

  return NextResponse.json({ ok: true, persisted });
}
