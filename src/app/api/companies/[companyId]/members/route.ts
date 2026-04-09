import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readAppSession } from "@/lib/auth";

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ companyId: string }> }
) {
  try {
    const session = await readAppSession(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { companyId } = await context.params;

    // Check if requester is member of this company
    const requester = await prisma.user.findFirst({
      where: { companyId, email: normalizeEmail(session.email) }
    });

    if (!requester) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const members = await prisma.user.findMany({
      where: { companyId },
      orderBy: { createdAt: "asc" }
    });

    return NextResponse.json(members);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ companyId: string }> }
) {
  try {
    const session = await readAppSession(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { companyId } = await context.params;
    const { email, name, role } = await request.json();
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) return NextResponse.json({ error: "Email required" }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    // Check if requester is OWNER
    const requester = await prisma.user.findFirst({
      where: { companyId, email: normalizeEmail(session.email), role: "OWNER" }
    });

    if (!requester) return NextResponse.json({ error: "Only owners can invite" }, { status: 403 });
    if (normalizedEmail === normalizeEmail(session.email)) {
      return NextResponse.json({ error: "You already have access to this company" }, { status: 400 });
    }

    // Create or refresh the invitation. Access is claimed automatically on first login with this email.
    const newUser = await prisma.user.upsert({
      where: {
        email_companyId: {
          email: normalizedEmail,
          companyId
        }
      },
      update: {
        role: role || "MEMBER",
        invitedAt: new Date(),
        invitedByEmail: normalizeEmail(session.email),
      },
      create: {
        email: normalizedEmail,
        name: name || null,
        companyId,
        role: role || "MEMBER",
        invitedAt: new Date(),
        invitedByEmail: normalizeEmail(session.email),
        acceptedAt: null,
      }
    });

    return NextResponse.json(newUser);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ companyId: string }> }
) {
  try {
    const session = await readAppSession(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { companyId } = await context.params;
    const userId = request.nextUrl.searchParams.get("id");

    if (!userId) return NextResponse.json({ error: "User ID required" }, { status: 400 });

    // Check if requester is OWNER
    const requester = await prisma.user.findFirst({
      where: { companyId, email: normalizeEmail(session.email), role: "OWNER" }
    });

    if (!requester) return NextResponse.json({ error: "Only owners can remove members" }, { status: 403 });

    await prisma.user.deleteMany({
      where: { id: userId, companyId }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
