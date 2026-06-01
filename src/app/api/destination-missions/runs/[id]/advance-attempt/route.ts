import { NextRequest, NextResponse } from "next/server";
import { advanceDestinationMissionAttempt, getDestinationMissionRun } from "@/lib/destination-missions";
import type { DestinationMissionAttemptOutcome } from "@/lib/destination-mission-contract";
import { normalizeDestinationKey } from "@/lib/destination-scope";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asAttemptOutcome(value: unknown): DestinationMissionAttemptOutcome | null {
  const record = asRecord(value);
  if (!record) return null;
  const terminalKind = record.terminalKind;
  if (
    terminalKind !== "rejected" &&
    terminalKind !== "retryable_failure" &&
    terminalKind !== "review_ready" &&
    terminalKind !== "published_verified" &&
    terminalKind !== "publish_failed"
  ) {
    return null;
  }
  return record as DestinationMissionAttemptOutcome;
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
  if (destinationKey) {
    const existingRun = await getDestinationMissionRun(companyId, id);
    if (!existingRun || existingRun.destinationKey !== destinationKey) {
      return NextResponse.json({ error: "Mission run not found" }, { status: 404 });
    }
  }
  const run = await advanceDestinationMissionAttempt({
    companyId,
    missionId: id,
    candidateId: typeof body.candidateId === "string" ? body.candidateId : null,
    workflowRunId: typeof body.workflowRunId === "string" ? body.workflowRunId : null,
    candidateFingerprint: typeof body.candidateFingerprint === "string" ? body.candidateFingerprint : null,
    outcome: asAttemptOutcome(body.outcome),
    metadata: asRecord(body.metadata) ?? { advancedBy: auth.session.email },
  });
  if (!run) return NextResponse.json({ error: "Mission run not found" }, { status: 404 });
  return NextResponse.json({ ok: true, run });
}
