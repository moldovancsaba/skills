import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readAppSession } from "@/lib/auth";

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
      where: { companyId, email: session.email }
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

    if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

    // Check if requester is OWNER
    const requester = await prisma.user.findFirst({
      where: { companyId, email: session.email, role: "OWNER" }
    });

    if (!requester) return NextResponse.json({ error: "Only owners can invite" }, { status: 403 });

    // Add user to company (direct association)
    const newUser = await prisma.user.upsert({
      where: {
        email_companyId: {
          email,
          companyId
        }
      },
      update: {
        role: role || "MEMBER"
      },
      create: {
        email,
        name: name || null,
        companyId,
        role: role || "MEMBER"
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
      where: { companyId, email: session.email, role: "OWNER" }
    });

    if (!requester) return NextResponse.json({ error: "Only owners can remove members" }, { status: 403 });

    await prisma.user.delete({
      where: { id: userId, companyId }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
