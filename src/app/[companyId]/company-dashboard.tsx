'use client';

import React, { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { 
  SimpleGrid, 
  Stack, 
  Group, 
  Title, 
  Text, 
  Loader, 
  Box,
  Center,
  rem,
  Button,
  ActionIcon,
  Tooltip,
  ThemeIcon
} from "@mantine/core";
import { LinkCard, PageHeader, PageShell, RouteCardGrid } from "@/components/ui/app-shell";
import { TaskReviewCard } from "@/components/task-review-card";
import { MemberList } from "@/components/member-list";
import { getDashboardExpertTip } from "@/content/help";
import { ExpertTipCard } from "@/components/expert-tip-card";
import { IconPlus as Plus, IconListNumbers as ListOrdered, IconSparkles as Sparkles, IconBolt as Zap, IconArrowRight as ArrowRight, IconTarget as Target, IconLayoutDashboard as LayoutDashboard, IconDatabase as Database, IconLayersIntersect as Layers, IconListCheck as ListCheck, IconHistory as History } from "@tabler/icons-react";

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
  kanbanColumn: "IDEABANK" | "ROADMAP" | "BACKLOG" | "TODO" | "CHECKLIST";
  scheduledDate?: string | Date | null;
  userAnnotation?: string;
  hashtags: string[];
};

type ActionMode = "ACCEPT" | "DECLINE" | "MODIFY_ACCEPT" | "DELIVER";

