'use client';

import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Plus, Sparkles, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { getDashboardExpertTip } from "@/content/help";
import { ExpertTipCard } from "@/components/expert-tip-card";
import { Button } from "@/components/ui/button";
import {
  LinkCard,
  PageHeader,
  PageShell,
} from "@/components/ui/app-shell";
import { TaskReviewCard } from "@/components/task-review-card";

type NBAItem = {
  id: string;
  publicId: number | null;
  title: string;
  description: string;
  impact: number;
  confidence: number;
  ease: number;
  iceScore: number;
  status: string;
  userAnnotation?: string;
};

type Flashcard = {
  id: string;
};

type ActionMode = "ACCEPT" | "DECLINE" | "MODIFY_ACCEPT";

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
  const [actionMode, setActionMode] = useState<ActionMode | null>(null);
  const [actionItemId, setActionItemId] = useState<string | null>(null);
  const [annotation, setAnnotation] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadDashboard = useCallback(async (cid: string) => {
    const [p, c, r, f, nba, knowmore] = await Promise.all([
      fetch(`/api/products?companyId=${cid}`).then((res) => res.json()),
      fetch(`/api/customers?companyId=${cid}`).then((res) => res.json()),
      fetch(`/api/competitors?companyId=${cid}`).then((res) => res.json()),
      fetch(`/api/data-files?companyId=${cid}`).then((res) => res.json()),
      fetch(`/api/nba?companyId=${cid}`).then((res) => res.json()),
      fetch(`/api/knowmore?companyId=${cid}`).then((res) => res.json()),
    ]);

    setProducts(p);
    setCustomers(c);
    setCompetitors(r);
    setFileCount(Array.isArray(f) ? f.length : 0);

    const pendingTasks = (nba as NBAItem[]).filter((item) => item.status === "PENDING");
    setPendingTaskCount(pendingTasks.length);
    setTopTasks(
      pendingTasks
        .sort((left, right) => right.iceScore - left.iceScore)
        .slice(0, 3),
    );
    setFlashcardCount((knowmore as Flashcard[]).length);
  }, [setCompetitors, setCustomers, setProducts]);

  useEffect(() => {
    if (!companyId) return;

    const fetchCompany = async (cid: string) => {
      try {
        const companies = await fetch(`/api/companies`).then((res) => res.json());
        if (!Array.isArray(companies)) {
          console.error("Invalid companies response:", companies);
          return;
        }
        const found = companies.find((c: any) => c.id === cid);
        if (!found) {
          router.push("/");
          return;
        }

        setCompany(found);
        await loadDashboard(found.id);
        setLoading(false);
      } catch (error) {
        console.error(error);
      }
    };

    void fetchCompany(companyId);
  }, [companyId, loadDashboard, router, setCompany]);

  const resetActionForm = useCallback(() => {
    setActionMode(null);
    setActionItemId(null);
    setAnnotation("");
    setDraftTitle("");
    setDraftDescription("");
  }, []);

  const openActionForm = useCallback((item: NBAItem, mode: ActionMode) => {
    setActionMode(mode);
    setActionItemId(item.id);
    setAnnotation(item.userAnnotation ?? "");
    setDraftTitle(item.title);
    setDraftDescription(item.description);
  }, []);

  const handleShare = useCallback(async (item: NBAItem) => {
    const text = `${item.title}\n\n${item.description}\n\nImpact: ${item.impact} | Confidence: ${item.confidence}% | Ease: ${item.ease}\nICE Score: ${Math.round(item.iceScore)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error("Failed to copy", error);
    }
  }, []);

  const handleFeedback = useCallback(async (
    itemId: string,
    action: ActionMode,
    feedbackAnnotation?: string,
    modifiedTitle?: string,
    modifiedDescription?: string,
  ) => {
    if (!company) return;

    setLoading(true);
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nbaItemId: itemId,
        action,
        annotation: feedbackAnnotation,
        modifiedTitle,
        modifiedDescription,
      }),
    });

    resetActionForm();
    await fetch("/api/agent/local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: company.id }),
    });
    await loadDashboard(company.id);
    setLoading(false);
  }, [company, loadDashboard, resetActionForm]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><p>Loading...</p></div>;
  }

  const tip = getDashboardExpertTip({
    companyId,
    productCount: products.length,
    customerCount: customers.length,
    competitorCount: competitors.length,
    fileCount,
    flashcardCount,
    pendingTaskCount,
  });

  return (
    <PageShell width="5xl">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <PageHeader
          title={company?.name ?? "Company"}
          description="Use raw data, knowledge flashcards, and checklist items as separate system layers."
          backHref="/"
          backLabel="Switch company"
        />
      </motion.div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
            icon={Zap}
            title={`Checklist (${pendingTaskCount})`}
            description="View checklist suggestions"
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <ExpertTipCard tip={tip} />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <LinkCard
            href={`/${companyId}/knowmore`}
            icon={Sparkles}
            title={`Knowmore (${flashcardCount})`}
            description="Track the knowledge layer behind your AI"
          />
        </motion.div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Top checklist items</h2>
            <p className="text-sm text-muted-foreground">The top 3 pending items, ranked by ICE score.</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/${companyId}/nba`}>
              Open full checklist
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {topTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No pending checklist items yet. Open Checklist to generate recommendations.
          </p>
        ) : (
          <div className="grid gap-4">
            {topTasks.map((task, index) => (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
              >
                <TaskReviewCard
                  item={task}
                  isActionOpen={actionItemId === task.id && actionMode !== null}
                  actionMode={actionMode}
                  isBusy={loading}
                  copied={copiedId === task.id}
                  annotation={annotation}
                  draftTitle={draftTitle}
                  draftDescription={draftDescription}
                  onOpenAction={openActionForm}
                  onCloseAction={resetActionForm}
                  onAnnotationChange={setAnnotation}
                  onDraftTitleChange={setDraftTitle}
                  onDraftDescriptionChange={setDraftDescription}
                  onSubmit={handleFeedback}
                  onShare={handleShare}
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>

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
