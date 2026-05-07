import { NextRequest, NextResponse } from "next/server";

export const APP_SESSION_COOKIE = "checklist_session";

function redirect(url: URL) {
  return NextResponse.redirect(url, 302);
}

// Renamed from 'middleware' to 'proxy' to conform to Next.js 16.2.2 Turbopack expectations.
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const session = req.cookies.get(APP_SESSION_COOKIE)?.value;
  const accept = req.headers.get("accept") || "";
  const isDocumentRequest = req.method === "GET" && accept.includes("text/html");

  // 1. Allow these specific public paths
  const publicPaths = ["/login", "/auth", "/auth/callback", "/api/auth", "/api/bridge", "/api/test-public"];
  const isPublicPath = publicPaths.some((path) => pathname.startsWith(path));

  // 2. Allow static files regardless of auth
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/webhook") ||
    pathname === "/favicon.ico" ||
    /\.(.*)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  // 3. Handle Login page redirection
  if (pathname === "/login") {
    if (session) {
      return redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  // 4. Force Login for all other routes (including /)
  if (!session && !isPublicPath) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("returnTo", `${pathname}${search}`);

    // Embedded browsers are much more reliable when we render the first-party login
    // surface directly instead of forcing an immediate redirect chain.
    if (isDocumentRequest) {
      return NextResponse.rewrite(loginUrl);
    }

    return redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
