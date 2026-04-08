import { NextRequest, NextResponse } from "next/server";

export const APP_SESSION_COOKIE = "checklist_session";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = req.cookies.get(APP_SESSION_COOKIE)?.value;

  // 1. Allow these specific public paths
  const publicPaths = ["/login", "/auth/callback", "/api/auth"];
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
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  // 4. Force Login for all other routes (including /)
  if (!session && !isPublicPath) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(loginUrl);
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
