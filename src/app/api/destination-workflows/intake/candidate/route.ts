import { NextRequest, NextResponse } from "next/server";
import { verifyIngestSecret } from "@/lib/ingest-auth";
import { upsertDestinationCandidate } from "@/lib/destination-workflows";
import type { DestinationCandidateInput } from "@/lib/destination-workflow-contract";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await verifyIngestSecret(request);
  if (auth.error) return auth.error;

  try {
    const body = (await request.json()) as DestinationCandidateInput;
    if (!body.companyId || !body.destinationKey || !body.canonicalSourceUrl) {
      return NextResponse.json(
        { error: "companyId, destinationKey, and canonicalSourceUrl are required" },
        { status: 400 },
      );
    }

    const record = await upsertDestinationCandidate(body);
    return NextResponse.json({ ok: true, candidate: record });
  } catch (error) {
    console.error("[API:DestinationWorkflows:CandidateIntake] failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
