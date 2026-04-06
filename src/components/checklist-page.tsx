'use client';

import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import { Archive, Brain, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState, Notice, PageHeader, PageShell } from "@/components/ui/app-shell";
import { TaskReviewCard } from "@/components/task-review-card";

interface NBAItem {
  id: string;
  title: string;
  description: string;
  impact: number;
  confidence: number;
  ease: number;
  iceScore: number;
  status: string;
  userAnnotation?: string;
}

type ActionMode = "ACCEPT" | "DECLINE" | "MODIFY_ACCEPT";

type ChecklistPageProps = {
  companyId: string;
  archived?: boolean;
};

export function ChecklistPage({ companyId, archived = false }: ChecklistPageProps) {
  const router = useRouter();
  const { company, setCompany } = useStore();
  const [items, setItems] = useState<NBAItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMode, setActionMode] = useState<ActionMode | null>(null);
  const [actionItemId, setActionItemId] = useState<string | null>(null);
  const [annotation, setAnnotation] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadChecklist = useCallback(async (cid: string) => {
    setLoading(true);
    const res = await fetch(`/api/nba?companyId=${cid}`);
    const data = await res.json();
    const filtered = archived
      ? data.filter((item: NBAItem) => item.status !== "PENDING")
      : data.filter((item: NBAItem) => item.status === "PENDING");
    setItems(filtered);
    setLoading(false);
  }, [archived]);

  const triggerLocalAI = useCallback(async () => {
    if (!company || archived) return;
    setIsGenerating(true);
    try {
      await fetch("/api/agent/local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id }),
      });
    } catch (error) {
      console.error("Failed to trigger local AI", error);
    } finally {
      setIsGenerating(false);
    }
  }, [archived, company]);

  const handleRefresh = useCallback(async () => {
    if (!company || archived) return;
    setLoading(true);
    await triggerLocalAI();
    await loadChecklist(company.id);
  }, [archived, company, loadChecklist, triggerLocalAI]);

  useEffect(() => {
    if (!companyId) return;

    const fetchCompany = async (cid: string) => {
      try {
        const companies = await fetch(`/api/companies`).then((res) => res.json());
        const found = companies.find((entry: any) => entry.id === cid);
        if (!found) {
          router.push("/");
          return;
        }

        setCompany(found);
        await loadChecklist(found.id);
      } catch (error) {
        console.error(error);
      }
    };

    void fetchCompany(companyId);
  }, [companyId, loadChecklist, router, setCompany]);

  useEffect(() => {
    if (archived) return;

    const interval = setInterval(() => {
      if (company) void loadChecklist(company.id);
    }, 600000);
    return () => clearInterval(interval);
  }, [archived, company, loadChecklist]);

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

  const handleFeedback = useCallback(async (
    itemId: string,
    action: ActionMode,
    feedbackAnnotation?: string,
    modifiedTitle?: string,
    modifiedDescription?: string,
  ) => {
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
    if (!archived) {
      await triggerLocalAI();
    }
    if (company) {
      await loadChecklist(company.id);
    } else {
      setLoading(false);
    }
  }, [archived, company, loadChecklist, resetActionForm, triggerLocalAI]);

  useEffect(() => {
    if (archived) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (event.key === "r" || event.key === "R") {
        void handleRefresh();
      } else if (event.key === "a" || event.key === "A") {
        const pending = items.find((item) => item.status === "PENDING");
        if (pending) {
          void handleFeedback(pending.id, "ACCEPT");
        }
      } else if (event.key === "Escape") {
        resetActionForm();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [archived, handleFeedback, handleRefresh, items, resetActionForm]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><p>Loading...</p></div>;
  }

  return (
    <PageShell width="5xl">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        {isGenerating ? (
          <Notice icon={Loader2} title="Generating checklist items" className="mb-4">
            AI is generating recommendations.
          </Notice>
        ) : null}
        <PageHeader
          backHref={`/${companyId}`}
          backLabel="Back"
          title={archived ? "Archived Checklist" : "Checklist"}
          description={`${items.length} ${archived ? "archived" : "pending"} checklist items`}
          actions={
            <>
              {archived ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/${companyId}/nba`}>Open Active Checklist</Link>
                </Button>
              ) : (
                <>
                  <Button onClick={handleRefresh} variant="ghost" size="sm" disabled={isGenerating}>
                    <Loader2 className={`h-4 w-4 ${isGenerating ? "animate-spin" : ""}`} />
                    {isGenerating ? "Generating..." : "Refresh"}
                  </Button>
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/${companyId}/nba_archived`}>
                      <Archive className="h-4 w-4" />
                      Show Archived
                    </Link>
                  </Button>
                </>
              )}
            </>
          }
        />
      </motion.div>

      {items.length === 0 ? (
        <EmptyState
          icon={archived ? Archive : Brain}
          title={archived ? "No archived checklist items" : "No checklist items yet"}
          description={archived ? "Accepted and declined items will appear here." : "Add data to get AI-powered suggestions."}
        />
      ) : (
        <div className="grid gap-4">
          {items.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
            >
              <TaskReviewCard
                item={item}
                isActionOpen={actionItemId === item.id && actionMode !== null}
                actionMode={actionMode}
                isBusy={loading}
                copied={copiedId === item.id}
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
    </PageShell>
  );
}
