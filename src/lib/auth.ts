import { createHash, createHmac, randomBytes } from "crypto";
import { NextRequest } from "next/server";

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

function parseToken(token: string): AppSession | null {
  try {
    const parts = token.split(".");
    if (parts.length < 3) return null;
    const sig = createSignature(`${parts[0]}.${parts[1]}`);
    const expectedSig = base64Url(Buffer.from(sig));
    if (parts[2] !== expectedSig) return null;
    const data = JSON.parse(Buffer.from(parts[1], "base64").toString());
    const now = Math.floor(Date.now() / 1000);
    if (data.exp && data.exp < now) return null;
    if (!data.sub || !data.email || !data.name) return null;
    return { sub: data.sub, email: data.email, name: data.name, picture: data.picture, provider: "google" };
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
  return parseToken(token) as OAuthState | null;
}

export function createAppSession(session: AppSession): string {
  return createToken(session, SESSION_MAX_AGE);
}

export async function readAppSession(req: NextRequest): Promise<AppSession | null> {
  const token = req.cookies.get(APP_SESSION_COOKIE)?.value;
  if (!token) return null;
  return parseToken(token);
}

export function getSsoRedirectUri() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://checklist.messmass.com";
  return `${baseUrl}/api/auth/callback`;
}

export function getSsoScopes() {
  return "openid profile email";
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

type TokenResponse = {
  access_token: string;
  id_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
};

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
  return res.json() as Promise<TokenResponse>;
}

export async function getUserInfo(accessToken: string) {
  const userInfoUrl = process.env.SSO_AUTH_URL!.replace("/authorize", "/userinfo");
  const res = await fetch(userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("User info failed");
  return res.json();
}