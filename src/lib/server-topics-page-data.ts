import "server-only";

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { APP_SESSION_COOKIE, readAppSessionToken } from "@/lib/auth";

export type TopicsInitialData = {
  company: {
    id: string;
    name: string;
  };
  topics: Array<{
    id: string;
    companyId: string;
    label: string;
    active: boolean;
    sortOrder: number;
    notes?: string | null;
    iceScore: number;
    confidenceScore: number;
    impact: number;
    weight: number;
    createdAt: string;
    updatedAt: string;
  }>;
};

async function getSessionAndMembership(companyId: string) {
  const cookieStore = await cookies();
  const session = readAppSessionToken(cookieStore.get(APP_SESSION_COOKIE)?.value);
  if (!session) return null;

  const membership = await prisma.user.findFirst({
    where: {
      email: session.email.trim().toLowerCase(),
      companyId,
    },
    select: {
      id: true,
      role: true,
    },
  });

  if (!membership) return null;
  return { session, membership };
}

export async function getTopicsInitialData(companyId: string): Promise<TopicsInitialData | null> {
  const auth = await getSessionAndMembership(companyId);
  if (!auth) return null;

  const [company, topics] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true },
    }),
    prisma.topic.findMany({
      where: { companyId },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      select: {
        id: true,
        companyId: true,
        label: true,
        active: true,
        sortOrder: true,
        notes: true,
        iceScore: true,
        confidenceScore: true,
        impact: true,
        weight: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  if (!company) return null;

  return {
    company,
    topics: topics.map((topic) => ({
      ...topic,
      createdAt: topic.createdAt.toISOString(),
      updatedAt: topic.updatedAt.toISOString(),
    })),
  };
}
