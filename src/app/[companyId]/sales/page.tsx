'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Button, Group, Loader, Stack, Center } from "@mantine/core";
import { IconBriefcase as Briefcase, IconRefresh as RefreshCw, IconSparkles as Sparkles } from "@tabler/icons-react";
import { EmptyState, MetricCard, MetricGrid, PageHeader, PageShell, PipelineAccentHeader, UnifiedGrid } from "@/components/ui/app-shell";
import { KnowledgeReviewCard } from "@/components/knowledge-review-card";
import { Text } from "@/components/ui/typography";
import type { SalesOpportunitycard } from "@/components/sales-board";

type Opportunitycard = SalesOpportunitycard;

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
  sources: Array<{
    id: string;
    sourceType: "SOURCE" | "PRODUCT" | "CUSTOMER" | "COMPETITOR" | "FILE" | "AGENT_FOUND";
    sourceId: string;
    sourcePublicId: number | null;
    sourceName: string;
    relationRole: "PRIMARY" | "SUPPORTING" | "MERGED_FROM";
  }>;
  actions: Array<{
    id: string;
    action: "ACCEPT" | "DECLINE" | "MODIFY_ACCEPT";
    annotation: string | null;
    modifiedTitle: string | null;
    modifiedBody: string | null;
    createdAt: string;
  }>;
  corrections: Array<{
    id: string;
    correctionType: "HIDE" | "MARK_WRONG" | "PIN" | "REQUEST_REFRESH" | "SUPPRESS_SOURCE";
    note: string | null;
    sourceType: "SOURCE" | "PRODUCT" | "CUSTOMER" | "COMPETITOR" | "FILE" | "AGENT_FOUND" | null;
    sourceId: string | null;
    sourcePublicId: number | null;
    sourceName: string | null;
    createdAt: string;
  }>;
  intelligenceType: "INTERNAL" | "COMPETITOR";
  departmentKey?: string | null;
  iceScore: number;
};

type SalesObservability = {
  sales?: {
    opportunitycards?: number;
    searchQueued?: number;
    searchRunning?: number;
    searchFailed?: number;
    mineQueued?: number;
    mineRunning?: number;
    mineFailed?: number;
  };
};

const SalesBoard = dynamic(
  () => import("@/components/sales-board").then((module) => ({ default: module.SalesBoard })),
  {
    ssr: false,
    loading: () => (
      <Center py="xl">
        <Loader color="strategy" />
      </Center>
    ),
  },
);

