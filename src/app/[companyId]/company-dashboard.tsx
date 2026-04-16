/**
 * COMPANY DASHBOARD PAGE
 * v0.11.3-PRODUCTION
 * 
 * Implements Unified Page Architecture:
 * - PageShell: Full-Width Layout
 * - UnifiedGrid: 3-Column Desktop Display for checklist preview
 */
'use client';

import React, { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Plus, Sparkles, Zap, ListOrdered } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { getDashboardExpertTip } from "@/content/help";
import { ExpertTipCard } from "@/components/expert-tip-card";
import { Button } from "@/components/ui/button";
import {
  LinkCard,
  PageHeader,
  PageShell,
  UnifiedGrid,
} from "@/components/ui/app-shell";
import { TaskReviewCard } from "@/components/task-review-card";
import { MemberList } from "@/components/member-list";

type NBAItem = {
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
};

type Flashcard = {
  id: string;
};

type ActionMode = "ACCEPT" | "DECLINE" | "MODIFY_ACCEPT";

export default function CompanyDashboard() {
  const router = useRouter();
  const params = useParams();
  const companyId = params.companyId as string;

  const { company, setCompany, sources, setSources, setNbaItems } = useStore();
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [topTasks, setTopTasks] = useState<NBAItem[]>([]);
  const [pendingTaskCount, setPendingTaskCount] = useState(0);
  const [flashcardCount, setFlashcardCount] = useState(0);
  const [fileCount, setFileCount] = useState(0);
  const [topicCount, setTopicCount] = useState(0);
  const [companyCount, setCompanyCount] = useState(0);
  const [actionMode, setActionMode] = useState<ActionMode | null>(null);
  const [actionItemId, setActionItemId] = useState<string | null>(null);
  const [annotation, setAnnotation] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadDashboard = useCallback(async (cid: string) => {
    const safeFetch = async (url: string) => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Fetch failed: ${url} status ${res.status}`);
        return await res.json();
      } catch (e) {
        console.error(e);
        return [];
      }
    };

    const [s, f, nba, knowmore, topics, members] = await Promise.all([
      safeFetch(`/api/sources?companyId=${cid}`),
      safeFetch(`/api/data-files?companyId=${cid}`),
      safeFetch(`/api/nba?companyId=${cid}`),
      safeFetch(`/api/knowmore?companyId=${cid}`),
      safeFetch(`/api/topics?companyId=${cid}`),
      safeFetch(`/api/companies/${cid}/members`),
    ]);

    setSources(Array.isArray(s) ? s : []);
    setFileCount(Array.isArray(f) ? f.length : 0);
    setNbaItems(Array.isArray(nba) ? nba : []);
    setTopicCount(Array.isArray(topics) ? topics.length : 0);
    setFlashcardCount(Array.isArray(knowmore) ? knowmore.length : 0);

    const safeNBA = Array.isArray(nba) ? nba as NBAItem[] : [];
    const pendingTasks = safeNBA.filter((item) =>
      ["DRAFT", "CHECKED", "VERIFIED"].includes(item.processingStatus)
    );
    setPendingTaskCount(pendingTasks.length);
    setTopTasks(pendingTasks.slice(0, 3));

    // Get current user session to determine role
    const sessionRes = await fetch("/api/auth/session");
    if (sessionRes.ok) {
      const session = await sessionRes.json();
      const myMembership = Array.isArray(members) ? members.find((m: any) => m.email === session.email) : null;
      setIsOwner(myMembership?.role === "OWNER" || myMembership?.role === "SUPERADMIN");
    }
  }, [setSources, setNbaItems]);

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

        setCompanyCount(companies.length);
        setCompany(found);
        await loadDashboard(found.id);
      } catch (error) {
        console.error("Dashboard initialization failed:", error);
      } finally {
        setLoading(false);
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
    const text = `${item.title}\n\n${item.description}\n\nImpact: ${item.impact} | Confidence: ${item.confidenceScore}% | Ease: ${item.ease}`;
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
    await loadDashboard(company.id);
    setLoading(false);
  }, [company, loadDashboard, resetActionForm]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen bg-zinc-950 text-zinc-500"><Sparkles className="animate-pulse mr-2" /> Initializing Sovereign Context...</div>;
  }

  const safeSources = Array.isArray(sources) ? sources : [];
  const tip = getDashboardExpertTip({
    companyId,
    productCount: safeSources.length,
    customerCount: 0,
    competitorCount: 0,
    fileCount,
    flashcardCount,
    pendingTaskCount,
  });

  return (
    <PageShell width="full">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <PageHeader
          title={company?.name ?? "Company"}
          description="Integrated intelligence layers: Data, Topics, Knowmore, and Checklist."
          backHref={companyCount > 1 ? "/" : undefined}
          backLabel="Switch company"
        />
      </motion.div>

      <div className="grid gap-4 md:grid-cols-4 mb-8">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <LinkCard
            href={`/${companyId}/data`}
            icon={Plus}
            variant="blue"
            metric={(Array.isArray(sources) ? sources.length : 0) + fileCount}
            title={`Data Collection`}
            description="Raw sources & files"
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <LinkCard
            href={`/${companyId}/topics`}
            icon={ListOrdered}
            variant="amber"
            metric={topicCount}
            title={`Topics`}
            description="Prioritize AI focus"
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <LinkCard
            href={`/${companyId}/knowmore`}
            icon={Sparkles}
            variant="green"
            metric={flashcardCount}
            title={`Knowmore`}
            description="Knowledge layer"
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
          <LinkCard
            href={`/${companyId}/nba`}
            icon={Zap}
            variant="violet"
            metric={pendingTaskCount}
            title={`Checklist`}
            description="High-impact actions"
          />
        </motion.div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Top strategic intelligence</h2>
            <p className="text-sm text-muted-foreground">High-impact tasks generated by the Trinity synthesis engine.</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/${companyId}/nba`}>
              Open full checklist
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <UnifiedGrid>
          {topTasks.map((task, index) => (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
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
                activeHashtags={[]}
                onOpenAction={openActionForm}
                onCloseAction={resetActionForm}
                onAnnotationChange={setAnnotation}
                onDraftTitleChange={setDraftTitle}
                onDraftDescriptionChange={setDraftDescription}
                onToggleHashtag={() => {}}
                onRemoveHashtag={() => {}}
                onSubmit={handleFeedback}
                onShare={handleShare}
              />
            </motion.div>
          ))}
          
          {/* Always show strategic context cards */}
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: topTasks.length * 0.03 }}>
            <ExpertTipCard tip={tip} />
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: (topTasks.length + 1) * 0.03 }}>
            <MemberList companyId={companyId} isOwner={isOwner} />
          </motion.div>
        </UnifiedGrid>
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
