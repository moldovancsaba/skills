import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifySuperAdmin } from "@/lib/permissions";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await verifySuperAdmin(request);
    if (auth.error) return auth.error;

    const settings = await prisma.globalSetting.findMany({
      where: {
        key: {
          in: [
            "loop_interval_ms",
            "task_min_ice",
            "flashcard_min_confidence",
            "ollama_timeout_ms"
          ]
        }
      }
    });

    const config = settings.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {
      loop_interval_ms: 600000,
      task_min_ice: 50,
      flashcard_min_confidence: 40,
      ollama_timeout_ms: 120000
    });

    return NextResponse.json(config);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifySuperAdmin(request);
    if (auth.error) return auth.error;

    const body = await request.json();
    const { loop_interval_ms, task_min_ice, flashcard_min_confidence, ollama_timeout_ms } = body;

    const updates = [
      { key: "loop_interval_ms", value: parseInt(loop_interval_ms) || 600000 },
      { key: "task_min_ice", value: parseInt(task_min_ice) || 50 },
      { key: "flashcard_min_confidence", value: parseInt(flashcard_min_confidence) || 40 },
      { key: "ollama_timeout_ms", value: parseInt(ollama_timeout_ms) || 120000 },
    ];

    await Promise.all(
      updates.map(u => 
        prisma.globalSetting.upsert({
          where: { key: u.key },
          update: { value: u.value, updatedAt: new Date() },
          create: { key: u.key, value: u.value }
        })
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
