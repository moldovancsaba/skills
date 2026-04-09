import { NextRequest, NextResponse } from "next/server";
import { readAppSession } from "./auth";
import { prisma } from "./db";

export type Role = "SUPERADMIN" | "OWNER" | "MEMBER";

export async function isSuperAdminEmail(email: string) {
  const membership = await prisma.user.findFirst({
    where: {
      email: email.trim().toLowerCase(),
      role: "SUPERADMIN",
    },
    select: { id: true },
  });

  return Boolean(membership);
}

export async function verifySuperAdmin(req: NextRequest) {
  const session = await readAppSession(req);
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const isSuperAdmin = await isSuperAdminEmail(session.email);
  if (!isSuperAdmin) {
    return { error: NextResponse.json({ error: "Forbidden: SUPERADMIN role required" }, { status: 403 }) };
  }

  return { session };
}

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

  if (requiredRole && membership.role !== requiredRole && membership.role !== "OWNER" && membership.role !== "SUPERADMIN") {
    return { error: NextResponse.json({ error: `Forbidden: ${requiredRole} role required` }, { status: 403 }) };
  }

  return { session, membership };
}
