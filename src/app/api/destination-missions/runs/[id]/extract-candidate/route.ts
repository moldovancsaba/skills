import { NextRequest, NextResponse } from "next/server";
import { extractClassScoutCandidate, type ClassScoutDiscoveryArtifact } from "@/lib/destination-classscout";
import { getDestinationMissionRun, transitionDestinationMissionState } from "@/lib/destination-missions";
import { createDestinationFactSnapshot } from "@/lib/destination-workflows";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
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
    return NextResponse.json({ error: "Mission destination is not supported for extraction" }, { status: 400 });
  }

  const candidateId = typeof body.candidateId === "string" ? body.candidateId : "";
  const discoveryArtifact = asRecord(body.discoveryArtifact) as ClassScoutDiscoveryArtifact | null;
  if (!candidateId || !discoveryArtifact) {
    return NextResponse.json({ error: "candidateId and discoveryArtifact are required" }, { status: 400 });
  }

  const extraction = await extractClassScoutCandidate({ discoveryArtifact });
  if (!extraction.ok) {
    return NextResponse.json(
      { error: "ClassScout extraction failed", detail: extraction.data ?? extraction.error ?? null },
      { status: extraction.status || 502 },
    );
  }

  const result = asRecord(extraction.data?.result ?? extraction.data);
  const normalizedListing = asRecord(result?.normalizedListing);
  const evidenceMap = asRecord(result?.evidenceMap);
  const extractorVersion = typeof result?.extractorVersion === "string" ? result.extractorVersion : "unknown";
  if (!normalizedListing || !evidenceMap) {
    return NextResponse.json({ error: "Extraction did not return normalizedListing and evidenceMap" }, { status: 502 });
  }

  const factSnapshot = await createDestinationFactSnapshot({
    companyId,
    destinationKey: "classscout",
    candidateId,
    factsJson: normalizedListing,
    provenanceJson: {
      evidenceMap,
      discoveryArtifact,
      extractedBy: auth.session.email,
    },
    extractorVersion,
  });

  await transitionDestinationMissionState({
    companyId,
    missionId: mission.id,
    nextState: "DISCOVERING",
    metadata: {
      extractedCandidateId: candidateId,
      extractedBy: auth.session.email,
      factSnapshotId: factSnapshot.id,
    },
  }).catch(() => null);

  return NextResponse.json({
    ok: true,
    result: extraction.data,
    factSnapshot,
  });
}
