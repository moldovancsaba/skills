'use client';
/**
 * Knowmore intelligence page.
 *
 * This route renders the company knowledge layer on top of the shared
 * page shell and unified card/grid primitives.
 */
import { Text } from "@/components/ui/typography";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { IconDatabase as Database, IconSearch as Search, IconSparkles as Sparkles, IconTarget as Target, IconBolt as Bolt, IconFilter as Filter, IconLayoutList as LayoutList, IconTrendingUp as TrendingUp, IconShieldCheck as ShieldCheck, IconRefresh as RefreshIcon, IconStethoscope as Stethoscope, IconAlertTriangle as AlertTriangle } from "@tabler/icons-react";
import { 
  Badge, Button, Group, TextInput, Box, Stack, Skeleton, Loader, Center, ActionIcon, Card, rem, ThemeIcon } from "@mantine/core";
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
import { UnifiedCardModal } from "@/components/ui/unified-card-modal";
import { KnowledgeReviewCard } from "@/components/knowledge-review-card";
import { getSemanticClusterStyle } from "@/lib/semantic-theme";
import { MemberList } from "@/components/member-list";
import { ExpertTipCard } from "@/components/expert-tip-card";
import { getDashboardExpertTip } from "@/content/help";
import { parseHashtagFilterParam, stringifyHashtagFilterParam } from "@/lib/hashtags";
import { calculateKnowledgeIceScore } from "@/lib/scoring-contract";
import { getSemanticSurfaceStyle } from "@/lib/semantic-theme";
import React from "react";
import type { KnowmoreInitialData } from "@/lib/server-knowmore-page-data";

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
  processingStatus: "DRAFT" | "CHECKED" | "VERIFIED" | "ACCEPTED" | "DECLINED" | "REVIEW";
  activityState: "ACTIVE" | "STALE" | "EXPIRED" | "ARCHIVED";
  userAnnotation: string | null;
  hashtags: string[];
  createdAt: string;
  updatedAt: string;
  lastActionAt: string | null;
  refreshedAt: string;
  sources: FlashcardSource[];
  actions: FlashcardAction[];
  corrections: FlashcardCorrection[];
  ischecklistResearch?: boolean;
  intelligenceType: "INTERNAL" | "COMPETITOR";
  iceScore: number;
  conflictDetected?: boolean;
  conflictSummary?: string | null;
  generatedFromIds?: string[];
  versionFamilyId?: string | null;
  duplicateClusterId?: string | null;
  refinedFromId?: string | null;
};

type KnowmoreHealth = {
  healthState: "HEALTHY" | "STALE" | "DELAYED" | "FAILED";
  healthTone?: "default" | "warning" | "destructive";
  healthTitle?: string;
  healthSummary?: string;
  reviewCount: number;
  staleCount: number;
  correctionBacklog: number;
  failedJobs: number;
  scoreBand: string;
  alerts: Array<{ severity: string; message: string }>;
  jobs: Array<{ id: string; jobType: string; status: string; queueColumn: string }>;
  recommendedActions: {
    sync: boolean;
    repair: boolean;
    recover: boolean;
  };
};

type ActionMode = "ACCEPT" | "DECLINE" | "MODIFY_ACCEPT" | "CONVERT";

type DashboardSnapshotSummary = {
  knowmoreCount: number;
  strategicGoalsCount: number;
  synthesisYield: number;
  confidenceAvg: number;
  iceScoreAvg: number;
  easeScoreAvg: number;
};

type DashboardResponse = {
  company: Company | null;
  counts?: {
    flashcards?: number;
    goals?: number;
  };
  metrics?: {
    synthesisYield?: number;
    confidenceAvg?: number;
    iceScoreAvg?: number;
    easeScoreAvg?: number;
  };
};

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

function actionLabel(action: FlashcardAction["action"] | ActionMode) {
  switch (action) {
    case "ACCEPT": return "Accepted";
    case "DECLINE": return "Declined";
    case "MODIFY_ACCEPT": return "Modified + accepted";
    case "CONVERT": return "Converted";
  }
}

