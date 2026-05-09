/**
 * Knowmore intelligence page.
 *
 * This route renders the company knowledge layer on top of the shared
 * page shell and unified card/grid primitives.
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { IconDatabase as Database, IconSearch as Search, IconSparkles as Sparkles, IconTarget as Target, IconBolt as Bolt, IconFilter as Filter, IconLayoutList as LayoutList, IconTrendingUp as TrendingUp, IconShieldCheck as ShieldCheck } from "@tabler/icons-react";
import { 
  Badge, 
  Button, 
  Group, 
  TextInput, 
  Box, 
  Stack, 
  Skeleton, 
  Loader, 
  Center,
  Text,
  ActionIcon,
  Title,
  Card,
  rem,
  ThemeIcon
} from "@mantine/core";
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
import { MemberList } from "@/components/member-list";
import { ExpertTipCard } from "@/components/expert-tip-card";
import { getDashboardExpertTip } from "@/content/help";
import { matchesAllHashtags, parseHashtagFilterParam, stringifyHashtagFilterParam } from "@/lib/hashtags";
import { useStore } from "@/lib/store";
import { calculateKnowledgeIceScore } from "@/lib/scoring-contract";
import { getSemanticSurfaceStyle } from "@/lib/semantic-theme";
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
};

type ActionMode = "ACCEPT" | "DECLINE" | "MODIFY_ACCEPT" | "CONVERT";

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

import { useIntelligenceSnapshot } from "@/hooks/use-intelligence-snapshot";

export default function CompanyKnowMorePage() {
  const PAGE_SIZE = 12;
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const companyId = params.companyId as string;
  const { snapshot, loading: snapshotLoading } = useIntelligenceSnapshot(companyId);
  const [company, setCompany] = useState<Company | null>(null);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeFlashcardId, setActiveFlashcardId] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode | null>(null);
  const [selectedFlashcardId, setSelectedFlashcardId] = useState<string | null>(null);
  const [actionComment, setActionComment] = useState("");
  const [editedTitle, setEditedTitle] = useState("");
  const [editedBody, setEditedBody] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterKind, setFilterKind] = useState<Flashcard["kind"] | "ALL">("ALL");
  const [activeHashtags, setActiveHashtags] = useState<string[]>([]);
  const [intelligenceFilter, setIntelligenceFilter] = useState<"INTERNAL" | "COMPETITOR">("INTERNAL");
  const { sources, setSources } = useStore();
  const [isOwner, setIsOwner] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const loadFlashcards = useCallback(async (cid: string) => {
    const response = await fetchJson<{ items: Flashcard[]; hasMore: boolean; total: number }>(
      `/api/knowmore?companyId=${encodeURIComponent(cid)}&limit=${PAGE_SIZE}&offset=0`
    );
    setFlashcards(response.items);
    setHasMore(response.hasMore);
    setTotalCount(response.total);
  }, []);

  const loadMoreFlashcards = useCallback(async () => {
    if (!company || !hasMore) return;
    const response = await fetchJson<{ items: Flashcard[]; hasMore: boolean; total: number }>(
      `/api/knowmore?companyId=${encodeURIComponent(company.id)}&limit=${PAGE_SIZE}&offset=${flashcards.length}`
    );
    setFlashcards((prev) => [...prev, ...response.items]);
    setHasMore(response.hasMore);
    setTotalCount(response.total);
  }, [company, flashcards.length, hasMore]);

  const loadPage = useCallback(async (cid: string) => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const dashboard = await fetchJson<{ company: Company | null }>(`/api/companies/${encodeURIComponent(cid)}/dashboard`);
      const found = dashboard.company;
      if (!found?.id) {
        router.push("/");
        return;
      }

      setCompany(found);
      await loadFlashcards(found.id);

      const [members, sessionRes] = await Promise.all([
        fetch(`/api/companies/${cid}/members`).then((res) => res.json()),
        fetch("/api/auth/session")
      ]);

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
  }, [loadFlashcards, router]);

  useEffect(() => {
    if (!companyId) return;

    void (async () => {
      await loadPage(companyId);
    })();
  }, [companyId, loadPage]);

  useEffect(() => {
    const syncFromLocation = () => {
      setActiveHashtags(parseHashtagFilterParam(new URLSearchParams(window.location.search).get("tags")));
    };
    syncFromLocation();
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, []);

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

  const filteredFlashcards = useMemo(() => {
    return flashcards.filter((card) => {
      const matchesSearch = card.title.toLowerCase().includes(searchQuery.toLowerCase()) || card.body.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesKind = filterKind === "ALL" || card.kind === filterKind;
      const matchesTags = matchesAllHashtags(card.hashtags, activeHashtags);
      const matchesIntelligence = card.intelligenceType === intelligenceFilter;
      return matchesSearch && matchesKind && matchesTags && matchesIntelligence;
    });
  }, [activeHashtags, flashcards, searchQuery, filterKind, intelligenceFilter]);

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
      // JOURNAL FEEDBACK (Isolated)
      const payload = {
        companyId: company.id,
        entityId: flashcardId,
        entityType: "KNOWLEDGE",
        action: actionMode,
        annotation: trimmedComment || undefined,
        modifiedTitle: actionMode === "MODIFY_ACCEPT" ? trimmedTitle : undefined,
        modifiedDescription: actionMode === "MODIFY_ACCEPT" ? trimmedBody : undefined,
      };

      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // Optimistically update list or reload
      await loadFlashcards(company.id);
      closeActionForm();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setActingId(null);
    }
  }, [actionComment, actionMode, closeActionForm, company, editedBody, editedTitle, loadFlashcards]);

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
          await loadFlashcards(company.id);
        } else {
          setFlashcards(prev => prev.filter(f => f.id !== input.flashcardId));
        }
      } else {
        await loadFlashcards(company.id);
      }
      closeActionForm();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setActingId(null);
    }
  }, [closeActionForm, company, loadFlashcards]);

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
    productCount: snapshot?.dataIngressCount || 0,
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

        <MetricGrid>
          <MetricCard icon={Sparkles} color="knowmore" label="Knowledge Units" value={snapshot?.knowmoreCount ?? summary.total} detail="Derived evidence" />
          <MetricCard icon={TrendingUp} color="review" label="Feedback Yield" value={`${snapshot?.synthesisYield ?? 85}%`} detail="Calibrated units" />
          <MetricCard icon={ShieldCheck} color="strategy" label="Confidence" value={`${snapshot?.confidenceAvg ?? summary.avgConfidence}%`} detail="System certainty" />
          <MetricCard icon={Target} color="knowmore" label="Avg ICE" value={snapshot?.iceScoreAvg ?? summary.avgIceScore} detail="Strategic priority" />
          <MetricCard icon={Bolt} color="checklist" label="Avg Ease" value={snapshot?.easeScoreAvg ?? summary.avgEase} detail="Implementation path" />
        </MetricGrid>

        <Stack gap="lg">
          <Group justify="space-between" align="center">
            <TextInput 
              placeholder="Search knowledge units..." 
              leftSection={<Search size={16} />}
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ flex: 1, maxWidth: 400 }}
            />
            <Group gap="xs">
              <Group gap={4} p={4} style={{
                borderRadius: "var(--mantine-radius-md)",
                ...getSemanticSurfaceStyle("neutral", { elevated: false }),
              }}>
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
              <Group gap={4} p={4} style={{
                borderRadius: "var(--mantine-radius-md)",
                ...getSemanticSurfaceStyle("neutral", { elevated: false }),
              }}>
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
            <MemberList companyId={companyId} isOwner={isOwner} />
          </UnifiedGrid>

          {hasMore && searchQuery.length === 0 && filterKind === "ALL" && activeHashtags.length === 0 && (
            <Group justify="center">
              <Button variant="light" color="knowmore" onClick={() => void loadMoreFlashcards()}>
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
