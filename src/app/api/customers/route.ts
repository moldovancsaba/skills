import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  
  try {
    const where = companyId ? { companyId } : {};
    const customers = await prisma.customer.findMany({ where });
    return NextResponse.json(customers);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    const customer = await prisma.customer.create({
      data: {
        companyId: data.companyId,
        name: data.name,
        email: data.email,
        segments: data.segments || [],
        painPoints: data.painPoints || [],
        channels: data.channels || [],
        lifetimeValue: data.lifetimeValue || 0,
        notes: data.notes,
      },
    });
    
    return NextResponse.json(customer);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const data = await request.json();
  
  try {
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const customer = await prisma.customer.update({
      where: { id },
      data: {
        name: data.name,
        email: data.email,
        segments: data.segments,
        painPoints: data.painPoints,
        channels: data.channels,
        lifetimeValue: data.lifetimeValue,
        notes: data.notes,
      },
    });
    return NextResponse.json(customer);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  
  try {
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    await prisma.customer.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}