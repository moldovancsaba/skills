import { NextRequest, NextResponse } from "next/server";
import { readAppSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await readAppSession(req);
  
  if (!session) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({
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
  });
}
