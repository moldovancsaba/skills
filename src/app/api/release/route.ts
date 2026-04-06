import { NextResponse } from "next/server";

import { getReleaseMetadata } from "@/lib/release";

export async function GET() {
  return NextResponse.json(getReleaseMetadata());
}
