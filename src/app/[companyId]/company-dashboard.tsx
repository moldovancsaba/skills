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
  ThemeIcon,
  Badge,
} from "@mantine/core";
import { LinkCard, MetricCard, MetricGrid, PageHeader, PageShell, RouteCardGrid } from "@/components/ui/app-shell";
import { TaskReviewCard } from "@/components/task-review-card";
import { MemberList } from "@/components/member-list";
import { getDashboardExpertTip } from "@/content/help";
import { ExpertTipCard } from "@/components/expert-tip-card";
import { IconPlus as Plus, IconListNumbers as ListOrdered, IconSparkles as Sparkles, IconBolt as Zap, IconArrowRight as ArrowRight, IconTarget as Target, IconLayoutDashboard as LayoutDashboard, IconDatabase as Database, IconLayersIntersect as Layers, IconListCheck as ListCheck, IconHistory as History, IconActivity as Activity, IconAlertTriangle as AlertTriangle, IconCirclesRelation as CirclesRelation, IconHelmet as HardHat } from "@tabler/icons-react";
import { stripTechnicalMetadata } from "@/lib/ui-utils";
import type { CompanyScoreHealth } from "@/lib/score-health";

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
  createdAt?: string | null;
  updatedAt?: string | null;
  generatedAt?: string | null;
};

