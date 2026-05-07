import { NextRequest, NextResponse } from "next/server";
import { APP_SESSION_COOKIE } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const returnTo = new URL(req.url).searchParams.get("returnTo") || "/";
  const response = NextResponse.redirect(new URL(returnTo, req.url), 302);
  response.cookies.delete(APP_SESSION_COOKIE);
  return response;
}
