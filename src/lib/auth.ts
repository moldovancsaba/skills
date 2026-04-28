import { createHash, createHmac, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";

const SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const OAUTH_MAX_AGE = 60 * 15;

export const APP_SESSION_COOKIE = "checklist_session";
export const OAUTH_STATE_COOKIE = "checklist_oauth";

export type AppSession = {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  provider: "google";
};

export type OAuthTokenResponse = {
  access_token: string;
  id_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
};

function base64Url(buffer: Buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createCodeVerifier() {
  return base64Url(randomBytes(32));
}

function createCodeChallenge(verifier: string) {
  const hash = createHash("sha256").update(verifier).digest();
  return base64Url(hash);
}

function createRandomToken() {
  return base64Url(randomBytes(24));
}

function createSignature(payload: string): string {
  const secret = process.env.APP_SESSION_SECRET || "default-secret-change-me";
  return createHmac("sha256", secret).update(payload).digest("base64");
}

function createToken(payload: object, maxAge: number): string {
  const header = base64Url(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const now = Math.floor(Date.now() / 1000);
  const data = { ...payload, iat: now, exp: now + maxAge };
  const body = base64Url(Buffer.from(JSON.stringify(data)));
  const sig = createSignature(`${header}.${body}`);
  return `${header}.${body}.${base64Url(Buffer.from(sig))}`;
}

function parseSignedPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 3) return null;
    const sig = createSignature(`${parts[0]}.${parts[1]}`);
    const expectedSig = base64Url(Buffer.from(sig));
    if (parts[2] !== expectedSig) return null;
    const data = JSON.parse(Buffer.from(parts[1], "base64").toString());
    const now = Math.floor(Date.now() / 1000);
    if (data.exp && data.exp < now) return null;
    return data;
  } catch {
    return null;
  }
}

export function isSsoConfigured() {
  return Boolean(
    process.env.SSO_CLIENT_ID &&
    process.env.SSO_CLIENT_SECRET &&
    process.env.SSO_AUTH_URL &&
    process.env.SSO_TOKEN_URL
  );
}

export type OAuthState = { state: string; nonce: string; codeVerifier: string; returnTo: string };

export function createOAuthState(returnTo: string): { token: string; payload: OAuthState } {
  const payload: OAuthState = {
    state: createRandomToken(),
    nonce: createRandomToken(),
    codeVerifier: createCodeVerifier(),
    returnTo: returnTo || "/",
  };
  return { token: createToken(payload, OAUTH_MAX_AGE), payload };
}

export function readOAuthState(token: string): OAuthState | null {
  const data = parseSignedPayload(token);
  if (!data || typeof data.state !== "string" || typeof data.nonce !== "string" || typeof data.codeVerifier !== "string") {
    return null;
  }

  return {
    state: data.state,
    nonce: data.nonce,
    codeVerifier: data.codeVerifier,
    returnTo: typeof data.returnTo === "string" ? data.returnTo : "/",
  };
}

export function createAppSession(session: AppSession): string {
  return createToken({
    ...session,
    email: session.email.trim().toLowerCase(),
  }, SESSION_MAX_AGE);
}

export async function readAppSession(req: NextRequest): Promise<AppSession | null> {
  const token = req.cookies.get(APP_SESSION_COOKIE)?.value;
  if (!token) return null;
  const data = parseSignedPayload(token);
  if (!data || typeof data.sub !== "string" || typeof data.email !== "string" || typeof data.name !== "string") {
    return null;
  }

  return {
    sub: data.sub,
    email: data.email.trim().toLowerCase(),
    name: data.name,
    picture: typeof data.picture === "string" ? data.picture : undefined,
    provider: "google",
  };
}

function normalizeEmail(value: string | null | undefined) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function getSsoRedirectUri() {
  if (process.env.SSO_REDIRECT_URI) {
    return process.env.SSO_REDIRECT_URI;
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://checklist.checklistsquad.com";
  const redirectPath = process.env.SSO_REDIRECT_PATH || "/auth/callback";
  return `${baseUrl}${redirectPath}`;
}

export function getSsoScopes() {
  return process.env.SSO_SCOPES || "openid profile email offline_access";
}

export function buildAuthorizeUrl(oauthState: OAuthState): string {
  const authUrl = new URL(process.env.SSO_AUTH_URL!);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", process.env.SSO_CLIENT_ID!);
  authUrl.searchParams.set("redirect_uri", getSsoRedirectUri());
  authUrl.searchParams.set("scope", getSsoScopes());
  authUrl.searchParams.set("state", oauthState.state);
  authUrl.searchParams.set("nonce", oauthState.nonce);
  authUrl.searchParams.set("code_challenge", createCodeChallenge(oauthState.codeVerifier));
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("provider", "google");
  return authUrl.toString();
}

export async function exchangeCodeForTokens(code: string, codeVerifier: string) {
  const res = await fetch(process.env.SSO_TOKEN_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      client_id: process.env.SSO_CLIENT_ID,
      client_secret: process.env.SSO_CLIENT_SECRET,
      redirect_uri: getSsoRedirectUri(),
      code_verifier: codeVerifier,
    }),
  });
  if (!res.ok) throw new Error("Token exchange failed");
  return res.json() as Promise<OAuthTokenResponse>;
}

export function decodeIdToken(idToken: string) {
  const parts = idToken.split(".");
  if (parts.length < 2) {
    throw new Error("Invalid id_token");
  }

  const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const json = Buffer.from(padded, "base64").toString("utf8");
  return JSON.parse(json) as {
    sub: string;
    email: string;
    name?: string;
    email_verified?: boolean;
    picture?: string;
  };
}

export async function handleOAuthCallback(req: NextRequest) {
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
    const userInfo = decodeIdToken(tokens.id_token);
    const normalizedEmail = normalizeEmail(userInfo.email);

    // Sync Google Profile to our membership records
    try {
      const { prisma } = await import("@/lib/db");
      await prisma.user.updateMany({
        where: { email: normalizedEmail },
        data: {
          name: userInfo.name || normalizedEmail,
          acceptedAt: new Date(),
        }
      });
    } catch (dbError) {
      console.error("Failed to sync user profile to DB:", dbError);
      // We continue anyway so the user isn't blocked by a secondary sync failure
    }

    const session = createAppSession({
      sub: userInfo.sub,
      email: normalizedEmail,
      name: userInfo.name || normalizedEmail,
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
  } catch {
    return NextResponse.redirect(new URL("/?authError=callback_failed", req.url));
  }
}
