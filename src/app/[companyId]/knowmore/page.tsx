/**
 * KNOWMORE INTELLIGENCE PAGE
 * v0.15.0
 * 
 * Implements Unified Page Architecture:
 * - PageShell: Full-Width Layout
 * - UnifiedGrid: 3-Column Desktop Display
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { IconBrain as Brain, IconDatabase as Database, IconLayersIntersect as Layers3, IconSearch as Search, IconSparkles as Sparkles, IconTrendingUp as TrendingUp, IconArrowUpRight as ArrowUpRight, IconLayoutList as LayoutList, IconFilter as Filter } from "@tabler/icons-react";
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
  intelligenceType: "INTERNAL" | "COMPETITOR";
  iceScore: number;
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
  const [intelligenceFilter, setIntelligenceFilter] = useState<"INTERNAL" | "COMPETITOR">("INTERNAL");
  const { sources, setSources } = useStore();
  const [isOwner, setIsOwner] = useState(false);
  const [fileCount, setFileCount] = useState(0);
  const [pendingTaskCount, setPendingTaskCount] = useState(0);

  const loadFlashcards = useCallback(async (cid: string) => {
    const cards = await fetchJson<Flashcard[]>(`/api/knowmore?companyId=${encodeURIComponent(cid)}`);
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

  useEffect(() => {
    if (companyId) loadPage(companyId);
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
    setActiveFlashcardId(flashcard.id);
    setActionMode(mode);
    setActionComment("");
    setEditedTitle(flashcard.title);
    setEditedBody(flashcard.body);
  }, []);

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
      avgIceScore: Math.round(visibleCards.reduce((sum, f) => sum + (f.impact * (f.confidenceScore / 10) * f.weight), 0) / visibleCards.length),
      avgEase: Math.round(totals.weight / visibleCards.length),
    };
  }, [flashcards, intelligenceFilter]);

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
      const isVisible = ["DRAFT", "CHECKED", "VERIFIED", "ACCEPTED"].includes(updated.processingStatus) && ["ACTIVE", "STALE"].includes(updated.activityState);

      if (isVisible) {
        setFlashcards(prev => prev.map(f => f.id === flashcardId ? updated : f));
      } else {
        setFlashcards(prev => prev.filter(f => f.id !== flashcardId));
      }
      closeActionForm();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setActingId(null);
    }
  }, [actionComment, actionMode, closeActionForm, company, editedBody, editedTitle]);

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
            <Loader color="brand" />
            <Text c="dimmed">Synchronizing Contextual Memory...</Text>
          </Stack>
        </Center>
      </PageShell>
    );
  }

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
    <PageShell width="full">
      <Stack gap="xl">
        <PipelineAccentHeader 
          activeKey="knowmore" 
          title="Knowmore" 
          icon={Sparkles} 
        />
        {errorMessage && <Notice variant="destructive">{errorMessage}</Notice>}

        <MetricGrid cols={{ base: 1, sm: 2, md: 5 }}>
          <MetricCard icon={Database} color="blue" label="Knowledge Units" value={summary.total} detail="Derived evidence" />
          <MetricCard icon={Sparkles} color="orange" label="Feedback Yield" value={summary.reviewed} detail="Calibrated units" />
          <MetricCard icon={Brain} color="violet" label="Confidence" value={`${summary.avgConfidence}%`} detail="System certainty" />
          <MetricCard icon={TrendingUp} color="green" label="Avg ICE" value={summary.avgIceScore} detail="Strategic priority" />
          <MetricCard icon={ArrowUpRight} color="cyan" label="Avg Ease" value={summary.avgEase} detail="Implementation path" />
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
                backgroundColor: 'light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-8))', 
                border: '1px solid light-dark(rgba(0,0,0,0.05), rgba(255,255,255,0.05))' 
              }}>
                {(["INTERNAL", "COMPETITOR"] as const).map((type) => (
                  <Button
                    key={type}
                    variant={intelligenceFilter === type ? "light" : "subtle"}
                    color={intelligenceFilter === type ? (type === "COMPETITOR" ? "orange" : "brand") : "gray"}
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
                backgroundColor: 'light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-8))', 
                border: '1px solid light-dark(rgba(0,0,0,0.05), rgba(255,255,255,0.05))' 
              }}>
                {(["ALL", "SUMMARY", "RECOMMENDATION", "EVALUATION", "RESEARCH"] as const).map((kind) => (
                  <Button
                    key={kind}
                    variant={filterKind === kind ? "light" : "subtle"}
                    color={filterKind === kind ? "brand" : "gray"}
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
             <Card style={{ borderStyle: 'dashed', backgroundColor: 'transparent' }} ta="center">
              <Stack align="center" gap="xl">
                <ThemeIcon color="gray" size={64} radius="xl">
                  <Brain size={32} />
                </ThemeIcon>
                <Stack gap="xs">
                  <Title order={3}>Memory Layer Silent</Title>
                  <Text c="dimmed" maw={400} mx="auto">
                    {searchQuery || filterKind !== "ALL" || activeHashtags.length > 0 
                      ? "No knowledge units match the current strategic filters."
                      : "The memory layer is awaiting evidence unit ingress to begin synthesis."}
                  </Text>
                </Stack>
              </Stack>
            </Card>
            </Center>
          ) : (
            <UnifiedGrid>
              <AnimatePresence mode="popLayout">
                {filteredFlashcards.map((flashcard, index) => {
                  const isActionOpen = activeFlashcardId === flashcard.id && actionMode !== null;
                  const isBusy = actingId === flashcard.id;
                  return (
                    <React.Fragment key={flashcard.id}>
                      <motion.div
                        layout
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ delay: index * 0.03 }}
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
                      </motion.div>

                      {index === 1 && (
                        <>
                          <ExpertTipCard tip={tip} />
                          <MemberList companyId={companyId} isOwner={isOwner} />
                        </>
                      )}
                    </React.Fragment>
                  );
                })}
              </AnimatePresence>
            </UnifiedGrid>
          )}
        </Stack>
      </Stack>
    </PageShell>
  );
}
