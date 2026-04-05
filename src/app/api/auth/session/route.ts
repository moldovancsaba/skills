import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { APP_SESSION_COOKIE } from "@/lib/auth";

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(APP_SESSION_COOKIE)?.value;
  if (!token) return null;
  
  try {
    const parts = token.split(".");
    if (parts.length < 3) return null;
    const data = JSON.parse(Buffer.from(parts[1], "base64").toString());
    const now = Math.floor(Date.now() / 1000);
    if (data.exp && data.exp < now) return null;
    if (!data.sub || !data.email || !data.name) return null;
    return { sub: data.sub, email: data.email, name: data.name, picture: data.picture };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  
  if (!session) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: session.sub,
      email: session.email,
      name: session.name,
      picture: session.picture,
    },
  });
}