import { NextRequest, NextResponse } from "next/server";
import { createOAuthState, buildAuthorizeUrl, isSsoConfigured, OAUTH_STATE_COOKIE, APP_SESSION_COOKIE } from "@/lib/auth";

export async function GET(req: NextRequest) {
  if (!isSsoConfigured()) {
    return NextResponse.redirect(new URL("/?authError=sso_not_configured", req.url));
  }

  const returnTo = new URL(req.url).searchParams.get("returnTo") || "/";
  const { token, payload } = createOAuthState(returnTo);
  const redirectUrl = buildAuthorizeUrl(payload);

  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set(OAUTH_STATE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 15,
  });
  return response;
}