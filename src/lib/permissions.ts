import { NextRequest, NextResponse } from "next/server";
import { readAppSession } from "./auth";
import { prisma } from "./db";

export type Role = "OWNER" | "MEMBER";

export async function verifyMembership(
  req: NextRequest, 
  companyId: string | null | undefined,
  requiredRole?: Role
) {
  if (!companyId) {
    return { error: NextResponse.json({ error: "Company ID is required" }, { status: 400 }) };
  }

  const session = await readAppSession(req);
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const membership = await prisma.user.findFirst({
    where: {
      email: session.email.trim().toLowerCase(),
      companyId: companyId as string
    }
  });

  if (!membership) {
    return { error: NextResponse.json({ error: "Forbidden: You are not a member of this company" }, { status: 403 }) };
  }

  if (requiredRole && membership.role !== requiredRole && membership.role !== "OWNER") {
    return { error: NextResponse.json({ error: `Forbidden: ${requiredRole} role required` }, { status: 403 }) };
  }

  return { session, membership };
}
