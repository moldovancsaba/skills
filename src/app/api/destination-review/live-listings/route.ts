import { NextRequest, NextResponse } from "next/server";
import { createClassScoutLiveRevision, listClassScoutLiveListings } from "@/lib/destination-classscout";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  const listingType = request.nextUrl.searchParams.get("listingType");
  const borough = request.nextUrl.searchParams.get("borough") ?? undefined;
  const query = request.nextUrl.searchParams.get("query") ?? undefined;

  const result = await listClassScoutLiveListings({
    companyId: companyId as string,
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
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const companyId = typeof body?.companyId === "string" ? body.companyId : null;
  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  const listingId = typeof body?.listingId === "string" ? body.listingId : null;
  const listingType = body?.listingType === "provider" || body?.listingType === "meetupGroup" ? body.listingType : null;
  if (!companyId || !listingId || !listingType) {
    return NextResponse.json({ error: "companyId, listingId, and listingType are required" }, { status: 400 });
  }

  const result = await createClassScoutLiveRevision({
    companyId,
    listingId,
    listingType,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : result.status });
}
