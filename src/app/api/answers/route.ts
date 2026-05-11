import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { buildGroundedAnswer } from "@/lib/grounded-answers";
import type { SearchEntityType } from "@/lib/internal-search";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const companyId = String(data.companyId || "");
    const question = String(data.question || "").trim();
    const entityTypes = Array.isArray(data.entityTypes)
      ? data.entityTypes.map((item: unknown) => String(item).trim()).filter(Boolean) as SearchEntityType[]
      : [];

    if (!companyId || !question) {
      return NextResponse.json({ error: "companyId and question required" }, { status: 400 });
    }

    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;

    const answer = await buildGroundedAnswer(companyId, question, { entityTypes });
    return NextResponse.json(answer);
  } catch (error) {
    console.error("[API:Answers] failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
