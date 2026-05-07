import { NextRequest, NextResponse } from "next/server";
import { createOAuthState, buildAuthorizeUrl, isSsoConfigured, OAUTH_STATE_COOKIE } from "@/lib/auth";

export async function GET(req: NextRequest) {
  if (!isSsoConfigured()) {
    return NextResponse.redirect(new URL("/?authError=sso_not_configured", req.url), 302);
  }

  const returnTo = new URL(req.url).searchParams.get("returnTo") || "/";
  const { token, payload } = createOAuthState(returnTo);
  const redirectUrl = buildAuthorizeUrl(token, payload);

  const response = NextResponse.redirect(redirectUrl, 302);
  response.cookies.set(OAUTH_STATE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 15,
  });
  return response;
}
