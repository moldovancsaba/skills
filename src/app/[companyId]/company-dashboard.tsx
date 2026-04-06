'use client';

import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Brain, Package, Plus, Search, Sparkles, Users, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LinkCard,
  PageHeader,
  PageShell,
} from "@/components/ui/app-shell";

type NBAItem = {
  id: string;
  title: string;
  description: string;
  impact: number;
  confidence: number;
  ease: number;
  iceScore: number;
  status: string;
};

type Flashcard = {
  id: string;
};

export default function CompanyDashboard() {
  const router = useRouter();
  const params = useParams();
  const companyId = params.companyId as string;
  
  const { company, setCompany, products, customers, competitors, setProducts, setCustomers, setCompetitors } = useStore();
  const [loading, setLoading] = useState(true);
  const [topTasks, setTopTasks] = useState<NBAItem[]>([]);
  const [pendingTaskCount, setPendingTaskCount] = useState(0);
  const [flashcardCount, setFlashcardCount] = useState(0);
  const [fileCount, setFileCount] = useState(0);

  useEffect(() => {
    if (!companyId) return;

    const fetchCompany = async (cid: string) => {
      try {
        const companies = await fetch(`/api/companies`).then((res) => res.json());
        const found = companies.find((c: any) => c.id === cid);
        if (!found) {
          router.push("/");
          return;
        }

        setCompany(found);

        const [p, c, r, f, nba, knowmore] = await Promise.all([
          fetch(`/api/products?companyId=${found.id}`).then((res) => res.json()),
          fetch(`/api/customers?companyId=${found.id}`).then((res) => res.json()),
          fetch(`/api/competitors?companyId=${found.id}`).then((res) => res.json()),
          fetch(`/api/data-files?companyId=${found.id}`).then((res) => res.json()),
          fetch(`/api/nba?companyId=${found.id}`).then((res) => res.json()),
          fetch(`/api/knowmore?companyId=${found.id}`).then((res) => res.json()),
        ]);

        setProducts(p);
        setCustomers(c);
        setCompetitors(r);
        setFileCount(Array.isArray(f) ? f.length : 0);
        const pendingTasks = nba.filter((item: NBAItem) => item.status === "PENDING");
        setPendingTaskCount(pendingTasks.length);
        setTopTasks(
          pendingTasks
            .sort((left: NBAItem, right: NBAItem) => right.iceScore - left.iceScore)
            .slice(0, 3),
        );
        setFlashcardCount((knowmore as Flashcard[]).length);
        setLoading(false);
      } catch (error) {
        console.error(error);
      }
    };

    fetchCompany(companyId);
  }, [companyId, router, setCompany, setProducts, setCustomers, setCompetitors]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><p>Loading...</p></div>;
  }

  return (
    <PageShell width="7xl">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <PageHeader
          title={company?.name ?? "Company"}
          description="Use raw data, knowledge flashcards, and tasks as separate system layers."
          backHref="/"
          backLabel="Switch company"
        />
      </motion.div>

      <div className="grid gap-4 md:grid-cols-3">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <LinkCard
            href={`/${companyId}/data`}
            icon={Plus}
            title={`Data Collection (${products.length + customers.length + competitors.length + fileCount})`}
            description="Add products, customers, competitors"
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <LinkCard
            href={`/${companyId}/nba`}
            icon={Brain}
            title={`Recommendations (${pendingTaskCount})`}
            description="View NBA suggestions"
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <LinkCard
            href={`/${companyId}/knowmore`}
            icon={Sparkles}
            title={`Knowmore (${flashcardCount})`}
            description="Track the knowledge layer behind your AI"
          />
        </motion.div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-lg">Top checklist items</CardTitle>
            <CardDescription>
              The top 3 pending tasks, ranked by current ICE score.
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/${companyId}/nba`}>
              Open all tasks
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {topTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No pending checklist items yet. Open Tasks to generate recommendations.
            </p>
          ) : (
            topTasks.map((task) => (
              <div
                key={task.id}
                className="rounded-lg border border-border bg-background p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <p className="font-medium text-foreground">{task.title}</p>
                    <p className="text-sm text-muted-foreground">{task.description}</p>
                  </div>
                  <Badge variant="secondary">ICE {Math.round(task.iceScore)}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>Impact {task.impact}</span>
                  <span>Confidence {task.confidence}%</span>
                  <span>Ease {task.ease}</span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="fixed bottom-6 right-6 md:bottom-8 md:right-8">
        <Button
          onClick={() => router.push(`/${companyId}/data`)}
          size="lg"
          className="rounded-full shadow-lg"
        >
          <Zap className="w-5 h-5" />
          <span className="font-medium">Quick Add</span>
        </Button>
      </div>
    </PageShell>
  );
}
