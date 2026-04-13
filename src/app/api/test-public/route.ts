import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ status: "alive", timestamp: new Date().toISOString() });
}

export async function POST() {
  return NextResponse.json({ status: "alive (POST)", timestamp: new Date().toISOString() });
}
