'use client';
import { Text } from "@/components/ui/typography";

import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { useRouter } from "next/navigation";
import { 
  Stack, Group, Button, Badge, TextInput, rem, ActionIcon, Tooltip, SimpleGrid, Loader, Center, Select } from "@/components/gds/primitives";
import { 
  IconDatabase as Database, 
  IconSearch as Search, 
  IconSparkles as Sparkles, 
  IconTrendingUp as TrendingUp, 
  IconTarget as Target, 
  IconPlus as Plus 
} from "@/components/gds/icons";
import { 
  EmptyState,
  MetricCard, 
  MetricGrid, 
  Notice, 
  PageHeader, 
  PageShell, 
  PipelineAccentHeader, 
  UnifiedGrid 
} from "@/components/ui/app-shell";
import { UnifiedCardModal } from "@/components/ui/unified-card-modal";
import { ExpertTipCard } from "@/components/expert-tip-card";
import { getDashboardExpertTip } from "@/content/help";
import { stripTechnicalMetadata } from "@/lib/ui-utils";
import { TaskReviewCard } from "@/components/task-review-card";
import type { GoalsInitialData } from "@/lib/server-goals-page-data";

type Goal = {
  id: string;
  publicId: number | null;
  title: string;
  description: string;
  impact: number;
  confidenceScore: number;
  ease: number;
  iceScore: number;
  processingStatus: "DRAFT" | "CHECKED" | "VERIFIED" | "ACCEPTED" | "DECLINED" | "REVIEW";
  activityState: "ACTIVE" | "STALE" | "EXPIRED" | "ARCHIVED";
  kanbanColumn: "IDEABANK" | "ROADMAP" | "BACKLOG" | "TODO" | "CHECKLIST";
  userAnnotation?: string;
  hashtags: string[];
  createdAt?: string | null;
  updatedAt?: string | null;
  refreshedAt?: string | null;
  lastActionAt?: string | null;
  boardState?: {
    boardKey: string;
    entityType: string;
    columnKey: "IDEABANK" | "ROADMAP" | "BACKLOG" | "TODO" | "CHECKLIST";
    orderRank: number;
    priority: number;
  };
};

type ActionMode = "ACCEPT" | "DECLINE" | "MODIFY_ACCEPT" | "DELIVER" | "DELETE";

