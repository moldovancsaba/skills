'use client';

import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { useRouter, useParams } from "next/navigation";
import { 
  Stack, 
  Group, 
  Text, 
  Title, 
  Button, 
  Badge, 
  TextInput, 
  rem, 
  ActionIcon, 
  Tooltip, 
  SimpleGrid, 
  Loader, 
  Center 
} from "@mantine/core";
import { 
  IconDatabase as Database, 
  IconSearch as Search, 
  IconSparkles as Sparkles, 
  IconTrendingUp as TrendingUp, 
  IconTarget as Target, 
  IconPlus as Plus 
} from "@tabler/icons-react";
import { 
  MetricCard, 
  MetricGrid, 
  Notice, 
  PageHeader, 
  PageShell, 
  PipelineAccentHeader, 
  UnifiedGrid 
} from "@/components/ui/app-shell";
import { ExpertTipCard } from "@/components/expert-tip-card";
import { getDashboardExpertTip } from "@/content/help";
import { TaskReviewCard } from "@/components/task-review-card";

type Goal = {
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
  kanbanColumn: "IDEABANK" | "ROADMAP" | "BACKLOG" | "TODO" | "CHECKLIST";
  userAnnotation?: string;
  hashtags: string[];
};

type ActionMode = "ACCEPT" | "DECLINE" | "MODIFY_ACCEPT" | "DELIVER";

import { useIntelligenceSnapshot } from "@/hooks/use-intelligence-snapshot";

export default function GoalsPage() {
  const router = useRouter();
  const params = useParams();
  const companyId = params.companyId as string;
  
  const { company, setCompany } = useStore();
  const { snapshot, loading: snapshotLoading } = useIntelligenceSnapshot(companyId);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionItemId, setActionItemId] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode | null>(null);
  const [annotation, setAnnotation] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [declineClass, setDeclineClass] = useState("WRONG");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadGoals = useCallback(async (cid: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/goalcards?companyId=${cid}`);
      if (!res.ok) throw new Error("Failed to load strategic goals");
      const data = await res.json();
      const mappedGoals: Goal[] = Array.isArray(data)
        ? data.map((goal: any) => ({
            id: goal.id,
            publicId: goal.publicId ?? null,
            title: goal.title,
            description: goal.body ?? "",
            impact: goal.impact ?? 5,
            confidenceScore: goal.confidenceScore ?? goal.confidence ?? 50,
            ease: goal.weight ?? 5,
            iceScore: goal.iceScore ?? 0,
            processingStatus: goal.processingStatus,
            activityState: goal.activityState,
            kanbanColumn: "ROADMAP" as const,
            userAnnotation: goal.userAnnotation ?? undefined,
            hashtags: Array.isArray(goal.hashtags) ? goal.hashtags : [],
          }))
        : [];
      setGoals(mappedGoals);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Synchronization failure");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!companyId) return;

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
        await loadGoals(found.id);
      } catch (error) {
        console.error(error);
      }
    };

    void fetchCompany(companyId);
  }, [companyId, loadGoals, router, setCompany]);

  const openActionForm = (item: Goal, mode: ActionMode) => {
    setActionMode(mode);
    setActionItemId(item.id);
    setAnnotation(item.userAnnotation ?? "");
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

  const handleShare = async (item: Goal) => {
    const text = `${item.title}\n\n${item.description}\n\nImpact: ${item.impact} | Confidence: ${item.confidenceScore}% | Ease: ${item.ease}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error("Failed to copy", error);
    }
  };

  const filteredGoals = goals.filter(g => 
    g.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    g.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
            style={{ flex: 1, maxWidth: 400 }}
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
            <Text c="dimmed">No strategic goals match your criteria.</Text>
          </Center>
        ) : (
          <UnifiedGrid>
            {filteredGoals.map((goal) => (
              <TaskReviewCard
                key={goal.id}
                item={goal as any}
                isActionOpen={actionItemId === goal.id && actionMode !== null}
                actionMode={actionMode}
                isBusy={loading}
                copied={copiedId === goal.id}
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
                onShare={handleShare as any}
              />
            ))}
            <ExpertTipCard tip={tip} />
          </UnifiedGrid>
        )}
      </Stack>
    </PageShell>
  );
}
