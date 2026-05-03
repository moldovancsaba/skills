/**
 * KNOWMORE INTELLIGENCE PAGE
 * v0.14.0-PRODUCTION (Hardened)
 * 
 * Implements Unified Page Architecture:
 * - PageShell: Full-Width Layout
 * - UnifiedGrid: 3-Column Desktop Display
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Brain,
  Database,
  Layers3,
  Loader2,
  Search,
  Sparkles,
  TrendingUp,
  ArrowUpRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  MetricCard,
  MetricGrid,
  Notice,
  PageHeader,
  PageShell,
  PipelineAccentHeader,
  UnifiedGrid,
} from "@/components/ui/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { KnowledgeReviewCard } from "@/components/knowledge-review-card";
import { MemberList } from "@/components/member-list";
import { ExpertTipCard } from "@/components/expert-tip-card";
import { getDashboardExpertTip } from "@/content/help";
import { matchesAllHashtags, parseHashtagFilterParam, stringifyHashtagFilterParam } from "@/lib/hashtags";
import { useStore } from "@/lib/store";
import React from "react";

type Company = {
  id: string;
  name: string;
};

type FlashcardSource = {
  id: string;
  sourceType: "SOURCE" | "PRODUCT" | "CUSTOMER" | "COMPETITOR" | "FILE" | "AGENT_FOUND";
  sourceId: string;
  sourcePublicId: number | null;
  sourceName: string;
  relationRole: "PRIMARY" | "SUPPORTING" | "MERGED_FROM";
};

type FlashcardAction = {
  id: string;
  action: "ACCEPT" | "DECLINE" | "MODIFY_ACCEPT";
  annotation: string | null;
  modifiedTitle: string | null;
  modifiedBody: string | null;
  createdAt: string;
};

type FlashcardCorrection = {
  id: string;
  correctionType: "HIDE" | "MARK_WRONG" | "PIN" | "REQUEST_REFRESH" | "SUPPRESS_SOURCE";
  note: string | null;
  sourceType: FlashcardSource["sourceType"] | null;
  sourceId: string | null;
  sourcePublicId: number | null;
  sourceName: string | null;
  createdAt: string;
};

type Flashcard = {
  id: string;
  publicId: number | null;
  kind: string;
  title: string;
  body: string;
  confidenceScore: number;
  impact: number;
  weight: number;
  processingStatus: "DRAFT" | "CHECKED" | "VERIFIED" | "ACCEPTED" | "DECLINED";
  activityState: "ACTIVE" | "STALE" | "EXPIRED" | "ARCHIVED";
  userAnnotation: string | null;
  hashtags: string[];
  lastActionAt: string | null;
  refreshedAt: string;
  sources: FlashcardSource[];
  actions: FlashcardAction[];
  corrections: FlashcardCorrection[];
  ischecklistResearch?: boolean;
};

type ActionMode = "ACCEPT" | "DECLINE" | "MODIFY_ACCEPT";

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;

    try {
      const data = await response.json();
      if (typeof data?.error === "string") {
        message = data.error;
      }
    } catch {
      // Ignore JSON parsing failures and keep the HTTP-level message.
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

function sourceLabel(sourceType: FlashcardSource["sourceType"]) {
  switch (sourceType) {
    case "SOURCE":
    case "PRODUCT":
    case "CUSTOMER":
    case "COMPETITOR":
      return "Source";
    case "FILE":
      return "File";
    case "AGENT_FOUND":
      return "Agent";
  }
}

function actionLabel(action: FlashcardAction["action"] | ActionMode) {
  switch (action) {
    case "ACCEPT":
      return "Accepted";
    case "DECLINE":
      return "Declined";
    case "MODIFY_ACCEPT":
      return "Modified + accepted";
  }
}

function reviewStatusLabel(processingStatus: Flashcard["processingStatus"]) {
  switch (processingStatus) {
    case "DRAFT":
      return "Draft";
    case "CHECKED":
      return "Checked";
    case "VERIFIED":
      return "Verified";
    case "ACCEPTED":
      return "Accepted";
    case "DECLINED":
      return "Declined";
  }
}

function reviewStatusClasses(processingStatus: Flashcard["processingStatus"]) {
  switch (processingStatus) {
    case "ACCEPTED":
      return "border-transparent bg-green-100 text-green-700";
    case "DECLINED":
      return "border-transparent bg-red-100 text-red-700";
    case "VERIFIED":
      return "border-transparent bg-violet-100 text-violet-700";
    case "DRAFT":
    case "CHECKED":
      return "border-input bg-background text-foreground";
    default:
      return "border-input bg-background text-foreground";
  }
}

function kindLabel(kind: Flashcard["kind"]) {
  return kind.toLowerCase().replace(/_/g, " ");
}

export default function CompanyKnowMorePage() {
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const companyId = params.companyId as string;
  const [company, setCompany] = useState<Company | null>(null);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeFlashcardId, setActiveFlashcardId] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode | null>(null);
  const [actionComment, setActionComment] = useState("");
  const [editedTitle, setEditedTitle] = useState("");
  const [editedBody, setEditedBody] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterKind, setFilterKind] = useState<Flashcard["kind"] | "ALL">("ALL");
  const [activeHashtags, setActiveHashtags] = useState<string[]>([]);
  const { sources, setSources } = useStore();
  const [isOwner, setIsOwner] = useState(false);
  const [fileCount, setFileCount] = useState(0);
  const [pendingTaskCount, setPendingTaskCount] = useState(0);

  const loadFlashcards = useCallback(async (cid: string) => {
    const cards = await fetchJson<Flashcard[]>(
      `/api/knowmore?companyId=${encodeURIComponent(cid)}`,
    );
    setFlashcards(cards);
  }, []);

  const loadPage = useCallback(async (cid: string) => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const companies = await fetchJson<Company[]>("/api/companies");
      const found = companies.find((item) => item.id === cid);
      if (!found) {
        router.push("/");
        return;
      }

      setCompany(found);
      await loadFlashcards(found.id);

      // Fetch additional context for the Expert Tip and Member List
      const [s, f, nba, members, sessionRes] = await Promise.all([
        fetch(`/api/sources?companyId=${cid}`).then((res) => res.json()),
        fetch(`/api/data-files?companyId=${cid}`).then((res) => res.json()),
        fetch(`/api/nba?companyId=${cid}`).then((res) => res.json()),
        fetch(`/api/companies/${cid}/members`).then((res) => res.json()),
        fetch("/api/auth/session")
      ]);

      setSources(s);
      setFileCount(Array.isArray(f) ? f.length : 0);
      setPendingTaskCount(Array.isArray(nba) ? nba.filter((t: any) => t.processingStatus === "VERIFIED").length : 0);

      if (sessionRes.ok) {
        const session = await sessionRes.json();
        const myMembership = Array.isArray(members) ? members.find((m: any) => m.email === session.email) : null;
        setIsOwner(myMembership?.role === "OWNER" || myMembership?.role === "SUPERADMIN");
      }

    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [loadFlashcards, router, setSources]);

  const closeActionForm = useCallback(() => {
    setActiveFlashcardId(null);
    setActionMode(null);
    setActionComment("");
    setEditedTitle("");
    setEditedBody("");
  }, []);

  const openActionForm = useCallback((flashcard: Flashcard, mode: ActionMode) => {
    setErrorMessage(null);
    setActiveFlashcardId(flashcard.id);
    setActionMode(mode);
    setActionComment("");
    setEditedTitle(flashcard.title);
    setEditedBody(flashcard.body);
  }, []);

  useEffect(() => {
    if (!companyId) {
      return;
    }

    void loadPage(companyId);
  }, [companyId, loadPage]);

  useEffect(() => {
    const syncFromLocation = () => {
      setActiveHashtags(parseHashtagFilterParam(new URLSearchParams(window.location.search).get("tags")));
    };
    syncFromLocation();
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, []);

  const filteredFlashcards = useMemo(() => {
    return flashcards.filter((card) => {
      const matchesSearch =
        card.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        card.body.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesKind = filterKind === "ALL" || card.kind === filterKind;
      const matchesTags = matchesAllHashtags(card.hashtags, activeHashtags);
      return matchesSearch && matchesKind && matchesTags;
    });
  }, [activeHashtags, flashcards, searchQuery, filterKind]);

  const summary = useMemo(() => {
    if (flashcards.length === 0) {
      return {
        total: 0,
        reviewed: 0,
        avgConfidence: 0,
        avgIceScore: 0,
        avgEase: 0,
      };
    }

    const totals = flashcards.reduce(
      (acc, flashcard) => {
        acc.confidence += flashcard.confidenceScore;
        acc.impact += flashcard.impact;
        acc.weight += flashcard.weight;
        if (["ACCEPTED", "DECLINED"].includes(flashcard.processingStatus)) {
          acc.reviewed += 1;
        }
        return acc;
      },
      { confidence: 0, impact: 0, weight: 0, reviewed: 0 },
    );

    return {
      total: flashcards.length,
      reviewed: totals.reviewed,
      avgConfidence: Math.round(totals.confidence / flashcards.length),
      avgIceScore: Math.round(
        flashcards.reduce((sum, f) => sum + (f.impact * (f.confidenceScore / 10) * f.weight), 0) / flashcards.length
      ),
      avgEase: Math.round(totals.weight / flashcards.length),
    };
  }, [flashcards]);

  const handleActionSubmit = useCallback(async (flashcardId: string) => {
    if (!company || !actionMode) {
      return;
    }

    const trimmedComment = actionComment.trim();
    const trimmedTitle = editedTitle.trim();
    const trimmedBody = editedBody.trim();

    if (actionMode === "DECLINE" && !trimmedComment) {
      setErrorMessage("Decline requires a comment so the system can learn from it.");
      return;
    }

    if (actionMode === "MODIFY_ACCEPT" && (!trimmedTitle || !trimmedBody)) {
      setErrorMessage("Modify and accept requires both a title and a body.");
      return;
    }

    setActingId(flashcardId);
    setErrorMessage(null);

    try {
      const result = await fetchJson<{ flashcard: Flashcard }>("/api/knowmore/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flashcardId,
          action: actionMode,
          annotation: trimmedComment || undefined,
          modifiedTitle: actionMode === "MODIFY_ACCEPT" ? trimmedTitle : undefined,
          modifiedBody: actionMode === "MODIFY_ACCEPT" ? trimmedBody : undefined,
        }),
      });

      const updated = result.flashcard;
      const isVisible = 
        ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED"].includes(updated.processingStatus) &&
        ["ACTIVE", "STALE"].includes(updated.activityState);

      if (isVisible) {
        setFlashcards(prev => prev.map(f => f.id === flashcardId ? updated : f));
      } else {
        setFlashcards(prev => prev.filter(f => f.id !== flashcardId));
      }
      closeActionForm();
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setActingId(null);
    }
  }, [
    actionComment,
    actionMode,
    closeActionForm,
    company,
    editedBody,
    editedTitle,
    loadFlashcards,
  ]);

  const handleCorrection = useCallback(async (input: {
    flashcardId: string;
    correctionType: FlashcardCorrection["correctionType"];
    sourceType?: FlashcardSource["sourceType"];
    sourceId?: string;
    sourcePublicId?: number | null;
    sourceName?: string;
  }) => {
    if (!company) {
      return;
    }

    setActingId(input.flashcardId);
    setErrorMessage(null);

    try {
      await fetchJson("/api/knowmore/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: company.id,
          flashcardId: input.flashcardId,
          correctionType: input.correctionType,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          sourcePublicId: input.sourcePublicId,
          sourceName: input.sourceName,
        }),
      });

      if (input.correctionType === "HIDE" || input.correctionType === "MARK_WRONG" || input.correctionType === "SUPPRESS_SOURCE") {
        if (input.correctionType === "SUPPRESS_SOURCE") {
          // Suppress source affects multiple cards, so we still need a full reload here for safety
          await loadFlashcards(company.id);
        } else {
          setFlashcards(prev => prev.filter(f => f.id !== input.flashcardId));
        }
      } else {
        // PIN or other updates - for now reload to get new scores, or we could fetch just the card
        await loadFlashcards(company.id);
      }
      closeActionForm();
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setActingId(null);
    }
  }, [closeActionForm, company, loadFlashcards]);

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

  const removeFlashcardHashtag = useCallback(async (flashcardId: string, tag: string) => {
    if (!company) return;

    setActingId(flashcardId);
    try {
      const result = await fetchJson<{ hashtags: string[] }>("/api/hashtags/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: "FLASHCARD",
          entityId: flashcardId,
          tag,
        }),
      });
      setFlashcards(prev => prev.map(f => f.id === flashcardId ? { ...f, hashtags: result.hashtags } : f));
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setActingId(null);
    }
  }, [company, loadFlashcards]);

  if (loading) {
    return (
      <PageShell width="5xl" className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80" />
        <div className="grid gap-4 md:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </PageShell>
    );
  }

  return (
    <PageShell width="full">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        {errorMessage && (
          <Notice variant="destructive" className="mb-4">
            {errorMessage}
          </Notice>
        )}

        <PipelineAccentHeader
          activeKey="knowmore"
          title="Knowmore"
          icon="auto_awesome"
          toneClassName="text-green-600"
          borderClassName="border-green-500/20"
          backgroundClassName="bg-green-500/10"
        />
        <PageHeader
          backHref={`/${companyId}`}
          backLabel="Back"
          title="Knowmore"
          description={`Flashcards and knowledge slices for ${company?.name ?? "this company"}.`}
        />
      </motion.div>

      <MetricGrid>
        <MetricCard
          icon={Database}
          iconClassName="text-blue-500"
          label="Knowledge cards"
          value={summary.total}
          detail="Derived from your structured source data."
        />
        <MetricCard
          icon={Sparkles}
          iconClassName="text-amber-500"
          label="Reviewed cards"
          value={summary.reviewed}
          detail="Cards that already carry user feedback back into the system."
        />
        <MetricCard
          icon={Brain}
          iconClassName="text-violet-500"
          label="Average confidence"
          value={`${summary.avgConfidence}%`}
          detail="Confidence across the current flashcards."
        />
        <MetricCard
          icon={TrendingUp}
          iconClassName="text-emerald-500"
          label="Avg ICE Score"
          value={summary.avgIceScore}
          detail="Priority score calculated via Impact × Confidence × Ease."
        />
        <MetricCard
          icon={ArrowUpRight}
          iconClassName="text-cyan-500"
          label="Avg Ease"
          value={summary.avgEase}
          detail="Average implementation simplicity for these items."
        />
      </MetricGrid>

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search knowledge..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["ALL", "SUMMARY", "RECOMMENDATION", "EVALUATION", "RESEARCH"] as const).map((kind) => (
            <Badge
              key={kind}
              variant={filterKind === kind ? "default" : "outline"}
              className="cursor-pointer px-3 py-1 text-xs transition-colors hover:bg-accent"
              onClick={() => setFilterKind(kind)}
            >
              {kind === "ALL" ? "All types" : kindLabel(kind as Flashcard["kind"])}
            </Badge>
          ))}
        </div>
      </div>

      {filteredFlashcards.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <EmptyState
            icon={Sparkles}
            title={searchQuery || filterKind !== "ALL" || activeHashtags.length > 0 ? "No matching knowledge cards" : "Add source data to seed the knowledge layer"}
            description={searchQuery || filterKind !== "ALL" || activeHashtags.length > 0 ? "Try adjusting your search or filter to find what you're looking for." : "Knowmore reads from durable flashcard storage. As soon as source data exists, bootstrap flashcards appear here."}
            primaryAction={
              searchQuery || filterKind !== "ALL" || activeHashtags.length > 0 ? (
                <Button onClick={() => {
                  setSearchQuery("");
                  setFilterKind("ALL");
                  const nextSearch = new URLSearchParams(window.location.search);
                  nextSearch.delete("tags");
                  setActiveHashtags([]);
                  router.replace(`${pathname}${nextSearch.toString() ? `?${nextSearch.toString()}` : ""}`, { scroll: false });
                }}>Clear filters</Button>
              ) : (
                <Button asChild>
                  <a href={`/${companyId}/data`}>Open Data</a>
                </Button>
              )
            }
          />
        </motion.div>
      ) : (
        <UnifiedGrid>
          {filteredFlashcards.map((flashcard, index) => {
            const isActionOpen = activeFlashcardId === flashcard.id && actionMode !== null;
            const isBusy = actingId === flashcard.id;

            const tip = getDashboardExpertTip({
              companyId,
              productCount: sources.length,
              customerCount: 0,
              competitorCount: 0,
              fileCount,
              flashcardCount: flashcards.length,
              pendingTaskCount,
            });

            return (
              <React.Fragment key={flashcard.id}>
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04 }}
                >
                  <KnowledgeReviewCard
                    flashcard={flashcard}
                    isActionOpen={isActionOpen}
                    actionMode={actionMode}
                    isBusy={isBusy}
                    isGenerating={false}
                    actionComment={actionComment}
                    editedTitle={editedTitle}
                    editedBody={editedBody}
                    reviewStatusClasses={reviewStatusClasses}
                    reviewStatusLabel={reviewStatusLabel}
                    kindLabel={kindLabel}
                    sourceLabel={sourceLabel}
                    actionLabel={actionLabel}
                    onOpenAction={openActionForm}
                    onCloseAction={closeActionForm}
                    onActionCommentChange={setActionComment}
                    onEditedTitleChange={setEditedTitle}
                    onEditedBodyChange={setEditedBody}
                    onSubmit={(flashcardId) => void handleActionSubmit(flashcardId)}
                    activeHashtags={activeHashtags}
                    onToggleHashtag={toggleHashtagFilter}
                    onRemoveHashtag={(flashcardId, tag) => void removeFlashcardHashtag(flashcardId, tag)}
                    onCorrection={(input) => void handleCorrection(input)}
                  />
                </motion.div>

                {/* Inject Expert Tip and Team Members at 3rd place (index 1 is after 2nd item) */}
                {index === 1 && (
                  <React.Fragment>
                    <motion.div 
                      key="expert-tip"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                    >
                      <ExpertTipCard tip={tip} />
                    </motion.div>
                    <motion.div 
                      key="member-list"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                    >
                      <MemberList companyId={companyId} isOwner={isOwner} />
                    </motion.div>
                  </React.Fragment>
                )}
              </React.Fragment>
            );
          })}
        </UnifiedGrid>
      )}
    </PageShell>
  );
}
