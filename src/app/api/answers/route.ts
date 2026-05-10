import { NextRequest, NextResponse } from "next/server";
import { verifyMembership } from "@/lib/permissions";
import { buildGroundedAnswer } from "@/lib/grounded-answers";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const companyId = String(data.companyId || "");
    const question = String(data.question || "").trim();

    if (!companyId || !question) {
      return NextResponse.json({ error: "companyId and question required" }, { status: 400 });
    }

    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;

    const answer = await buildGroundedAnswer(companyId, question);
    return NextResponse.json(answer);
  } catch (error) {
    console.error("[API:Answers] failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
