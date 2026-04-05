import { NextRequest, NextResponse } from "next/server";
import { readOAuthState, exchangeCodeForTokens, getUserInfo, createAppSession, OAUTH_STATE_COOKIE, APP_SESSION_COOKIE } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const state = searchParams.get("state");

  if (error) {
    return NextResponse.redirect(new URL(`/?authError=${error}`, req.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/?authError=no_code", req.url));
  }

  try {
    const stateCookie = req.cookies.get(OAUTH_STATE_COOKIE)?.value;
    if (!stateCookie) {
      return NextResponse.redirect(new URL("/?authError=no_state", req.url));
    }

    const oauthState = readOAuthState(stateCookie);
    if (!oauthState || oauthState.state !== state) {
      return NextResponse.redirect(new URL("/?authError=invalid_state", req.url));
    }

    const tokens = await exchangeCodeForTokens(code, oauthState.codeVerifier);
    const userInfo = await getUserInfo(tokens.access_token);

    const session = createAppSession({
      sub: userInfo.sub || userInfo.id,
      email: userInfo.email,
      name: userInfo.name || userInfo.email,
      picture: userInfo.picture,
      provider: "google",
    });

    const returnTo = oauthState.returnTo || "/";
    const response = NextResponse.redirect(new URL(returnTo, req.url));

    response.cookies.set(APP_SESSION_COOKIE, session, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    response.cookies.delete(OAUTH_STATE_COOKIE);
    return response;
  } catch (err) {
    return NextResponse.redirect(new URL("/?authError=callback_failed", req.url));
  }
}