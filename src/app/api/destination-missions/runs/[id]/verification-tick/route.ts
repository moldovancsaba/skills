import { NextRequest, NextResponse } from "next/server";
import { runClassScoutPublishVerificationTick } from "@/lib/classscout-publish-verification";
import { normalizeDestinationKey } from "@/lib/destination-scope";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const bodyRaw = await request.json().catch(() => null);
  if (!bodyRaw || typeof bodyRaw !== "object" || Array.isArray(bodyRaw)) {
    return NextResponse.json({ error: "JSON object body is required" }, { status: 400 });
  }
  const body = bodyRaw as Record<string, unknown>;
  const companyId = typeof body.companyId === "string" ? body.companyId : "";
  if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  const destinationKey = normalizeDestinationKey(body.destinationKey);
  if (destinationKey !== "classscout") {
    return NextResponse.json({ error: "destinationKey must be classscout" }, { status: 400 });
  }

  const auth = await verifyMembership(request, companyId, "ADMIN");
  if (auth.error) return auth.error;

  const { id } = await params;
  const targetListingType = body.targetListingType === "provider" || body.targetListingType === "meetupGroup"
    ? body.targetListingType
    : null;
  const result = await runClassScoutPublishVerificationTick({
    companyId,
    missionId: id,
    targetListingId: typeof body.targetListingId === "string" ? body.targetListingId : null,
    targetListingType,
    expectedTitle: typeof body.expectedTitle === "string" ? body.expectedTitle : null,
    expectedImageUrl: typeof body.expectedImageUrl === "string" ? body.expectedImageUrl : null,
    attemptsMax: Number.isFinite(Number(body.attemptsMax)) ? Number(body.attemptsMax) : undefined,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : result.status });
}

