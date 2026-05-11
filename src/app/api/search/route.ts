import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { searchCompanyContext, type SearchEntityType } from "@/lib/internal-search";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  const query = request.nextUrl.searchParams.get("q") || "";
  const entityTypes = (request.nextUrl.searchParams.get("entityTypes") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean) as SearchEntityType[];

  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  try {
    const results = await searchCompanyContext(companyId, query, 24, { entityTypes });
    return NextResponse.json(results);
  } catch (error) {
    console.error("[API:Search] failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
