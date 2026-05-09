import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * System command API for the local worker and guardian control plane.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { command, payload, secret } = body;

    // Simple secret verification (INGEST_SECRET)
    if (secret !== process.env.INGEST_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!command) {
      return NextResponse.json({ error: "Command required" }, { status: 400 });
    }

    const cmd = await prisma.systemCommand.create({
      data: {
        command,
        payload: payload || {},
        status: "PENDING"
      }
    });

    return NextResponse.json({ success: true, commandId: cmd.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (id) {
    const cmd = await prisma.systemCommand.findUnique({ where: { id } });
    return NextResponse.json(cmd);
  }

  const history = await prisma.systemCommand.findMany({
    orderBy: { issuedAt: "desc" },
    take: 10
  });

  return NextResponse.json(history);
}
