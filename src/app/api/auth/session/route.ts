import { NextRequest, NextResponse } from "next/server";
import { readAppSession } from "@/lib/auth";
import { isSuperAdminEmail } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const session = await readAppSession(req);
  
  if (!session) {
    return NextResponse.json({ authenticated: false });
  }

  const isSuperAdmin = await isSuperAdminEmail(session.email);

  return NextResponse.json({
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
  });
}
