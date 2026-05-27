import { NextRequest, NextResponse } from "next/server";
import { discoverClassScoutCandidates, type ClassScoutDiscoveryArtifact } from "@/lib/destination-classscout";
import { getDestinationMissionRun, transitionDestinationMissionState } from "@/lib/destination-missions";
import { upsertDestinationCandidate, upsertDestinationSourceDocument } from "@/lib/destination-workflows";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function asArray<T>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : [];
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => ({}));
  const companyId = String(body.companyId || "");
  const auth = await verifyMembership(request, companyId, "ADMIN");
  if (auth.error) return auth.error;

  const { id } = await params;
  const mission = await getDestinationMissionRun(companyId, id);
  if (!mission) return NextResponse.json({ error: "Mission run not found" }, { status: 404 });
  if (mission.destinationKey !== "classscout") {
    return NextResponse.json({ error: "Mission destination is not supported for discovery" }, { status: 400 });
  }

  const discovery = await discoverClassScoutCandidates({
    maxTargets: typeof body.maxTargets === "number" ? body.maxTargets : undefined,
    maxCandidates: typeof body.maxCandidates === "number" ? body.maxCandidates : undefined,
  });
  if (!discovery.ok) {
    return NextResponse.json(
      { error: "ClassScout discovery failed", detail: discovery.data ?? discovery.error ?? null },
      { status: discovery.status || 502 },
    );
  }

  const artifacts = asArray<ClassScoutDiscoveryArtifact>(discovery.data?.artifacts);
  const persisted = [];

  for (const artifact of artifacts) {
    const sourceDocument = await upsertDestinationSourceDocument({
      companyId,
      destinationKey: "classscout",
      workflowRunId: mission.id,
      sourceUrl: artifact.sourceUrl,
      sourceType: "officialDiscovery",
      officialnessScore: artifact.officialnessScore,
      rawText: artifact.rawText,
      metadata: {
        artifactId: artifact.artifactId,
        authorityGrade: artifact.authorityGrade,
        searchQuery: artifact.searchQuery,
        sourceHost: artifact.sourceHost,
        title: artifact.title,
      },
      fetchedAt: new Date().toISOString(),
    });

    const candidate = await upsertDestinationCandidate({
      companyId,
      destinationKey: "classscout",
      workflowRunId: mission.id,
      candidateFingerprint: artifact.artifactId,
      canonicalSourceUrl: artifact.sourceUrl,
      proposedType: artifact.listingKindHint,
      metadata: {
        title: artifact.title,
        categoryHint: artifact.categoryHint,
        boroughGuess: artifact.boroughGuess,
        neighborhoodGuess: artifact.neighborhoodGuess,
        authorityGrade: artifact.authorityGrade,
        prefilterReasons: artifact.prefilterReasons,
        searchQuery: artifact.searchQuery,
        scarcityTargets: artifact.scarcityTargets,
        scoreResult: artifact.scoreResult,
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