export default function SalesPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.companyId as string;
  const [loading, setLoading] = useState(true);
  const [mining, setMining] = useState(false);
  const [searching, setSearching] = useState(false);
  const [opportunitycards, setOpportunitycards] = useState<Opportunitycard[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [observability, setObservability] = useState<SalesObservability | null>(null);

  const load = useCallback(async () => {
    const [opportunityRes, knowmoreRes, observabilityRes] = await Promise.all([
      fetch(`/api/opportunitycards?companyId=${encodeURIComponent(companyId)}&departmentKey=SALES`),
      fetch(`/api/knowmore?companyId=${encodeURIComponent(companyId)}&departmentKey=SALES&includeCompetitor=true&limit=24&offset=0`),
      fetch(`/api/observability?companyId=${encodeURIComponent(companyId)}`),
    ]);
    if (
      opportunityRes.status === 404 || opportunityRes.status === 403
      || knowmoreRes.status === 404 || knowmoreRes.status === 403
      || observabilityRes.status === 404 || observabilityRes.status === 403
    ) {
      router.push("/");
      return null;
    }
    const opportunityData = await opportunityRes.json();
    const knowmoreData = await knowmoreRes.json();
    const observabilityData = await observabilityRes.json();
    return {
      opportunitycards: Array.isArray(opportunityData) ? opportunityData : opportunityData.items || [],
      flashcards: Array.isArray(knowmoreData) ? knowmoreData : knowmoreData.items || [],
      observability: observabilityData,
    };
  }, [companyId, router]);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await load();
        if (cancelled || !data) return;
        setOpportunitycards(data.opportunitycards);
        setFlashcards(data.flashcards);
        setObservability(data.observability);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, load]);

  const handleMine = useCallback(async () => {
    setMining(true);
    try {
      await fetch("/api/opportunitycards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, mode: "MINE" }),
      });
      const data = await load();
      if (data) {
        setOpportunitycards(data.opportunitycards);
        setFlashcards(data.flashcards);
        setObservability(data.observability);
      }
    } finally {
      setMining(false);
    }
  }, [companyId, load]);

  const handleSearch = useCallback(async () => {
    setSearching(true);
    try {
      await fetch("/api/opportunitycards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, mode: "SEARCH" }),
      });
      const data = await load();
      if (data) {
        setOpportunitycards(data.opportunitycards);
        setFlashcards(data.flashcards);
        setObservability(data.observability);
      }
    } finally {
      setSearching(false);
    }
  }, [companyId, load]);

  const handleAction = useCallback(async (itemId: string, action: string, payload?: Record<string, unknown>) => {
    await fetch(`/api/opportunitycards?id=${encodeURIComponent(itemId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await load();
    if (data) {
      setOpportunitycards(data.opportunitycards);
      setFlashcards(data.flashcards);
      setObservability(data.observability);
    }
  }, [load]);

  const handleReorder = useCallback(async ({
    itemId,
    nextItems,
    sourceColumn,
    destinationColumn,
    sourceColumnOrderIds,
    destinationColumnOrderIds,
  }: {
    itemId: string;
    nextItems: SalesOpportunitycard[];
    sourceColumn: Opportunitycard["kanbanColumn"];
    destinationColumn: Opportunitycard["kanbanColumn"];
    sourceColumnOrderIds?: string[];
    destinationColumnOrderIds: string[];
  }) => {
    setOpportunitycards(nextItems as Opportunitycard[]);
    try {
      await fetch(`/api/opportunitycards?id=${encodeURIComponent(itemId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kanbanColumn: destinationColumn,
          destinationColumn,
          sourceColumn,
          destinationColumnOrderIds,
          sourceColumnOrderIds,
        }),
      });
    } catch {
      const data = await load();
      if (data) {
        setOpportunitycards(data.opportunitycards);
        setFlashcards(data.flashcards);
        setObservability(data.observability);
      }
    }
  }, [load]);

  const counts = useMemo(() => ({
    total: opportunitycards.filter((item) => item.activityState !== "ARCHIVED").length,
    accepted: opportunitycards.filter((item) => item.processingStatus === "ACCEPTED").length,
    ready: opportunitycards.filter((item) => item.iceScore >= 80).length,
    salesKnowledge: flashcards.length,
    searchQueued: Number(observability?.sales?.searchQueued || 0),
    searchRunning: Number(observability?.sales?.searchRunning || 0),
    mineQueued: Number(observability?.sales?.mineQueued || 0),
    mineRunning: Number(observability?.sales?.mineRunning || 0),
  }), [flashcards.length, observability, opportunitycards]);

  if (loading) {
    return (
      <Center py="xl">
        <Loader color="strategy" />
      </Center>
    );
  }

  return (
    <PageShell width="full">
      <Stack gap="xl">
        <PageHeader
          title="Sales"
          description="Sales-scoped knowledge and company opportunitycards for lead generation."
          actions={
            <Group gap="sm">
              <Button color="strategy" variant="light" leftSection={<Sparkles size={14} />} onClick={() => void handleSearch()} loading={searching}>
                Search Internet Leads
              </Button>
              <Button color="strategy" leftSection={<Sparkles size={14} />} onClick={() => void handleMine()} loading={mining}>
                Mine Existing Research
              </Button>
              <Button variant="light" color="gray" leftSection={<RefreshCw size={14} />} onClick={() => void load()}>
                Refresh
              </Button>
            </Group>
          }
        />

        <PipelineAccentHeader
          activeKey="sales"
          title="Sales Lead Pipeline"
          icon={Briefcase}
        />
        <Text size="sm">Sales lead generation runs inside the main local AI pipeline. The hosted webapp only queues intent, while the worker searches, mines, enriches, scores, and ranks company-only opportunitycards when the shared company pipeline is ready.</Text>

        <MetricGrid>
          <MetricCard icon={Briefcase} color="strategy" label="Opportunitycards" value={counts.total} detail="active company leads" />
          <MetricCard icon={Sparkles} color="knowmore" label="Sales Knowmore" value={counts.salesKnowledge} detail="sales-scoped and competitor context" />
          <MetricCard icon={Briefcase} color="checklist" label="High ICE" value={counts.ready} detail="ICE 80+ ready to review" />
          <MetricCard icon={Briefcase} color="review" label="Accepted" value={counts.accepted} detail="operator-approved leads" />
          <MetricCard icon={Sparkles} color="strategy" label="Search Queue" value={counts.searchQueued} detail={`${counts.searchRunning} running`} />
          <MetricCard icon={Sparkles} color="tactical" label="Mine Queue" value={counts.mineQueued} detail={`${counts.mineRunning} running`} />
        </MetricGrid>

        <Stack gap="md">
          {counts.total === 0 ? (
            <EmptyState
              icon={Briefcase}
              title="No opportunitycards yet"
              description="Queue internet search or mine existing competitor and sales-scoped research to let the local AI create company leads."
              tone="strategy"
            />
          ) : (
            <SalesBoard
              items={opportunitycards}
              onAction={handleAction}
              onReorder={handleReorder}
            />
          )}
        </Stack>

        <Stack gap="md">
          <Text size="sm">Sales Knowmore</Text>
          {flashcards.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="No sales knowledge yet"
              description="Add sales or competitor datacards to build sales-scoped Knowmore context."
              tone="knowmore"
            />
          ) : (
            <UnifiedGrid>
              {flashcards.map((flashcard) => (
                <KnowledgeReviewCard
                  key={flashcard.id}
                  flashcard={flashcard}
                  isActionOpen={false}
                  actionMode={null}
                  isBusy={false}
                  isGenerating={false}
                  actionComment=""
                  editedTitle={flashcard.title}
                  editedBody={flashcard.body}
                  reviewStatusLabel={(status) => status}
                  kindLabel={(kind) => String(kind).toLowerCase()}
                  actionLabel={(action) => String(action)}
                  onOpenAction={() => {}}
                  onCloseAction={() => {}}
                  onActionCommentChange={() => {}}
                  onEditedTitleChange={() => {}}
                  onEditedBodyChange={() => {}}
                  onSubmit={() => {}}
                  activeHashtags={[]}
                  onToggleHashtag={() => {}}
                  onRemoveHashtag={() => {}}
                />
              ))}
            </UnifiedGrid>
          )}
        </Stack>
      </Stack>
    </PageShell>
  );
}
