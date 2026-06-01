import { NextRequest, NextResponse } from "next/server";
import { createClassScoutLiveRevision, listClassScoutLiveListings } from "@/lib/destination-classscout";
import { verifyMembership } from "@/lib/permissions";
import { normalizeDestinationKey, supportsDestinationLiveListingOps } from "@/lib/destination-scope";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const companyId = String(request.nextUrl.searchParams.get("companyId") || "");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }
  const destinationKeyRaw = request.nextUrl.searchParams.get("destinationKey");
  const destinationKey = normalizeDestinationKey(destinationKeyRaw);
  if (destinationKeyRaw && (!destinationKey || !supportsDestinationLiveListingOps(destinationKey))) {
    return NextResponse.json({ error: "destinationKey must be classscout for this route" }, { status: 400 });
  }
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  const listingType = request.nextUrl.searchParams.get("listingType");
  const borough = request.nextUrl.searchParams.get("borough") ?? undefined;
  const query = request.nextUrl.searchParams.get("query") ?? undefined;

  const result = await listClassScoutLiveListings({
    companyId,
    listingType:
      listingType === "provider" || listingType === "meetupGroup" || listingType === "all"
        ? listingType
        : "all",
    borough,
    query,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : result.status });
}

export async function POST(request: NextRequest) {
  const bodyRaw = await request.json();
  if (!bodyRaw || typeof bodyRaw !== "object" || Array.isArray(bodyRaw)) {
    return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
  }
  const body = bodyRaw as Record<string, unknown>;
  const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }
  const destinationKeyRaw = typeof body.destinationKey === "string" ? body.destinationKey : "";
  const destinationKey = normalizeDestinationKey(destinationKeyRaw);
  if (destinationKeyRaw && (!destinationKey || !supportsDestinationLiveListingOps(destinationKey))) {
    return NextResponse.json({ error: "destinationKey must be classscout for this route" }, { status: 400 });
  }
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  const listingId = typeof body.listingId === "string" ? body.listingId : null;
  const listingType = body.listingType === "provider" || body.listingType === "meetupGroup" ? body.listingType : null;
  if (!listingId || !listingType) {
    return NextResponse.json({ error: "listingId and listingType are required" }, { status: 400 });
  }

  const result = await createClassScoutLiveRevision({
    companyId,
    listingId,
    listingType,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : result.status });
}
