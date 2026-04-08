import { NextRequest } from "next/server";
import { handleOAuthCallback } from "@/lib/auth";

export async function GET(req: NextRequest) {
  return handleOAuthCallback(req);
}
