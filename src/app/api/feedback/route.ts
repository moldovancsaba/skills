import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const nbaItemId = request.nextUrl.searchParams.get("nbaItemId");
    
    const where = nbaItemId ? { nbaItemId } : {};
    const feedbacks = await prisma.feedback.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    
    return NextResponse.json(feedbacks);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    let iceImpact = 0;
    if (data.action === "ACCEPT") {
      iceImpact = 10;
    } else if (data.action === "DECLINE") {
      iceImpact = -50;
    }
    
    const feedback = await prisma.feedback.create({
      data: {
        nbaItemId: data.nbaItemId,
        action: data.action,
        annotation: data.annotation,
        iceImpact,
      },
    });
    
    if (data.action === "ACCEPT" || data.action === "DECLINE") {
      const item = await prisma.nBAItem.findUnique({
        where: { id: data.nbaItemId },
      });
      
      if (item) {
        const newScore = item.iceScore * (1 + iceImpact / 100);
        await prisma.nBAItem.update({
          where: { id: data.nbaItemId },
          data: {
            status: data.action === "ACCEPT" ? "ACCEPTED" : "DECLINED",
            iceScore: Math.max(10, newScore),
            userAnnotation: data.annotation,
          },
        });
      }
    }
    
    return NextResponse.json(feedback);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}