import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readAppSession } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await readAppSession(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch all companies the user has access to
    const companies = await prisma.company.findMany({
      where: {
        users: {
          some: {
            email: session.email
          }
        }
      },
      select: {
        industries: true,
        industry: true
      }
    });

    // Extract unique hashtags
    const hashtags = new Set<string>();
    companies.forEach(c => {
      c.industries.forEach(h => hashtags.add(h));
      if (c.industry) {
        // Handle persisted free-text industry values as hashtag-like strings.
        const legacy = c.industry.trim();
        if (legacy) {
          const normalized = legacy.startsWith('#') ? legacy.toLowerCase() : `#${legacy.toLowerCase().replace(/\s+/g, '-')}`;
          hashtags.add(normalized);
        }
      }
    });

    // Add some defaults if empty
    const defaults = ["#saas", "#ecommerce", "#healthcare", "#finance", "#education", "#retail", "#technology", "#manufacturing"];
    defaults.forEach(d => hashtags.add(d));

    return NextResponse.json(Array.from(hashtags).sort());
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
