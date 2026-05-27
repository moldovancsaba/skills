import { NextRequest, NextResponse } from "next/server";
import { getLiveListingRevisionStatus } from "@/lib/destination-live-revisions";
import { verifyIngestSecret } from "@/lib/ingest-auth";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type LiveListingType = "provider" | "meetupGroup";

function readPayload(body: Record<string, unknown>) {
  return {
    companyId: typeof body.companyId === "string" ? body.companyId : "",
    destinationKey: body.destinationKey === "classscout" ? "classscout" : null,
    listingId: typeof body.listingId === "string" ? body.listingId : "",
    listingType:
      body.listingType === "provider" || body.listingType === "meetupGroup"
        ? (body.listingType as LiveListingType)
        : null,
  };
}

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const destinationKey = request.nextUrl.searchParams.get("destinationKey");
  const listingId = request.nextUrl.searchParams.get("listingId");
  const listingType = request.nextUrl.searchParams.get("listingType");
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  if (destinationKey !== "classscout" || !listingId || (listingType !== "provider" && listingType !== "meetupGroup")) {
    return NextResponse.json({ error: "destinationKey=classscout, listingId, and valid listingType are required" }, { status: 400 });
  }

  const status = await getLiveListingRevisionStatus({
    companyId: companyId as string,
    destinationKey: "classscout",
    listingId,
    listingType,
  });
  return NextResponse.json(status);
}

export async function POST(request: NextRequest) {
  const auth = await verifyIngestSecret(request);
  if (auth.error) return auth.error;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const payload = readPayload(body);
    if (!payload.companyId || !payload.destinationKey || !payload.listingId || !payload.listingType) {
      return NextResponse.json(
        { error: "companyId, destinationKey, listingId, and listingType are required" },
        { status: 400 },
      );
    }

    const status = await getLiveListingRevisionStatus({
      companyId: payload.companyId,
      destinationKey: "classscout",
      listingId: payload.listingId,
      listingType: payload.listingType,
    });
    return NextResponse.json(status);
  } catch (error) {
    console.error("[API:DestinationReview:LiveListingStatus] failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
