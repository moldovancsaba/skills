import { NextRequest, NextResponse } from "next/server";
import { readAppSession } from "@/lib/auth";
import { isSuperAdminEmail } from "@/lib/permissions";
import { createRequestProfiler } from "@/lib/request-profile";

export async function GET(req: NextRequest) {
  const profiler = createRequestProfiler(req, "auth-session");
  const session = await profiler.measure("readAppSession", () => readAppSession(req));
  
  if (!session) {
    return profiler.apply(NextResponse.json({ authenticated: false }));
  }

  const scope = req.nextUrl.searchParams.get("scope");
  if (scope === "identity") {
    const response = NextResponse.json({
      authenticated: true,
      id: session.sub,
      email: session.email,
      name: session.name,
      picture: session.picture,
      user: {
        id: session.sub,
        email: session.email,
        name: session.name,
        picture: session.picture,
      },
      ...(profiler.enabled ? { profile: profiler.getSummary() } : {}),
    });
    return profiler.apply(response);
  }

  const isSuperAdmin = await profiler.measure("isSuperAdminEmail", () => isSuperAdminEmail(session.email));

  const response = NextResponse.json({
    authenticated: true,
    id: session.sub,
    email: session.email,
    name: session.name,
    picture: session.picture,
    isSuperAdmin,
    user: {
      id: session.sub,
      email: session.email,
      name: session.name,
      picture: session.picture,
      isSuperAdmin,
    },
    ...(profiler.enabled ? { profile: profiler.getSummary() } : {}),
  });
  return profiler.apply(response);
}
