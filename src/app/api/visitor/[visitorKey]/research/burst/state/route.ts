import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ visitorKey: string }> },
) {
  const companyId = String(request.nextUrl.searchParams.get("companyId") || "").trim();
  if (!companyId) return NextResponse.json({ ok: false, error: "companyId is required" }, { status: 400 });
  const auth = await verifyMembership(request, companyId, "MEMBER");
  if (auth.error) return auth.error;

  const { visitorKey } = await params;
  const row = await prisma.globalSetting.findUnique({
    where: { key: `miniapp_burst_controller:${companyId}:${visitorKey.trim().toLowerCase()}` },
    select: { value: true, updatedAt: true },
  });
  const state = row?.value && typeof row.value === "object" && !Array.isArray(row.value)
    ? row.value
    : {};
  return NextResponse.json({ ok: true, visitorKey, state });
}
