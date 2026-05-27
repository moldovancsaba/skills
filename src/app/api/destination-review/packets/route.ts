import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyIngestSecret } from "@/lib/ingest-auth";
import { verifyMembership } from "@/lib/permissions";
import { submitDestinationReviewPacket } from "@/lib/destination-review-bridge";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  const packetState = request.nextUrl.searchParams.get("packetState");
  const packets = await prisma.destinationReviewPacket.findMany({
    where: {
      companyId: companyId as string,
      ...(packetState ? { packetState } : {}),
    },
    orderBy: [{ submittedAt: "desc" }],
    include: {
      reviewDecisions: {
        orderBy: { reviewedAt: "desc" },
        take: 1,
      },
      outcomeMemories: {
        orderBy: { createdAt: "desc" },
        take: 3,
      },
    },
  });

  return NextResponse.json(packets);
}

export async function POST(request: NextRequest) {
  const auth = await verifyIngestSecret(request);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const required = ["companyId", "destinationKey", "workflowRunId", "candidateId", "draftId", "bridgeVersion", "draftPayload", "evidenceSummary", "diagnostics"];
    for (const field of required) {
      if (!(field in body)) {
        return NextResponse.json({ error: `${field} is required` }, { status: 400 });
      }
    }

    const packet = await submitDestinationReviewPacket(body);
    return NextResponse.json({ ok: true, packet });
  } catch (error) {
    console.error("[API:DestinationReview:Packets] POST failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
