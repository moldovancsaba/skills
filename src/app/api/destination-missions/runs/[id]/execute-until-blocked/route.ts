import { NextRequest, NextResponse } from "next/server";
import { DestinationMissionState } from "@prisma/client";
import { executeClassScoutMissionNextAttempt } from "@/lib/destination-mission-runner";
import { getDestinationMissionRun } from "@/lib/destination-missions";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => ({}));
  const companyId = String(body.companyId || "");
  const auth = await verifyMembership(request, companyId, "ADMIN");
  if (auth.error) return auth.error;

  const { id } = await params;
  const maxPasses = Math.max(1, Math.min(typeof body.maxPasses === "number" ? body.maxPasses : 3, 8));
  const maxAutoRejections = Math.max(1, Math.min(typeof body.maxAutoRejections === "number" ? body.maxAutoRejections : 5, 10));

  const passes: Array<Record<string, unknown>> = [];
  let lastResult: Awaited<ReturnType<typeof executeClassScoutMissionNextAttempt>> | null = null;

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const result = await executeClassScoutMissionNextAttempt({
      companyId,
      missionId: id,
      actorId: auth.session.email,
      maxAutoRejections,
    });
    lastResult = result;
    passes.push({
      pass: pass + 1,
      ok: result.ok,
      reviewReady: result.ok ? Boolean(result.reviewReady) : false,
      terminal: result.ok ? Boolean(result.terminal) : false,
      candidateId: result.ok ? result.candidateId ?? null : null,
      draftId: result.ok ? result.draftId ?? null : null,
      trail: result.trail ?? [],
      error: result.ok ? null : result.error ?? "Mission execution failed",
    });

    if (!result.ok || result.reviewReady || result.terminal) {
      break;
    }

    const mission = await getDestinationMissionRun(companyId, id);
    if (!mission) break;
    if (
      mission.state === DestinationMissionState.PAUSED ||
      mission.state === DestinationMissionState.PUBLISHED_VERIFIED ||
      mission.state === DestinationMissionState.EXHAUSTED ||
      mission.state === DestinationMissionState.FAILED_TERMINAL
    ) {
      break;
    }
  }

  if (!lastResult) {
    return NextResponse.json({ error: "Mission execution did not start", passes }, { status: 500 });
  }

  if (!lastResult.ok) {
    return NextResponse.json(
      {
        error: lastResult.error ?? "Mission execution failed",
        status: lastResult.status ?? 500,
        passes,
      },
      { status: lastResult.status ?? 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    reviewReady: lastResult.reviewReady ?? false,
    terminal: lastResult.terminal ?? false,
    mission: lastResult.mission ?? null,
    candidateId: lastResult.candidateId ?? null,
    draftId: lastResult.draftId ?? null,
    trail: lastResult.trail ?? [],
    passes,
  });
}
