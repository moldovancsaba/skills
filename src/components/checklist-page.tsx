'use client';

import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import { Archive, Brain, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, PageShell, PipelineAccentHeader, UnifiedGrid } from "@/components/ui/app-shell";
import { matchesAllHashtags, parseHashtagFilterParam, stringifyHashtagFilterParam } from "@/lib/hashtags";
import { TaskReviewCard } from "@/components/task-review-card";

interface NBAItem {
  id: string;
  publicId: number | null;
  title: string;
  description: string;
  impact: number;
  confidenceScore: number;
  ease: number;
  iceScore: number;
  processingStatus: "DRAFT" | "CHECKED" | "VERIFIED" | "ACCEPTED" | "DECLINED";
  activityState: "ACTIVE" | "STALE" | "EXPIRED" | "ARCHIVED";
  userAnnotation?: string;
  hashtags: string[];
}

type ActionMode = "ACCEPT" | "DECLINE" | "MODIFY_ACCEPT";

type ChecklistPageProps = {
  companyId: string;
  archived?: boolean;
};

export function ChecklistPage({ companyId, archived = false }: ChecklistPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { company, setCompany } = useStore();
  const [items, setItems] = useState<NBAItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMode, setActionMode] = useState<ActionMode | null>(null);
  const [actionItemId, setActionItemId] = useState<string | null>(null);
  const [annotation, setAnnotation] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeHashtags, setActiveHashtags] = useState<string[]>([]);

  const loadChecklist = useCallback(async (cid: string) => {
    setLoading(true);
    const res = await fetch(`/api/nba?companyId=${cid}`);
    const data = await res.json();
    const filtered = archived
      ? data.filter((item: NBAItem) => ["ACCEPTED", "DECLINED"].includes(item.processingStatus))
      : data.filter((item: NBAItem) => ["DRAFT", "VERIFIED"].includes(item.processingStatus));
    setItems(filtered);
    setLoading(false);
  }, [archived]);

  const handleRefresh = useCallback(async () => {
    if (!company || archived) return;
    setLoading(true);
    await loadChecklist(company.id);
  }, [archived, company, loadChecklist]);

  useEffect(() => {
    if (!companyId) return;

    const fetchCompany = async (cid: string) => {
      try {
        const companies = await fetch(`/api/companies`).then((res) => res.json());
        if (!Array.isArray(companies)) {
          console.error("Invalid companies response:", companies);
          return;
        }
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
    const syncFromLocation = () => {
      setActiveHashtags(parseHashtagFilterParam(new URLSearchParams(window.location.search).get("tags")));
    };
    syncFromLocation();
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, []);

  useEffect(() => {
    if (archived) return;

    const interval = setInterval(() => {
      if (company) void loadChecklist(company.id);
    }, 600000);
    return () => clearInterval(interval);
  }, [archived, company, loadChecklist]);

  const handleShare = useCallback(async (item: NBAItem) => {
    const text = `${item.title}\n\n${item.description}\n\nImpact: ${item.impact} | Confidence: ${item.confidenceScore}% | Ease: ${item.ease}\nICE Score: ${Math.round(item.iceScore)}`;
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
    if (company) {
      await loadChecklist(company.id);
    } else {
      setLoading(false);
    }
  }, [company, loadChecklist, resetActionForm]);

  const toggleHashtagFilter = useCallback((tag: string) => {
    const next = activeHashtags.includes(tag)
      ? activeHashtags.filter((item) => item !== tag)
      : [...activeHashtags, tag];
    const nextSearch = new URLSearchParams(window.location.search);
    if (next.length > 0) {
      nextSearch.set("tags", stringifyHashtagFilterParam(next));
    } else {
      nextSearch.delete("tags");
    }
    setActiveHashtags(next);
    router.replace(`${pathname}${nextSearch.toString() ? `?${nextSearch.toString()}` : ""}`, { scroll: false });
  }, [activeHashtags, pathname, router]);

  const removeTaskHashtag = useCallback(async (itemId: string, tag: string) => {
    if (!company) return;
    setLoading(true);
    try {
      await fetch("/api/hashtags/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: "CHECKLIST",
          entityId: itemId,
          tag,
        }),
      });
      await loadChecklist(company.id);
    } finally {
      setLoading(false);
    }
  }, [company, loadChecklist]);

  useEffect(() => {
    if (archived) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (event.key === "r" || event.key === "R") {
        void handleRefresh();
      } else if (event.key === "a" || event.key === "A") {
        const actionable = items.find((item) => ["VERIFIED", "DRAFT"].includes(item.processingStatus));
        if (actionable) {
          void handleFeedback(actionable.id, "ACCEPT");
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

  const filteredItems = items.filter((item) => matchesAllHashtags(item.hashtags, activeHashtags));

  return (
    <PageShell width="full">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <PipelineAccentHeader
          activeKey="checklist"
          title="Checklist"
          icon="looks_4"
          toneClassName="text-violet-600"
          borderClassName="border-violet-500/20"
          backgroundClassName="bg-violet-500/10"
        />
        <PageHeader
          backHref={`/${companyId}`}
          backLabel="Back"
          title={archived ? "Archived Checklist" : "Checklist"}
          description={`${filteredItems.length} ${archived ? "archived" : "pending"} checklist items`}
          actions={
            <>
              {archived ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/${companyId}/nba`}>Open Active Checklist</Link>
                </Button>
              ) : (
                <>
                  <Button onClick={handleRefresh} variant="ghost" size="sm" disabled={loading}>
                    <Loader2 className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    {loading ? "Refreshing..." : "Refresh"}
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

      {filteredItems.length === 0 ? (
        <EmptyState
          icon={archived ? Archive : Brain}
          title={archived ? "No archived checklist items" : "No checklist items yet"}
          description={activeHashtags.length > 0 ? "Try clearing hashtag filters." : archived ? "Accepted and declined items will appear here." : "Add data to get AI-powered suggestions."}
        />
      ) : (
        <UnifiedGrid>
          {filteredItems.map((item, index) => (
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
                activeHashtags={activeHashtags}
                onOpenAction={openActionForm}
                onCloseAction={resetActionForm}
                onAnnotationChange={setAnnotation}
                onDraftTitleChange={setDraftTitle}
                onDraftDescriptionChange={setDraftDescription}
                onToggleHashtag={toggleHashtagFilter}
                onRemoveHashtag={(itemId, tag) => void removeTaskHashtag(itemId, tag)}
                onSubmit={handleFeedback}
                onShare={handleShare}
              />
            </motion.div>
          ))}
        </UnifiedGrid>
      )}
    </PageShell>
  );
}