function reviewStatusLabel(processingStatus: Flashcard["processingStatus"]) {
  return processingStatus.charAt(0).toUpperCase() + processingStatus.slice(1).toLowerCase();
}

function kindLabel(kind: Flashcard["kind"]) {
  return kind.toLowerCase().replace(/_/g, " ");
}

export default function KnowmoreClient({
  companyId,
  initialData,
}: {
  companyId: string;
  initialData?: KnowmoreInitialData | null;
}) {
  const PAGE_SIZE = 12;
  const router = useRouter();
  const pathname = usePathname();
  const initialLoadRef = useRef(Boolean(initialData));
  const [company, setCompany] = useState<Company | null>(initialData?.company ?? null);
  const [flashcards, setFlashcards] = useState<Flashcard[]>(initialData?.flashcards ?? []);
  const [loading, setLoading] = useState(!initialData);
  const [listLoading, setListLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeFlashcardId, setActiveFlashcardId] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode | null>(null);
  const [selectedFlashcardId, setSelectedFlashcardId] = useState<string | null>(null);
  const [actionComment, setActionComment] = useState("");
  const [editedTitle, setEditedTitle] = useState("");
  const [editedBody, setEditedBody] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(initialData?.filters.searchQuery ?? "");
  const [filterKind, setFilterKind] = useState<Flashcard["kind"] | "ALL">((initialData?.filters.filterKind as Flashcard["kind"] | "ALL") ?? "ALL");
  const [activeHashtags, setActiveHashtags] = useState<string[]>(initialData?.filters.activeHashtags ?? []);
  const [intelligenceFilter, setIntelligenceFilter] = useState<"INTERNAL" | "COMPETITOR">(initialData?.filters.intelligenceFilter ?? "INTERNAL");
  const [isOwner, setIsOwner] = useState(Boolean(initialData?.isOwner));
  const [members, setMembers] = useState<any[]>(initialData?.members ?? []);
  const [hasMore, setHasMore] = useState(Boolean(initialData?.hasMore));
  const [totalCount, setTotalCount] = useState(initialData?.totalCount ?? 0);
  const [health, setHealth] = useState<KnowmoreHealth | null>(initialData?.health ?? null);
  const [healthActionLoading, setHealthActionLoading] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<DashboardSnapshotSummary | null>(initialData?.snapshotSummary ?? null);

  const buildKnowmoreQuery = useCallback((offset = 0) => {
    const params = new URLSearchParams();
    params.set("companyId", companyId);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(offset));
    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery) params.set("q", trimmedQuery);
    if (filterKind !== "ALL") params.set("kind", filterKind);
    if (intelligenceFilter) params.set("intelligenceType", intelligenceFilter);
    if (activeHashtags.length > 0) params.set("tags", stringifyHashtagFilterParam(activeHashtags));
    return `/api/knowmore?${params.toString()}`;
  }, [activeHashtags, companyId, filterKind, intelligenceFilter, searchQuery]);

  const loadFlashcards = useCallback(async (offset = 0, append = false) => {
    const response = await fetchJson<{ items: Flashcard[]; hasMore: boolean; total: number }>(
      buildKnowmoreQuery(offset),
    );
    setFlashcards((prev) => append ? [...prev, ...response.items] : response.items);
    setHasMore(response.hasMore);
    setTotalCount(response.total);
  }, [buildKnowmoreQuery]);

  const loadHealth = useCallback(async (cid: string) => {
    const response = await fetchJson<KnowmoreHealth>(
      `/api/knowmore/health?companyId=${encodeURIComponent(cid)}&t=${Date.now()}`,
      { cache: "no-store" },
    );
    setHealth(response);
  }, []);

  const loadMoreFlashcards = useCallback(async () => {
    if (!company || !hasMore) return;
    setListLoading(true);
    try {
      await loadFlashcards(flashcards.length, true);
    } finally {
      setListLoading(false);
    }
  }, [company, flashcards.length, hasMore, loadFlashcards]);

  const loadPage = useCallback(async (cid: string) => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const dashboard = await fetchJson<DashboardResponse>(`/api/companies/${encodeURIComponent(cid)}/dashboard`);
      const found = dashboard.company;
      if (!found?.id) {
        router.push("/");
        return;
      }

      setCompany(found);
      setSnapshot({
        knowmoreCount: Number(dashboard.counts?.flashcards ?? 0),
        strategicGoalsCount: Number(dashboard.counts?.goals ?? 0),
        synthesisYield: Number(dashboard.metrics?.synthesisYield ?? 0),
        confidenceAvg: Number(dashboard.metrics?.confidenceAvg ?? 0),
        iceScoreAvg: Number(dashboard.metrics?.iceScoreAvg ?? 0),
        easeScoreAvg: Number(dashboard.metrics?.easeScoreAvg ?? 0),
      });
      await Promise.all([
        loadFlashcards(),
        loadHealth(found.id),
      ]);

      const [memberRows, sessionRes] = await Promise.all([
        fetch(`/api/companies/${cid}/members`).then((res) => res.json()),
        fetch("/api/auth/session")
      ]);
      setMembers(Array.isArray(memberRows) ? memberRows : []);

      if (sessionRes.ok) {
        const session = await sessionRes.json();
        const myMembership = Array.isArray(memberRows) ? memberRows.find((m: any) => m.email === session.email) : null;
        setIsOwner(myMembership?.role === "OWNER" || myMembership?.role === "SUPERADMIN");
      }

    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [loadFlashcards, loadHealth, router]);

  useEffect(() => {
    if (!companyId) return;
    if (initialData) return;

    void (async () => {
      await loadPage(companyId);
    })();
  }, [companyId, initialData, loadPage]);

  useEffect(() => {
    if (!company?.id) return;

    const refreshHealth = () => {
      void loadHealth(company.id);
    };

    const intervalId = window.setInterval(refreshHealth, 30000);
    window.addEventListener("focus", refreshHealth);
    document.addEventListener("visibilitychange", refreshHealth);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshHealth);
      document.removeEventListener("visibilitychange", refreshHealth);
    };
  }, [company?.id, loadHealth]);

  useEffect(() => {
    const syncFromLocation = () => {
      setActiveHashtags(parseHashtagFilterParam(new URLSearchParams(window.location.search).get("tags")));
    };
    syncFromLocation();
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, []);

  useEffect(() => {
    if (!company?.id) return;
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setListLoading(true);
      void loadFlashcards(0, false)
        .catch((error) => {
          console.error(error);
          setErrorMessage(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          setListLoading(false);
        });
    }, searchQuery.trim() ? 180 : 0);

    return () => window.clearTimeout(timeoutId);
  }, [activeHashtags, company?.id, filterKind, intelligenceFilter, loadFlashcards, searchQuery]);

  const closeActionForm = useCallback(() => {
    setActiveFlashcardId(null);
    setActionMode(null);
    setActionComment("");
    setEditedTitle("");
    setEditedBody("");
  }, []);

  const openActionForm = useCallback((flashcard: Flashcard, mode: ActionMode) => {
    setErrorMessage(null);
    setSelectedFlashcardId(flashcard.id);
    setActiveFlashcardId(flashcard.id);
    setActionMode(mode);
    setActionComment("");
    setEditedTitle(flashcard.title);
    setEditedBody(flashcard.body);
  }, []);

  const closeDetailModal = useCallback(() => {
    setSelectedFlashcardId(null);
    closeActionForm();
  }, [closeActionForm]);

  const filteredFlashcards = flashcards;

  const summary = useMemo(() => {
    const visibleCards = flashcards.filter(f => f.intelligenceType === intelligenceFilter);
    if (visibleCards.length === 0) return { total: 0, reviewed: 0, avgConfidence: 0, avgIceScore: 0, avgEase: 0 };

    const totals = visibleCards.reduce((acc, fc) => {
      acc.confidence += fc.confidenceScore;
      acc.impact += fc.impact;
      acc.weight += fc.weight;
      if (["ACCEPTED", "DECLINED"].includes(fc.processingStatus)) acc.reviewed += 1;
      return acc;
    }, { confidence: 0, impact: 0, weight: 0, reviewed: 0 });

    return {
      total: visibleCards.length,
      reviewed: totals.reviewed,
      avgConfidence: Math.round(totals.confidence / visibleCards.length),
      avgIceScore: Math.round(visibleCards.reduce((sum, f) => sum + calculateKnowledgeIceScore(f), 0) / visibleCards.length),
      avgEase: Math.round(totals.weight / visibleCards.length),
    };
  }, [flashcards, intelligenceFilter]);
  const selectedFlashcard = flashcards.find((card) => card.id === selectedFlashcardId) ?? null;

  const handleActionSubmit = useCallback(async (flashcardId: string) => {
    if (!company || !actionMode) return;
    const trimmedComment = actionComment.trim();
    const trimmedTitle = editedTitle.trim();
    const trimmedBody = editedBody.trim();

    if (actionMode === "DECLINE" && !trimmedComment) {
      setErrorMessage("Decline requires a comment for system calibration.");
      return;
    }

    if (actionMode === "MODIFY_ACCEPT" && (!trimmedTitle || !trimmedBody)) {
      setErrorMessage("Modification requires both a title and a body.");
      return;
    }

    setActingId(flashcardId);
    setErrorMessage(null);

    try {
      await fetchJson("/api/knowmore/actions", {
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

      await Promise.all([loadFlashcards(), loadHealth(company.id)]);
      closeActionForm();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setActingId(null);
    }
  }, [actionComment, actionMode, closeActionForm, company, editedBody, editedTitle, loadFlashcards, loadHealth]);

  const handleConvert = useCallback(async (id: string, targetType: string) => {
    if (!company) return;
    setActingId(id);
    try {
      await fetchJson("/api/intelligence/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: id,
          sourceType: "FLASHCARD",
          targetType: targetType === "GOAL" ? "GOALCARD" : targetType === "TASK" ? "TASKCARD" : "FLASHCARD",
          companyId: company.id
        })
      });
      setFlashcards(prev => prev.filter(f => f.id !== id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setActingId(null);
    }
  }, [company]);

  const handleCorrection = useCallback(async (input: {
    flashcardId: string;
    correctionType: FlashcardCorrection["correctionType"];
    sourceType?: FlashcardSource["sourceType"];
    sourceId?: string;
    sourcePublicId?: number | null;
    sourceName?: string;
  }) => {
    if (!company) return;
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

      if (["HIDE", "MARK_WRONG", "SUPPRESS_SOURCE"].includes(input.correctionType)) {
        if (input.correctionType === "SUPPRESS_SOURCE") {
          await Promise.all([loadFlashcards(), loadHealth(company.id)]);
        } else {
          setFlashcards(prev => prev.filter(f => f.id !== input.flashcardId));
        }
      } else {
        await Promise.all([loadFlashcards(), loadHealth(company.id)]);
      }
      closeActionForm();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setActingId(null);
    }
  }, [closeActionForm, company, loadFlashcards, loadHealth]);

  const runHealthAction = useCallback(async (action: string) => {
    if (!company) return;
    setHealthActionLoading(action);
    try {
      const response = await fetchJson<KnowmoreHealth>("/api/knowmore/health", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id, action }),
      });
      setHealth(response);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setHealthActionLoading(null);
    }
  }, [company]);

  const toggleHashtagFilter = useCallback((tag: string) => {
    const next = activeHashtags.includes(tag) ? activeHashtags.filter((item) => item !== tag) : [...activeHashtags, tag];
    const nextSearch = new URLSearchParams(window.location.search);
    if (next.length > 0) nextSearch.set("tags", stringifyHashtagFilterParam(next));
    else nextSearch.delete("tags");
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
        body: JSON.stringify({ entityType: "FLASHCARD", entityId: flashcardId, tag }),
      });
      setFlashcards(prev => prev.map(f => f.id === flashcardId ? { ...f, hashtags: result.hashtags } : f));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setActingId(null);
    }
  }, [company]);

  if (loading) {
    return (
      <PageShell width="full">
        <Center h="100vh">
          <Stack align="center" gap="md">
            <Loader color="knowmore" />
            <Text c="dimmed">Synchronizing Contextual Memory...</Text>
          </Stack>
        </Center>
      </PageShell>
    );
  }

  const tip = getDashboardExpertTip({
    companyId,
    productCount: 0,
    customerCount: 0,
    competitorCount: 0,
    fileCount: 0,
    flashcardCount: snapshot?.knowmoreCount || totalCount || flashcards.length,
    pendingTaskCount: snapshot?.strategicGoalsCount || 0,
  });
  return (
    <PageShell width="full">
      <Stack gap="xl">
        <PipelineAccentHeader 
          activeKey="knowmore" 
          title="Knowmore" 
          icon={Sparkles} 
        />
        {errorMessage && <Notice variant="destructive">{errorMessage}</Notice>}
        {health ? (
          <Notice
            title={health.healthTitle ?? `Knowmore Health: ${health.healthState}`}
            icon={health.healthState === "FAILED" ? AlertTriangle : Stethoscope}
            variant={health.healthTone === "destructive" ? "destructive" : "default"}
          >
            {health.alerts[0]?.message ?? health.healthSummary ??
              `Review ${health.reviewCount} card(s), stale ${health.staleCount}, correction backlog ${health.correctionBacklog}, failed jobs ${health.failedJobs}.`}
          </Notice>
        ) : null}

        <MetricGrid>
          <MetricCard icon={Sparkles} color="knowmore" label="Knowledge Units" value={snapshot?.knowmoreCount ?? summary.total} detail="Derived evidence" />
          <MetricCard icon={TrendingUp} color="review" label="Feedback Yield" value={`${snapshot?.synthesisYield ?? 85}%`} detail="Calibrated units" />
          <MetricCard icon={ShieldCheck} color="strategy" label="Confidence" value={`${snapshot?.confidenceAvg ?? summary.avgConfidence}%`} detail="System certainty" />
          <MetricCard icon={Target} color="knowmore" label="Avg ICE" value={snapshot?.iceScoreAvg ?? summary.avgIceScore} detail="Strategic priority" />
          <MetricCard icon={Bolt} color="checklist" label="Avg Ease" value={snapshot?.easeScoreAvg ?? summary.avgEase} detail="Implementation path" />
        </MetricGrid>

        <Group gap="sm">
          <Button
            variant="light"
            color="knowmore"
            leftSection={<RefreshIcon size={16} />}
            loading={healthActionLoading === "SYNC_KNOWMORE"}
            onClick={() => void runHealthAction("SYNC_KNOWMORE")}
          >
            Sync Knowmore
          </Button>
          <Button
            variant="light"
            color="strategy"
            leftSection={<Stethoscope size={16} />}
            loading={healthActionLoading === "REQUEST_KNOWMORE_REPAIR"}
            disabled={!health?.recommendedActions?.repair}
            onClick={() => void runHealthAction("REQUEST_KNOWMORE_REPAIR")}
          >
            Request Repair
          </Button>
          <Button
            variant="light"
            color="review"
            leftSection={<AlertTriangle size={16} />}
            loading={healthActionLoading === "RECOVER_KNOWMORE_JOBS"}
            disabled={!health?.recommendedActions?.recover}
            onClick={() => void runHealthAction("RECOVER_KNOWMORE_JOBS")}
          >
            Recover Failed Jobs
          </Button>
        </Group>

        <Stack gap="lg">
          <Group justify="space-between" align="center">
            <TextInput 
              placeholder="Search knowledge units..." 
              leftSection={<Search size={16} />}
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)}
              flex={1}
              maw={400}
            />
            <Group gap="xs">
              <Group gap={4} p={4} style={getSemanticClusterStyle("neutral")}>
                {(["INTERNAL", "COMPETITOR"] as const).map((type) => (
                  <Button
                    key={type}
                    variant={intelligenceFilter === type ? "light" : "subtle"}
                    color={intelligenceFilter === type ? (type === "COMPETITOR" ? "review" : "ingress") : "gray"}
                    size="compact-xs"
                    h={30}
                    px="md"
                    onClick={() => setIntelligenceFilter(type)}
                  >
                    {type === "INTERNAL" ? "Unit" : "Market"}
                  </Button>
                ))}
              </Group>
              <Group gap={4} p={4} style={getSemanticClusterStyle("neutral")}>
                {(["ALL", "SUMMARY", "RECOMMENDATION", "EVALUATION", "RESEARCH"] as const).map((kind) => (
                  <Button
                    key={kind}
                    variant={filterKind === kind ? "light" : "subtle"}
                    color={filterKind === kind ? "ingress" : "gray"}
                    size="compact-xs"
                    h={30}
                    px="md"
                    onClick={() => setFilterKind(kind)}
                  >
                    {kind === "ALL" ? "All" : kindLabel(kind as Flashcard["kind"])}
                  </Button>
                ))}
              </Group>
            </Group>
          </Group>

          {listLoading ? (
            <Group gap="sm">
              <Loader size="sm" color="knowmore" />
              <Text c="dimmed">Refreshing knowledge slice…</Text>
            </Group>
          ) : null}

          {filteredFlashcards.length === 0 ? (
            <Center h={rem(400)}>
              <EmptyState
                icon={Sparkles}
                tone="knowmore"
                title="Memory Layer Silent"
                description={
                  searchQuery || filterKind !== "ALL" || activeHashtags.length > 0
                    ? "No knowledge units match the current strategic filters."
                    : "The memory layer is awaiting evidence unit ingress to begin synthesis."
                }
              />
            </Center>
          ) : (
            <UnifiedGrid>
              {filteredFlashcards.map((flashcard) => {
                const isActionOpen = activeFlashcardId === flashcard.id && actionMode !== null;
                const isBusy = actingId === flashcard.id;
                return (
                  <React.Fragment key={flashcard.id}>
                    <KnowledgeReviewCard
                      flashcard={flashcard}
                      onOpenDetail={(nextFlashcard) => setSelectedFlashcardId(nextFlashcard.id)}
                      isActionOpen={isActionOpen}
                      actionMode={actionMode}
                      isBusy={isBusy}
                      isGenerating={false}
                      actionComment={actionComment}
                      editedTitle={editedTitle}
                      editedBody={editedBody}
                      reviewStatusLabel={reviewStatusLabel}
                      kindLabel={kindLabel}
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
                      onConvert={(type) => handleConvert(flashcard.id, type)}
                    />
                  </React.Fragment>
                );
              })}
            </UnifiedGrid>
          )}

          <UnifiedGrid cols={{ base: 1, xl: 2 }}>
            <ExpertTipCard tip={tip} />
            <MemberList companyId={companyId} isOwner={isOwner} initialMembers={members} />
          </UnifiedGrid>

          {hasMore && (
            <Group justify="center">
              <Button variant="light" color="knowmore" loading={listLoading} onClick={() => void loadMoreFlashcards()}>
                Load More Knowledge
              </Button>
            </Group>
          )}
        </Stack>
      </Stack>

      <UnifiedCardModal
        opened={Boolean(selectedFlashcard)}
        onClose={closeDetailModal}
        tone="knowmore"
        title={selectedFlashcard?.title ?? "Knowmore"}
        subtitle={selectedFlashcard ? `#${selectedFlashcard.publicId ?? "—"} · Contextual memory unit` : undefined}
        badge="Knowmore"
      >
        {selectedFlashcard ? (
          <KnowledgeReviewCard
            flashcard={selectedFlashcard}
            detailMode
            hideTitle
            isActionOpen={activeFlashcardId === selectedFlashcard.id && actionMode !== null}
            actionMode={actionMode}
            isBusy={actingId === selectedFlashcard.id}
            isGenerating={false}
            actionComment={actionComment}
            editedTitle={editedTitle}
            editedBody={editedBody}
            reviewStatusLabel={reviewStatusLabel}
            kindLabel={kindLabel}
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
            onConvert={(type) => handleConvert(selectedFlashcard.id, type)}
          />
        ) : null}
      </UnifiedCardModal>
    </PageShell>
  );
}
