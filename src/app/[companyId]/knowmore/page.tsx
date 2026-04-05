'use client';

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Brain, Database, Layers3, Sparkles } from "lucide-react";

type Company = {
  id: string;
  name: string;
};

export default function CompanyKnowMorePage() {
  const router = useRouter();
  const params = useParams();
  const companyId = params.companyId as string;
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) {
      return;
    }

    const loadCompany = async () => {
      try {
        const companies = await fetch("/api/companies").then((res) => res.json());
        const found = companies.find((item: Company) => item.id === companyId);
        if (!found) {
          router.push("/");
          return;
        }

        setCompany(found);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    void loadCompany();
  }, [companyId, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Loading...</p>
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
          <p className="font-medium text-foreground">Data foundation is live</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Source public IDs are now visible on the Data page, which gives the
            flashcard system stable references to build on.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <Brain className="mb-3 h-5 w-5 text-violet-500" />
          <p className="font-medium text-foreground">Local AI enrichment next</p>
          <p className="mt-2 text-sm text-muted-foreground">
            The local agent stack will populate this space with curated
            flashcards, confidence scores, impact, and weight.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <Layers3 className="mb-3 h-5 w-5 text-emerald-500" />
          <p className="font-medium text-foreground">Multi-source knowledge</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Each flashcard will support one or more linked sources and later
            show why the system believes the knowledge is useful.
          </p>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-dashed border-border bg-card/60 p-8 text-center"
      >
        <Sparkles className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
        <h2 className="text-xl font-semibold text-foreground">Flashcards are coming here</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
          The page is now live and ready for the next delivery slices. As the
          local AI pipeline and flashcard storage land, this view will switch
          from placeholder state to real knowledge cards.
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
    </div>
  );
}