type ActionMode = "ACCEPT" | "DECLINE" | "MODIFY_ACCEPT" | "DELIVER" | "DELETE";

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
    reviewCount: 0,
    pipelineJobs: 0,
  });
  const [actionMode, setActionMode] = useState<ActionMode | null>(null);
  const [actionItemId, setActionItemId] = useState<string | null>(null);
  const [annotation, setAnnotation] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [declineClass, setDeclineClass] = useState<string>("WRONG");
  const [chartData, setChartData] = useState<any[]>([]);
  const [scoreHealth, setScoreHealth] = useState<CompanyScoreHealth | null>(null);

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
      setScoreHealth(data.metrics?.scoreHealth ?? null);
      
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
    setAnnotation(stripTechnicalMetadata(item.userAnnotation));
    setDraftTitle(item.title);
    setDraftDescription(item.description);
    setDeclineClass("WRONG");
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
    if (action === "DELETE") {
      await fetch(`/api/nba?id=${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          processingStatus: "ACCEPTED",
          activityState: "ARCHIVED",
          candidateState: "ARCHIVED",
          status: "ARCHIVED",
          evaluationReason: feedbackAnnotation?.trim() || "Accepted but not delivered",
          acceptedNotDelivered: true,
        }),
      });
    } else {
      const payload = {
        companyId: company.id,
        entityId: itemId,
        entityType: "TASK",
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

      if (action === "ACCEPT") {
        await fetch(`/api/nba?id=${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            processingStatus: "ACCEPTED",
            status: "ACCEPTED",
            evaluationReason: feedbackAnnotation?.trim() || "Accepted for execution",
          }),
        });
      } else if (action === "DELIVER") {
        await fetch(`/api/nba?id=${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            processingStatus: "ACCEPTED",
            activityState: "ARCHIVED",
            candidateState: "DELIVERED",
            status: "COMPLETED",
            evaluationReason: feedbackAnnotation?.trim() || "Delivered in reality",
          }),
        });
      }
    }

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
            <Loader color="ingress" />
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
  const scoreHealthColor =
    scoreHealth?.overallBand === "CRITICAL"
      ? "review"
      : scoreHealth?.overallBand === "WARNING" || scoreHealth?.overallBand === "SUSPICIOUS"
        ? "strategy"
        : "knowmore";
  const taskTupleShare = scoreHealth?.taskcards.dominantTuple?.share ?? 0;
  const taskDiversity = scoreHealth?.taskcards.diversityRatio ?? 0;
  const dominantTupleLabel = scoreHealth?.taskcards.dominantTuple?.label ?? "—";
  const topScoreAlert = scoreHealth?.alerts[0] ?? null;

  return (
    <PageShell width="full">
      <RouteCardGrid mb="xl">
        <LinkCard
          href={`/${companyId}/data`}
          icon={Database}
          variant="ingress"
          metric={counts.sources}
          title="Data"
          chartData={chartSeries("sources", "dataIngress")}
        />
        <LinkCard
          href={`/${companyId}/topics`}
          icon={Layers}
          variant="synthesis"
          metric={counts.topics}
          title="Topics"
          chartData={chartSeries("topics", "topicSynthesis")}
        />
        <LinkCard
          href={`/${companyId}/goals`}
          icon={Target}
          variant="strategy"
          metric={counts.goals}
          title="Goals"
          chartData={chartSeries("goals", "strategicGoals", "nba")}
        />
        <LinkCard
          href={`/${companyId}/review`}
          icon={History}
          variant="review"
          metric={counts.reviewCount}
          title="Review"
          chartData={chartSeries("reviewGateway", "nba")}
        />
        <LinkCard
          href={`/${companyId}/knowmore`}
          icon={Sparkles}
          variant="knowmore"
          metric={counts.flashcards}
          title="Knowmore"
          chartData={chartSeries("flashcards", "knowmore")}
        />
        <LinkCard
          href={`/${companyId}/tactical`}
          icon={LayoutDashboard}
          variant="tactical"
          metric={counts.nbaItems}
          title="Planning"
          chartData={chartSeries("tacticalBoard", "nbaItems", "nba")}
        />
        <LinkCard
          href={`/${companyId}/nba`}
          icon={ListCheck}
          variant="checklist"
          metric={counts.checklistCount}
          title="Checklist"
          chartData={chartSeries("checklist", "nba")}
        />
        <LinkCard
          href={`/${companyId}/pipeline`}
          icon={HardHat}
          variant="review"
          metric={counts.pipelineJobs}
          title="Worker Queue"
          chartData={chartSeries("pipelineJobs", "reviewGateway")}
        />
      </RouteCardGrid>

      <Stack gap={rem(60)}>
        <Stack gap="xl">
          <Group justify="space-between" align="flex-end">
            <Box>
              <Title order={2}>Score Health</Title>
              <Text c="dimmed">Live observability for score clustering, tuple repetition, and tactical score diversity.</Text>
            </Box>
            {scoreHealth && (
              <Badge color={scoreHealthColor} size="lg" variant="light">
                {scoreHealth.overallBand}
              </Badge>
            )}
          </Group>

          <MetricGrid cols={{ base: 1, md: 2, xl: 3 }}>
            <MetricCard
              icon={Activity}
              color={scoreHealthColor}
              label="Task Tuple Repeat"
              value={scoreHealth ? `${Math.round(taskTupleShare * 100)}%` : "—"}
              detail={
                scoreHealth
                  ? `${scoreHealth.taskcards.dominantTupleSeverity} · dominant tuple ${dominantTupleLabel}`
                  : "Awaiting score health sample"
              }
            />
            <MetricCard
              icon={CirclesRelation}
              color={scoreHealthColor}
              label="Task ICE Diversity"
              value={scoreHealth ? `${scoreHealth.taskcards.uniqueIceScores}/${scoreHealth.taskcards.count}` : "—"}
              detail={
                scoreHealth
                  ? `${scoreHealth.taskcards.diversitySeverity} · ${Math.round(taskDiversity * 100)}% unique tuples across active tasks`
                  : "Awaiting score health sample"
              }
            />
            <MetricCard
              icon={AlertTriangle}
              color={scoreHealth?.dominantSurface === "TASK" ? "review" : scoreHealth?.dominantSurface === "KNOWLEDGE" ? "knowmore" : scoreHealthColor}
              label="Score Alert"
              value={topScoreAlert?.severity ?? scoreHealth?.dominantSurface ?? "—"}
              detail={
                topScoreAlert
                  ? topScoreAlert.detail
                  : scoreHealth
                    ? `Knowledge repeat ${Math.round((scoreHealth.knowledge.dominantTuple?.share ?? 0) * 100)}%`
                    : "Awaiting score health sample"
              }
            />
          </MetricGrid>
        </Stack>

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
          
          color="ingress"
          leftSection={<Plus size={22} />}
        >
          Add Intelligence
        </Button>
      </Box>
    </PageShell>
  );
}
