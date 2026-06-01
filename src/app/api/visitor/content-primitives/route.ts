import { NextResponse } from "next/server";
import { VISITOR_CONTENT_PRIMITIVES } from "@/lib/visitor-blueprints";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    contentPrimitives: VISITOR_CONTENT_PRIMITIVES,
  });
}