export default function CompanyDashboard() {
  const router = useRouter();
  const params = useParams();
  const companyId = params.companyId as string;

  const { company, setCompany, sources, setSources, setNbaItems } = useStore();
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [topTasks, setTopTasks] = useState<NBAItem[]>([]);
  const [counts, setCounts] = useState({
    sources: 0,
    topics: 0,
    flashcards: 0,
    goals: 0,
    checklistCount: 0,
    nbaItems: 0,
    reviewCount: 0
  });
  const [actionMode, setActionMode] = useState<ActionMode | null>(null);
  const [actionItemId, setActionItemId] = useState<string | null>(null);
  const [annotation, setAnnotation] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [declineClass, setDeclineClass] = useState<string>("WRONG");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [chartData, setChartData] = useState<any[]>([]);

  const chartSeries = useCallback((...keys: string[]) => {
    return chartData.map((point) => {
      const value = keys.reduce<number | null>((resolved, key) => {
        if (resolved !== null) return resolved;
        const candidate = point?.[key];
        return typeof candidate === "number" ? candidate : null;
      }, null);
      return { date: point.date, value: value ?? 0 };
    });
  }, [chartData]);

  const loadDashboard = useCallback(async (cid: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/companies/${cid}/dashboard`);
      if (!res.ok) throw new Error("Failed to load dashboard summary");
      
      const data = await res.json();
      
      setCompany(data.company);
      setSources(Array.isArray(data.sources) ? data.sources : []);
      setCounts(data.counts);
      setTopTasks(data.topTasks);
      setChartData(data.analytics);
      
      const sessionRes = await fetch("/api/auth/session");
      if (sessionRes.ok) {
        const session = await sessionRes.json();
        const myMembership = Array.isArray(data.members) ? data.members.find((m: any) => m.email === session.email) : null;
        setIsOwner(myMembership?.role === "OWNER" || myMembership?.role === "SUPERADMIN");
      }
    } catch (err) {
      console.error("[DASHBOARD] Sync failure:", err);
    } finally {
      setLoading(false);
    }
  }, [setCompany, setSources]);

  useEffect(() => {
    if (!companyId) return;

    const fetchCompany = async (cid: string) => {
      try {
        const companies = await fetch(`/api/companies`).then((res) => res.json());
        if (!Array.isArray(companies)) return;
        const found = companies.find((c: any) => c.id === cid);
        if (!found) {
          router.push("/");
          return;
        }

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
    setDeclineClass("WRONG");
  }, []);

  const openActionForm = useCallback((item: NBAItem, mode: ActionMode) => {
    setActionMode(mode);
    setActionItemId(item.id);
    setAnnotation(item.userAnnotation ?? "");
    setDraftTitle(item.title);
    setDraftDescription(item.description);
    setDeclineClass("WRONG");
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
    submittedDeclineClass?: string,
  ) => {
    if (!company) return;

    setLoading(true);
    const payload = {
      companyId: company.id,
      entityId: itemId,
      entityType: "TASK", // Dashboard topTasks are always TASKS
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
    await loadDashboard(company.id);
    setLoading(false);
  }, [company, loadDashboard, resetActionForm]);

  const handlePostpone = useCallback(async (itemId: string, column: string) => {
    if (!column || !company) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/nba?id=${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kanbanColumn: column }),
      });
      if (res.ok) await loadDashboard(company.id);
    } finally {
      setLoading(false);
    }
  }, [company, loadDashboard]);

  if (loading) {
    return (
      <PageShell width="full">
        <Center style={{ minHeight: "60vh" }}>
          <Stack align="center" gap="xl">
            <Loader color="brand" />
            <Text c="dimmed">
              Synchronizing Intelligence Stream...
            </Text>
          </Stack>
        </Center>
      </PageShell>
    );
  }

  const safeSources = Array.isArray(sources) ? sources : [];
  const tip = getDashboardExpertTip({
    companyId,
    productCount: counts.sources,
    customerCount: 0,
    competitorCount: 0,
    fileCount: 0,
    flashcardCount: counts.flashcards,
    pendingTaskCount: counts.goals,
  });

  return (
    <PageShell width="full">
      <RouteCardGrid mb="xl">
        <LinkCard
          href={`/${companyId}/data`}
          icon={Database}
          variant="blue"
          metric={counts.sources}
          title="Data Ingress"
          chartData={chartSeries("sources", "dataIngress")}
        />
        <LinkCard
          href={`/${companyId}/topics`}
          icon={Layers}
          variant="indigo"
          metric={counts.topics}
          title="Topic Synthesis"
          chartData={chartSeries("topics", "topicSynthesis")}
        />
        <LinkCard
          href={`/${companyId}/knowmore`}
          icon={Sparkles}
          variant="teal"
          metric={counts.flashcards}
          title="Knowmore"
          chartData={chartSeries("flashcards", "knowmore")}
        />
        <LinkCard
          href={`/${companyId}/goals`}
          icon={Target}
          variant="violet"
          metric={counts.goals}
          title="Strategic Goals"
          chartData={chartSeries("goals", "strategicGoals", "nba")}
        />
        <LinkCard
          href={`/${companyId}/checklist`}
          icon={ListCheck}
          variant="orange"
          metric={counts.checklistCount}
          title="Checklist"
          chartData={chartSeries("checklist", "nba")}
        />
        <LinkCard
          href={`/${companyId}/tactical`}
          icon={LayoutDashboard}
          variant="cyan"
          metric={counts.nbaItems}
          title="Tactical Board"
          chartData={chartSeries("tacticalBoard", "nbaItems", "nba")}
        />
      </RouteCardGrid>

      <Stack gap={rem(60)}>
        <Stack gap="xl">
          <Group justify="space-between" align="flex-end">
            <Box>
              <Title order={2}>Synthesized Intelligence</Title>
              <Text c="dimmed">Top-priority strategic goals derived by the autonomous Trinity engine.</Text>
            </Box>
            <Button 
              component={Link}
              href={`/${companyId}/nba`}
              variant="light" 
              color="gray" 
              rightSection={<ArrowRight size={16} />}
            >
              Open Global Protocol
            </Button>
          </Group>

          <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="xl">
            {topTasks.map((task) => (
              <TaskReviewCard
                key={task.id}
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
                declineClass={declineClass}
                onDeclineClassChange={setDeclineClass}
                onToggleHashtag={() => {}}
                onRemoveHashtag={() => {}}
                onSubmit={handleFeedback}
                onShare={handleShare}
                onPostpone={handlePostpone}
              />
            ))}
            
            <ExpertTipCard tip={tip} />
            <MemberList companyId={companyId} isOwner={isOwner} />
          </SimpleGrid>
        </Stack>
      </Stack>

      <Box style={{ position: "fixed", bottom: rem(40), right: rem(40), zIndex: 100 }}>
        <Button
          onClick={() => router.push(`/${companyId}/data`)}
          size="lg"
          
          color="brand"
          leftSection={<Plus size={22} />}
        >
          Add Intelligence
        </Button>
      </Box>
    </PageShell>
  );
}
