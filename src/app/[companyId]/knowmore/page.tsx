'use client';

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Brain, Database, Layers3, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type Company = {
  id: string;
  name: string;
};

type FlashcardSource = {
  id: string;
  sourceType: "PRODUCT" | "CUSTOMER" | "COMPETITOR" | "AGENT_FOUND";
  sourceId: string;
  sourcePublicId: number | null;
  sourceName: string;
  relationRole: "PRIMARY" | "SUPPORTING" | "MERGED_FROM";
};

type Flashcard = {
  id: string;
  publicId: number | null;
  title: string;
  body: string;
  confidence: number;
  impact: number;
  weight: number;
  refreshedAt: string;
  sources: FlashcardSource[];
};

async function fetchJson<T>(input: RequestInfo | URL): Promise<T> {
  const response = await fetch(input);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function sourceLabel(sourceType: FlashcardSource["sourceType"]) {
  switch (sourceType) {
    case "PRODUCT":
      return "Product";
    case "CUSTOMER":
      return "Customer";
    case "COMPETITOR":
      return "Competitor";
    case "AGENT_FOUND":
      return "Agent";
  }
}

export default function CompanyKnowMorePage() {
  const router = useRouter();
  const params = useParams();
  const companyId = params.companyId as string;
  const [company, setCompany] = useState<Company | null>(null);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) {
      return;
    }

    const loadCompany = async () => {
      try {
        const [companies, cards] = await Promise.all([
          fetchJson<Company[]>("/api/companies"),
          fetchJson<Flashcard[]>(
            `/api/knowmore?companyId=${encodeURIComponent(companyId)}`,
          ),
        ]);
        const found = companies.find((item: Company) => item.id === companyId);
        if (!found) {
          router.push("/");
          return;
        }

        setCompany(found);
        setFlashcards(cards);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    void loadCompany();
  }, [companyId, router]);

  const summary = useMemo(() => {
    if (flashcards.length === 0) {
      return {
        total: 0,
        avgConfidence: 0,
        avgImpact: 0,
        avgWeight: 0,
      };
    }

    const totals = flashcards.reduce(
      (acc, flashcard) => {
        acc.confidence += flashcard.confidence;
        acc.impact += flashcard.impact;
        acc.weight += flashcard.weight;
        return acc;
      },
      { confidence: 0, impact: 0, weight: 0 },
    );

    return {
      total: flashcards.length,
      avgConfidence: Math.round(totals.confidence / flashcards.length),
      avgImpact: Math.round(totals.impact / flashcards.length),
      avgWeight: Math.round(totals.weight / flashcards.length),
    };
  }, [flashcards]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 p-4 md:p-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 p-4 md:p-8">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <a href={`/${companyId}`} className="text-sm text-primary hover:underline">
          ← Back
        </a>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Knowmore</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Flashcards and knowledge slices for {company?.name ?? "this company"}.
        </p>
      </motion.div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-5">
          <Database className="mb-3 h-5 w-5 text-blue-500" />
          <p className="font-medium text-foreground">Knowledge cards</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {summary.total} flashcards are currently derived from your structured
            source data.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <Brain className="mb-3 h-5 w-5 text-violet-500" />
          <p className="font-medium text-foreground">Average confidence</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {summary.avgConfidence}% confidence across the current bootstrap
            flashcards.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <Layers3 className="mb-3 h-5 w-5 text-emerald-500" />
          <p className="font-medium text-foreground">Average impact / weight</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Impact {summary.avgImpact} and weight {summary.avgWeight} based on
            current source completeness.
          </p>
        </div>
      </div>

      {flashcards.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-dashed border-border bg-card/60 p-8 text-center"
        >
          <Sparkles className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <h2 className="text-xl font-semibold text-foreground">
            Add source data to seed the knowledge layer
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
            Knowmore now reads from durable flashcard storage. As soon as source
            data exists, bootstrap flashcards will appear here and later be
            refined by the local AI pipeline.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={`/${companyId}/data`}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Open Data
            </a>
            <a
              href={`/${companyId}/nba`}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              Open Recommendations
            </a>
          </div>
        </motion.div>
      ) : (
        <div className="grid gap-4">
          {flashcards.map((flashcard, index) => (
            <motion.div
              key={flashcard.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
            >
              <Card>
                <CardHeader className="gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="font-mono">
                      {flashcard.publicId ? `#${flashcard.publicId}` : "pending"}
                    </Badge>
                    <Badge variant="outline">Confidence {flashcard.confidence}%</Badge>
                    <Badge variant="outline">Impact {flashcard.impact}</Badge>
                    <Badge variant="outline">Weight {flashcard.weight}</Badge>
                  </div>
                  <div>
                    <CardTitle className="text-xl">{flashcard.title}</CardTitle>
                    <CardDescription className="mt-2">
                      Refreshed{" "}
                      {new Date(flashcard.refreshedAt).toLocaleDateString()}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm leading-6 text-foreground">{flashcard.body}</p>
                  <div className="flex flex-wrap gap-2">
                    {flashcard.sources.map((source) => (
                      <Badge
                        key={source.id}
                        variant="secondary"
                        className="gap-1 font-normal"
                      >
                        {source.sourcePublicId ? `#${source.sourcePublicId}` : "pending"}{" "}
                        {sourceLabel(source.sourceType)}: {source.sourceName}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
