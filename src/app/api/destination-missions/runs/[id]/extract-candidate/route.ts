import { NextRequest, NextResponse } from "next/server";
import { extractClassScoutCandidate } from "@/lib/destination-classscout";
import { extractCompareCandidate } from "@/lib/destination-compare";
import { getDestinationMissionRun, transitionDestinationMissionState } from "@/lib/destination-missions";
import { createDestinationFactSnapshot } from "@/lib/destination-workflows";
import type { DestinationKey } from "@/lib/destination-workflow-contract";
import { verifyMembership } from "@/lib/permissions";
import { normalizeDestinationKey } from "@/lib/destination-scope";

export const dynamic = "force-dynamic";

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
    return NextResponse.json({ error: "Mission destination is not supported for extraction" }, { status: 400 });
  }
  const missionDestinationKey: DestinationKey = mission.destinationKey;

  const candidateId = typeof body.candidateId === "string" ? body.candidateId : "";
  const discoveryArtifact = asRecord(body.discoveryArtifact);
  if (!candidateId || !discoveryArtifact) {
    return NextResponse.json({ error: "candidateId and discoveryArtifact are required" }, { status: 400 });
  }

  const extraction = mission.destinationKey === "classscout"
    ? await extractClassScoutCandidate({ discoveryArtifact: discoveryArtifact as never })
    : await extractCompareCandidate({ discoveryArtifact: discoveryArtifact as never });
  if (!extraction.ok) {
    return NextResponse.json(
      {
        error: `${mission.destinationKey === "classscout" ? "ClassScout" : "Compare"} extraction failed`,
        detail: extraction.data ?? extraction.error ?? null,
      },
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
    destinationKey: missionDestinationKey,
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
