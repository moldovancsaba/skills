'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Badge, Button, Group, Loader, Stack, Center } from "@mantine/core";
import { IconBriefcase as Briefcase, IconRefresh as RefreshCw, IconSparkles as Sparkles } from "@tabler/icons-react";
import { EmptyState, MetricCard, MetricGrid, PageHeader, PageShell, PipelineAccentHeader, UnifiedGrid } from "@/components/ui/app-shell";
import { KnowledgeReviewCard } from "@/components/knowledge-review-card";
import { Text } from "@/components/ui/typography";
import { UnifiedCard, UnifiedCardBody, UnifiedCardHeader } from "@/components/ui/unified-card";
import type { SalesOpportunitycard } from "@/components/sales-board";
import type { ProjectionSalesSummary } from "@/lib/webapp-projection";

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

type SalesPageProps = {
  companyId: string;
};

export default function SalesPage({ companyId }: SalesPageProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [mining, setMining] = useState(false);
  const [searching, setSearching] = useState(false);
  const [opportunitycards, setOpportunitycards] = useState<Opportunitycard[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [salesSummary, setSalesSummary] = useState<ProjectionSalesSummary | null>(null);

  const load = useCallback(async () => {
    const [opportunityRes, knowmoreRes, salesSummaryRes] = await Promise.all([
      fetch(`/api/opportunitycards?companyId=${encodeURIComponent(companyId)}&departmentKey=SALES&view=board`),
      fetch(`/api/knowmore?companyId=${encodeURIComponent(companyId)}&departmentKey=SALES&includeCompetitor=true&limit=24&offset=0`),
      fetch(`/api/companies/${encodeURIComponent(companyId)}/sales-summary`),
    ]);
    if (
      opportunityRes.status === 404 || opportunityRes.status === 403
      || knowmoreRes.status === 404 || knowmoreRes.status === 403
      || salesSummaryRes.status === 404 || salesSummaryRes.status === 403
    ) {
      router.push("/");
      return null;
    }
    const opportunityData = await opportunityRes.json();
    const knowmoreData = await knowmoreRes.json();
    const salesSummaryData = await salesSummaryRes.json();
    return {
      opportunitycards: Array.isArray(opportunityData) ? opportunityData : opportunityData.items || [],
      flashcards: Array.isArray(knowmoreData) ? knowmoreData : knowmoreData.items || [],
      salesSummary: salesSummaryData?.summary ?? null,
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
        setSalesSummary(data.salesSummary);
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
        setSalesSummary(data.salesSummary);
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
        setSalesSummary(data.salesSummary);
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
      setSalesSummary(data.salesSummary);
    }
  }, [load]);

  const handleReorder = useCallback(async ({
    itemId,
    nextItems,
    sourceColumn,
    destinationColumn,
    beforeId,
    afterId,
  }: {
    itemId: string;
    nextItems: SalesOpportunitycard[];
    sourceColumn: Opportunitycard["kanbanColumn"];
    destinationColumn: Opportunitycard["kanbanColumn"];
    beforeId: string | null;
    afterId: string | null;
  }) => {
    setOpportunitycards(nextItems as Opportunitycard[]);
    try {
      await fetch(`/api/opportunitycards?id=${encodeURIComponent(itemId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinationColumn,
          sourceColumn,
          beforeId,
          afterId,
        }),
      });
    } catch {
      const data = await load();
      if (data) {
        setOpportunitycards(data.opportunitycards);
        setFlashcards(data.flashcards);
        setSalesSummary(data.salesSummary);
      }
    }
  }, [load]);

  const counts = useMemo(() => ({
    total: Number(salesSummary?.opportunitycards ?? 0),
    accepted: Number(salesSummary?.acceptedOpportunitycards ?? 0),
    ready: Number(salesSummary?.readyOpportunitycards ?? 0),
    salesKnowledge: Number(salesSummary?.salesKnowledgeCount ?? 0),
    searchQueued: Number(salesSummary?.searchQueued || 0),
    searchRunning: Number(salesSummary?.searchRunning || 0),
    mineQueued: Number(salesSummary?.mineQueued || 0),
    mineRunning: Number(salesSummary?.mineRunning || 0),
    searchRuns: Number(salesSummary?.searchRuns || 0),
  }), [flashcards.length, opportunitycards, salesSummary]);

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
              companyId={companyId}
              items={opportunitycards}
              onAction={handleAction}
              onReorder={handleReorder}
            />
          )}
        </Stack>

        <Text size="sm">Sales lead generation runs inside the main local AI pipeline. The hosted webapp only queues intent, while the worker searches, mines, enriches, scores, and ranks company-only opportunitycards when the shared company pipeline is ready.</Text>

        <MetricGrid>
          <MetricCard icon={Briefcase} color="strategy" label="Opportunitycards" value={counts.total} detail="active company leads" />
          <MetricCard icon={Sparkles} color="knowmore" label="Sales Knowmore" value={counts.salesKnowledge} detail="sales-scoped and competitor context" />
          <MetricCard icon={Briefcase} color="checklist" label="High ICE" value={counts.ready} detail="ICE 80+ ready to review" />
          <MetricCard icon={Briefcase} color="review" label="Accepted" value={counts.accepted} detail="operator-approved leads" />
          <MetricCard icon={Sparkles} color="strategy" label="Search Queue" value={counts.searchQueued} detail={`${counts.searchRunning} running`} />
          <MetricCard icon={Sparkles} color="tactical" label="Mine Queue" value={counts.mineQueued} detail={`${counts.mineRunning} running`} />
          <MetricCard icon={Sparkles} color="review" label="Search Learning Runs" value={counts.searchRuns} detail="persisted worker search memory" />
        </MetricGrid>

        <UnifiedCard tone="strategy">
          <UnifiedCardHeader
            title="Search Learning State"
            supporting={<Text size="sm">{salesSummary?.searchStateUpdatedAt ? `Updated ${new Date(salesSummary.searchStateUpdatedAt).toLocaleString()}` : "No worker search state yet"}</Text>}
          />
          <UnifiedCardBody>
            <Stack gap="md">
              <Text size="sm">This is the worker-owned memory for internet lead search. The webapp reads it, but does not score or mutate it directly.</Text>

              {salesSummary && (salesSummary.lastQueries.length > 0 || salesSummary.topQueries.length > 0 || salesSummary.topTerms.length > 0 || salesSummary.topDomains.length > 0) ? (
                <UnifiedGrid cols={{ base: 1, lg: 3 }}>
                  <Stack gap="xs">
                    <Text size="sm">Recent Queries</Text>
                    <Group gap="xs">
                      {salesSummary.lastQueries.length > 0 ? salesSummary.lastQueries.map((query) => (
                        <Badge key={query} color="strategy" variant="light">{query}</Badge>
                      )) : <Text size="sm">No recent queries recorded.</Text>}
                    </Group>
                  </Stack>

                  <Stack gap="xs">
                    <Text size="sm">Top Terms</Text>
                    <Group gap="xs">
                      {salesSummary.topTerms.length > 0 ? salesSummary.topTerms.map((term) => (
                        <Badge key={term.key} color="review" variant="light">{term.key} ({term.score})</Badge>
                      )) : <Text size="sm">No learned terms yet.</Text>}
                    </Group>
                  </Stack>

                  <Stack gap="xs">
                    <Text size="sm">Top Domains</Text>
                    <Group gap="xs">
                      {salesSummary.topDomains.length > 0 ? salesSummary.topDomains.map((domain) => (
                        <Badge key={domain.key} color="knowmore" variant="light">{domain.key} ({domain.score})</Badge>
                      )) : <Text size="sm">No domain learning yet.</Text>}
                    </Group>
                  </Stack>
                </UnifiedGrid>
              ) : (
                <EmptyState
                  icon={Sparkles}
                  title="No search learning recorded yet"
                  description="Run internet lead search first. The worker will persist learned queries, terms, and domains here."
                  tone="strategy"
                />
              )}

              {salesSummary?.topQueries?.length ? (
                <Stack gap="xs">
                  <Text size="sm">Best Learned Queries</Text>
                  {salesSummary.topQueries.map((query) => (
                    <Text key={query.query} size="sm">
                      {query.query} · {query.accepted} accepted · {query.declined} declined · {query.createdOpportunitycards} leads created
                    </Text>
                  ))}
                </Stack>
              ) : null}
            </Stack>
          </UnifiedCardBody>
        </UnifiedCard>

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