export default function GoalsClient({
  companyId,
  initialData,
}: {
  companyId: string;
  initialData?: GoalsInitialData | null;
}) {
  const router = useRouter();
  
  const { company, setCompany } = useStore();
  const [snapshot, setSnapshot] = useState(initialData?.snapshotSummary ?? null);
  const [goals, setGoals] = useState<Goal[]>(initialData?.goals ?? []);
  const [loading, setLoading] = useState(!initialData);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionItemId, setActionItemId] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [annotation, setAnnotation] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [declineClass, setDeclineClass] = useState("WRONG");
  const [boardMoveLoadingId, setBoardMoveLoadingId] = useState<string | null>(null);

  const loadGoals = useCallback(async (cid: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/goalcards?companyId=${cid}`);
      if (!res.ok) throw new Error("Failed to load strategic goals");
      const data = await res.json();
      const goalItems = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
      const mappedGoals: Goal[] = goalItems
        .map((goal: any) => ({
            id: goal.id,
            publicId: goal.publicId ?? null,
            title: goal.title,
            description: goal.body ?? "",
            impact: goal.impact ?? 5,
            confidenceScore: goal.confidenceScore ?? goal.confidence ?? 5,
            ease: goal.weight ?? 5,
            iceScore: goal.iceScore ?? 0,
            processingStatus: goal.processingStatus,
            activityState: goal.activityState,
            kanbanColumn: (goal.boardState?.columnKey ?? "ROADMAP") as Goal["kanbanColumn"],
            userAnnotation: goal.userAnnotation ?? undefined,
            hashtags: Array.isArray(goal.hashtags) ? goal.hashtags : [],
            createdAt: goal.createdAt ?? null,
            updatedAt: goal.updatedAt ?? null,
            refreshedAt: goal.refreshedAt ?? null,
            lastActionAt: goal.lastActionAt ?? null,
            boardState: goal.boardState ?? {
              boardKey: "GOALS_STATUS",
              entityType: "GOALCARD",
              columnKey: "ROADMAP",
              orderRank: 0,
              priority: 0,
            },
          }))
        ;
      setGoals(mappedGoals);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Synchronization failure");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!companyId || initialData) return;

    const fetchCompany = async (cid: string) => {
      try {
        const dashboardRes = await fetch(`/api/companies/${cid}/dashboard`);
        if (!dashboardRes.ok) {
          if (dashboardRes.status === 404 || dashboardRes.status === 403) {
            router.push("/");
          }
          return;
        }

        const dashboard = await dashboardRes.json();
        const found = dashboard?.company;
        if (!found?.id) {
          router.push("/");
          return;
        }

        setCompany(found);
        setSnapshot({
          strategicGoalsCount: Number(dashboard?.counts?.goals ?? 0),
          synthesisYield: Number(dashboard?.metrics?.synthesisYield ?? 0),
          knowmoreCount: Number(dashboard?.counts?.flashcards ?? 0),
          dataIngressCount: Number(dashboard?.counts?.sources ?? 0),
        });
        await loadGoals(found.id);
      } catch (error) {
        console.error(error);
      }
    };

    void fetchCompany(companyId);
  }, [companyId, initialData, loadGoals, router, setCompany]);

  useEffect(() => {
    if (!initialData) return;
    setCompany(initialData.company as any);
  }, [initialData, setCompany]);

  const openActionForm = (item: Goal, mode: ActionMode) => {
    setSelectedGoalId(item.id);
    setActionMode(mode);
    setActionItemId(item.id);
    setAnnotation(stripTechnicalMetadata(item.userAnnotation));
    setDraftTitle(item.title);
    setDraftDescription(item.description);
    setDeclineClass("WRONG");
  };

  const resetActionForm = () => {
    setActionMode(null);
    setActionItemId(null);
    setAnnotation("");
    setDraftTitle("");
    setDraftDescription("");
    setDeclineClass("WRONG");
  };

  const closeDetailModal = () => {
    setSelectedGoalId(null);
    resetActionForm();
  };

  const handleBoardMove = useCallback(async (itemId: string, columnKey: Goal["kanbanColumn"]) => {
    setBoardMoveLoadingId(itemId);
    try {
      await fetch(`/api/goalcards?id=${encodeURIComponent(itemId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinationColumn: columnKey }),
      });
      await loadGoals(companyId);
    } finally {
      setBoardMoveLoadingId(null);
    }
  }, [companyId, loadGoals]);

  const handleSubmitFeedback = async (
    itemId: string,
    action: ActionMode,
    feedbackAnnotation?: string,
    modifiedTitle?: string,
    modifiedDescription?: string,
    submittedDeclineClass?: string,
  ) => {
    if (!companyId) return;
    setLoading(true);
    
    // JOURNAL FEEDBACK (Isolated from AI generation)
    const payload = {
      companyId,
      entityId: itemId,
      entityType: "GOAL",
      action,
      annotation: feedbackAnnotation,
      modifiedTitle,
      modifiedDescription,
      declineClass: submittedDeclineClass,
    };

    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    resetActionForm();
    await loadGoals(companyId);
    setLoading(false);
  };

  const filteredGoals = goals.filter(g => 
    g.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    g.description.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const selectedGoal = goals.find((goal) => goal.id === selectedGoalId) ?? null;

  const tip = getDashboardExpertTip({
    companyId,
    productCount: snapshot?.dataIngressCount || 0,
    customerCount: 0,
    competitorCount: 0,
    fileCount: 0,
    flashcardCount: snapshot?.knowmoreCount || 0,
    pendingTaskCount: snapshot?.strategicGoalsCount || goals.length,
  });

  if (loading && goals.length === 0) {
    return (
      <PageShell width="full">
        <Center h="60vh">
          <Stack align="center" gap="md">
            <Loader color="strategy" size="xl" variant="bars" />
            <Text size="sm" c="dimmed">Decrypting strategic objectives...</Text>
          </Stack>
        </Center>
      </PageShell>
    );
  }

  return (
    <PageShell width="full">
      <Stack gap="xl">
        <PipelineAccentHeader 
          activeKey="goals" 
          title="Strategic Goals" 
          icon={Target} 
        />
        {errorMessage && <Notice variant="destructive">{errorMessage}</Notice>}

        <MetricGrid>
          <MetricCard 
            icon={Target} 
            color="strategy" 
            label="Active Goals" 
            value={snapshot?.strategicGoalsCount ?? goals.length} 
            detail="Objectives under management" 
          />
          <MetricCard 
            icon={TrendingUp} 
            color="synthesis" 
            label="Synthesis Yield" 
            value={`${snapshot?.synthesisYield ?? 85}%`} 
            detail="Market research alignment" 
          />
        </MetricGrid>

        <Group justify="space-between" align="center">
          <TextInput 
            placeholder="Search objectives..." 
            leftSection={<Search size={16} />}
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)}
            flex={1}
            maw={400}
          />
          <Button 
            variant="light" 
            color="ingress" 
            leftSection={<Plus size={16} />}
            onClick={() => router.push(`/${companyId}/data`)}
          >
            Add Intelligence
          </Button>
        </Group>

        {filteredGoals.length === 0 ? (
          <Center h="20vh">
            <EmptyState
              icon={Target}
              tone="strategy"
              title="No strategic goals match your criteria"
            />
          </Center>
        ) : (
          <UnifiedGrid>
            {filteredGoals.map((goal) => (
              <TaskReviewCard
                key={goal.id}
                item={goal as any}
                twoPhaseWorkflow={false}
                onOpenDetail={() => setSelectedGoalId(goal.id)}
                isActionOpen={actionItemId === goal.id && actionMode !== null}
                actionMode={actionMode}
                isBusy={loading}
                annotation={annotation}
                draftTitle={draftTitle}
                draftDescription={draftDescription}
                onOpenAction={openActionForm as any}
                onCloseAction={resetActionForm}
                onAnnotationChange={setAnnotation}
                onDraftTitleChange={setDraftTitle}
                onDraftDescriptionChange={setDraftDescription}
                declineClass={declineClass}
                onDeclineClassChange={setDeclineClass}
                activeHashtags={[]}
                onToggleHashtag={() => {}}
                onRemoveHashtag={() => {}}
                onSubmit={handleSubmitFeedback}
              />
            ))}
            <ExpertTipCard tip={tip} />
          </UnifiedGrid>
        )}
      </Stack>

      <UnifiedCardModal
        opened={Boolean(selectedGoal)}
        onClose={closeDetailModal}
        tone="strategy"
        title={selectedGoal?.title ?? "Strategic Goal"}
        subtitle={selectedGoal ? `#${selectedGoal.publicId ?? "—"} · Strategic objective` : undefined}
        badge="Goals"
      >
        {selectedGoal ? (
          <Stack gap="md">
            <Group justify="space-between" align="flex-end">
              <Text size="xs" c="dimmed">Shared board status</Text>
              <Badge variant="light" color="strategy">
                {selectedGoal.boardState?.columnKey ?? selectedGoal.kanbanColumn}
              </Badge>
            </Group>
            <Select
              label="Strategic execution status"
              data={[
                { value: "IDEABANK", label: "Idea Bank" },
                { value: "ROADMAP", label: "Roadmap" },
                { value: "BACKLOG", label: "Backlog" },
                { value: "TODO", label: "Todo" },
                { value: "CHECKLIST", label: "Now" },
              ]}
              value={selectedGoal.boardState?.columnKey ?? selectedGoal.kanbanColumn}
              onChange={(value) => {
                if (value) {
                  void handleBoardMove(selectedGoal.id, value as Goal["kanbanColumn"]);
                }
              }}
              disabled={boardMoveLoadingId === selectedGoal.id}
            />
            <TaskReviewCard
              item={selectedGoal as any}
              twoPhaseWorkflow={false}
              detailMode
              hideTitle
              isActionOpen={actionItemId === selectedGoal.id && actionMode !== null}
              actionMode={actionMode}
              isBusy={loading}
              annotation={annotation}
              draftTitle={draftTitle}
              draftDescription={draftDescription}
              onOpenAction={openActionForm as any}
              onCloseAction={resetActionForm}
              onAnnotationChange={setAnnotation}
              onDraftTitleChange={setDraftTitle}
              onDraftDescriptionChange={setDraftDescription}
              declineClass={declineClass}
              onDeclineClassChange={setDeclineClass}
              activeHashtags={[]}
              onToggleHashtag={() => {}}
              onRemoveHashtag={() => {}}
              onSubmit={handleSubmitFeedback}
            />
          </Stack>
        ) : null}
      </UnifiedCardModal>
    </PageShell>
  );
}
