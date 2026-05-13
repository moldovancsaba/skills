import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "Missing companyId" }, { status: 400 });

  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  try {
    const snapshot = await prisma.intelligenceSnapshot.findUnique({
      where: { companyId },
      select: { analyticsHistory: true },
    });

    return NextResponse.json(Array.isArray(snapshot?.analyticsHistory) ? snapshot.analyticsHistory : []);
  } catch (error) {
    console.error("[API:Analytics] Failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
