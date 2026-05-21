'use client';

import React, { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { 
  SimpleGrid, 
  Stack, 
  Group, 
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
import { IconPlus as Plus, IconListNumbers as ListOrdered, IconSparkles as Sparkles, IconBolt as Zap, IconArrowRight as ArrowRight, IconTarget as Target, IconLayoutDashboard as LayoutDashboard, IconDatabase as Database, IconLayersIntersect as Layers, IconListCheck as ListCheck, IconHistory as History, IconActivity as Activity, IconAlertTriangle as AlertTriangle, IconCirclesRelation as CirclesRelation, IconHelmet as HardHat, IconSearch as Search, IconGitBranch as GitBranch, IconRadar2 as Radar, IconBriefcase as Briefcase } from "@tabler/icons-react";
import { stripTechnicalMetadata } from "@/lib/ui-utils";
import type { CompanyScoreHealth } from "@/lib/score-health";
import { BodyText, SectionTitle } from "@/components/ui/typography";
import { useI18n } from "@/lib/ui-i18n";
import type { ProjectionFreshness } from "@/lib/webapp-projection";
import { WEBAPP_SUMMARY_REFRESH_MS } from "@/lib/webapp-projection";
import type { DashboardInitialData } from "@/lib/server-company-page-data";

type ChecklistTask = {
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

export default function CompanyDashboard({
  companyId,
  initialData,
  fallback,
}: {
  companyId: string;
  initialData?: DashboardInitialData | null;
  fallback?: React.ReactNode;
}) {
  const router = useRouter();

  const { company, setCompany } = useStore();
  const { t } = useI18n();
  const [loading, setLoading] = useState(!initialData);
  const [isOwner, setIsOwner] = useState(Boolean(initialData?.isOwner));
  const [topTasks, setTopTasks] = useState<ChecklistTask[]>(() =>
    Array.isArray(initialData?.topTasks)
      ? initialData.topTasks.map((task: ChecklistTask & { description?: string | null }) => ({
          ...task,
          description: task.description ?? "",
        }))
      : [],
  );
  const [counts, setCounts] = useState(() => initialData?.counts ?? {
    sources: 0,
    topics: 0,
    flashcards: 0,
    goals: 0,
    sales: 0,
    checklistCount: 0,
    tacticalCount: 0,
    reviewCount: 0,
    pipelineJobs: 0,
  });
  const [actionMode, setActionMode] = useState<ActionMode | null>(null);
  const [actionItemId, setActionItemId] = useState<string | null>(null);
  const [annotation, setAnnotation] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [declineClass, setDeclineClass] = useState<string>("WRONG");
  const [chartData, setChartData] = useState<any[]>(() => initialData?.analytics ?? []);
  const [scoreHealth, setScoreHealth] = useState<CompanyScoreHealth | null>(() => initialData?.scoreHealth ?? null);
  const [projectionFreshness, setProjectionFreshness] = useState<ProjectionFreshness | null>(() => initialData?.projectionFreshness ?? null);

  useEffect(() => {
    if (!initialData) return;
    setCompany(initialData.company);
  }, [initialData, setCompany]);

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
      setCounts(data.counts);
      setTopTasks(
        Array.isArray(data.topTasks)
          ? data.topTasks.map((task: ChecklistTask & { description?: string | null }) => ({
              ...task,
              description: task.description ?? "",
            }))
          : [],
      );
      setChartData(data.analytics);
      setScoreHealth(data.metrics?.scoreHealth ?? null);
      setProjectionFreshness(data.projection?.freshness ?? null);
      setIsOwner(data.viewerRole === "OWNER" || data.viewerRole === "SUPERADMIN");
    } catch (err) {
      console.error("[DASHBOARD] Sync failure:", err);
    } finally {
      setLoading(false);
    }
  }, [setCompany]);

  useEffect(() => {
    if (!companyId || initialData) return;

    const initializeDashboard = async (cid: string) => {
      try {
        await loadDashboard(cid);
      } catch (error) {
        console.error("Dashboard initialization failed:", error);
      } finally {
        setLoading(false);
      }
    };

    void initializeDashboard(companyId);
  }, [companyId, initialData, loadDashboard]);

  useEffect(() => {
    if (!companyId) return;

    const intervalId = window.setInterval(() => {
      void loadDashboard(companyId);
    }, WEBAPP_SUMMARY_REFRESH_MS);

    return () => window.clearInterval(intervalId);
  }, [companyId, loadDashboard]);

  const resetActionForm = useCallback(() => {
    setActionMode(null);
    setActionItemId(null);
    setAnnotation("");
    setDraftTitle("");
    setDraftDescription("");
    setDeclineClass("WRONG");
  }, []);

  const openActionForm = useCallback((item: ChecklistTask, mode: ActionMode) => {
    setActionMode(mode);
    setActionItemId(item.id);
    setAnnotation(stripTechnicalMetadata(item.userAnnotation));
    setDraftTitle(item.title);
    setDraftDescription(item.description ?? "");
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
      await fetch(`/api/checklist?id=${itemId}`, {
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
        await fetch(`/api/checklist?id=${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            processingStatus: "ACCEPTED",
            status: "ACCEPTED",
            evaluationReason: feedbackAnnotation?.trim() || "Accepted for execution",
          }),
        });
      } else if (action === "DELIVER") {
        await fetch(`/api/checklist?id=${itemId}`, {
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
      const res = await fetch(`/api/checklist?id=${itemId}`, {
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
    return fallback ?? (
      <PageShell width="full">
        <Center mih="60vh">
          <Stack align="center" gap="xl">
            <Loader color="ingress" />
            <BodyText>{t("dashboard.loading")}</BodyText>
          </Stack>
        </Center>
      </PageShell>
    );
  }

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
  const priorityBandShare = scoreHealth?.taskcards.priorityHealth?.dominantPriorityBand?.share ?? 0;
  const dominantTupleLabel = scoreHealth?.taskcards.dominantTuple?.label ?? "-";
  const topScoreAlert = scoreHealth?.alerts[0] ?? null;
  const planningCount = Math.max(Number(counts.tacticalCount || 0), Number(counts.checklistCount || 0));
  const projectionFreshnessLabel =
    projectionFreshness?.status === "FRESH"
      ? `Projection fresh${projectionFreshness.ageMinutes != null ? ` · ${projectionFreshness.ageMinutes}m` : ""}`
      : projectionFreshness?.status === "AGING"
        ? `Projection aging${projectionFreshness.ageMinutes != null ? ` · ${projectionFreshness.ageMinutes}m` : ""}`
        : projectionFreshness?.status === "STALE"
          ? `Projection stale${projectionFreshness.ageMinutes != null ? ` · ${projectionFreshness.ageMinutes}m` : ""}`
          : "Projection missing";

  return (
    <PageShell width="full">
      <Group gap="sm" mb="md">
        <Badge size="sm" variant="light" color="tactical">
          Planning {planningCount}
        </Badge>
        <Badge size="sm" variant="light" color="checklist">
          Checklist {counts.checklistCount}
        </Badge>
        <Badge
          size="sm"
          variant="outline"
          color={projectionFreshness?.status === "STALE" ? "review" : projectionFreshness?.status === "AGING" ? "strategy" : "gray"}
        >
          {projectionFreshnessLabel}
        </Badge>
      </Group>
      <RouteCardGrid cols={{ base: 1, sm: 2, xl: 4 }} mb="xl">
        <LinkCard
          href={`/${companyId}/data`}
          icon={Database}
          variant="ingress"
          metric={counts.sources}
          title={t("dashboard.data")}
          chartData={chartSeries("sources", "dataIngress")}
          density="compact"
        />
        <LinkCard
          href={`/${companyId}/topics`}
          icon={Layers}
          variant="synthesis"
          metric={counts.topics}
          title={t("dashboard.topics")}
          chartData={chartSeries("topics", "topicSynthesis")}
          density="compact"
        />
        <LinkCard
          href={`/${companyId}/goals`}
          icon={Target}
          variant="strategy"
          metric={counts.goals}
          title={t("dashboard.goals")}
          chartData={chartSeries("goals", "strategicGoals", "checklist", "nba")}
          density="compact"
        />
        <LinkCard
          href={`/${companyId}/review`}
          icon={History}
          variant="review"
          metric={counts.reviewCount}
          title={t("dashboard.review")}
          chartData={chartSeries("reviewGateway", "checklist", "nba")}
          density="compact"
        />
        <LinkCard
          href={`/${companyId}/knowmore`}
          icon={Sparkles}
          variant="knowmore"
          metric={counts.flashcards}
          title={t("dashboard.knowmore")}
          chartData={chartSeries("flashcards", "knowmore")}
          density="compact"
        />
        <LinkCard
          href={`/${companyId}/sales`}
          icon={Briefcase}
          variant="strategy"
          metric={counts.sales}
          title={t("nav.sales")}
          density="compact"
        />
        <LinkCard
          href={`/${companyId}/tactical`}
          icon={LayoutDashboard}
          variant="tactical"
          metric={planningCount}
          title={t("dashboard.tactical")}
          chartData={chartSeries("tacticalBoard", "tacticalCount", "checklistTasks", "nba")}
          density="compact"
        />
        <LinkCard
          href={`/${companyId}/checklist`}
          icon={ListCheck}
          variant="checklist"
          metric={counts.checklistCount}
          title={t("dashboard.checklist")}
          chartData={chartSeries("checklist", "nba")}
          density="compact"
        />
        <LinkCard
          href={`/${companyId}/pipeline`}
          icon={HardHat}
          variant="neutral"
          metric={counts.pipelineJobs}
          title={t("dashboard.aiQueue")}
          chartData={chartSeries("pipelineJobs", "reviewGateway")}
          density="compact"
        />
      </RouteCardGrid>

      <RouteCardGrid cols={{ base: 1, md: 3 }} mb="xl">
        <LinkCard
          href={`/${companyId}/search`}
          icon={Search}
          variant="knowmore"
          title={t("dashboard.searchAnswers")}
          description={t("dashboard.searchDescription")}
          density="compact"
        />
        <LinkCard
          href={`/${companyId}/workflows`}
          icon={GitBranch}
          variant="review"
          title={t("dashboard.workflows")}
          description={t("dashboard.workflowsDescription")}
          density="compact"
        />
        <LinkCard
          href={`/${companyId}/observability`}
          icon={Radar}
          variant="strategy"
          title={t("dashboard.observability")}
          description={t("dashboard.observabilityDescription")}
          density="compact"
        />
      </RouteCardGrid>

      <Stack gap={rem(60)}>
        <Stack gap="xl">
          <Group justify="space-between" align="flex-end">
            <Box>
              <SectionTitle>{t("dashboard.scoreHealth")}</SectionTitle>
              <BodyText>{t("dashboard.scoreHealthDescription")}</BodyText>
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
              label={t("dashboard.taskTupleRepeat")}
              value={scoreHealth ? `${Math.round(taskTupleShare * 100)}%` : "—"}
              detail={
                scoreHealth
                  ? `${scoreHealth.taskcards.dominantTupleSeverity} · dominant tuple ${dominantTupleLabel}`
                  : t("dashboard.awaitingScoreSample")
              }
            />
            <MetricCard
              icon={CirclesRelation}
              color={scoreHealthColor}
              label={t("dashboard.taskPriorityCrowd")}
              value={scoreHealth ? `${Math.round(priorityBandShare * 100)}%` : "—"}
              detail={
                scoreHealth
                  ? `${scoreHealth.taskcards.priorityHealth?.dominantPrioritySeverity ?? "HEALTHY"} · dominant band ${scoreHealth.taskcards.priorityHealth?.dominantPriorityBand?.label ?? "—"}`
                  : t("dashboard.awaitingScoreSample")
              }
            />
            <MetricCard
              icon={AlertTriangle}
              color={scoreHealth?.dominantSurface === "TASK" ? "review" : scoreHealth?.dominantSurface === "KNOWLEDGE" ? "knowmore" : scoreHealthColor}
              label={t("dashboard.scoreAlert")}
              value={topScoreAlert?.severity ?? scoreHealth?.dominantSurface ?? "—"}
              detail={
                topScoreAlert
                  ? topScoreAlert.detail
                  : scoreHealth
                    ? `Knowledge repeat ${Math.round((scoreHealth.knowledge.dominantTuple?.share ?? 0) * 100)}%`
                    : t("dashboard.awaitingScoreSample")
              }
            />
            <MetricCard
              icon={CirclesRelation}
              color={scoreHealthColor}
              label={t("dashboard.taskIceDiversity")}
              value={scoreHealth ? `${scoreHealth.taskcards.uniqueIceScores}/${scoreHealth.taskcards.count}` : "—"}
              detail={
                scoreHealth
                  ? `${scoreHealth.taskcards.diversitySeverity} · ${Math.round(taskDiversity * 100)}% unique tuples across active tasks`
                  : t("dashboard.awaitingScoreSample")
              }
            />
          </MetricGrid>
        </Stack>

        <Stack gap="xl">
          <Group justify="space-between" align="flex-end">
            <Box>
              <SectionTitle>{t("dashboard.synthesizedIntelligence")}</SectionTitle>
              <BodyText>{t("dashboard.synthesizedDescription")}</BodyText>
            </Box>
            <Button 
              component={Link}
              href={`/${companyId}/checklist`}
              variant="light" 
              color="gray" 
              rightSection={<ArrowRight size={16} />}
            >
              {t("dashboard.openGlobalProtocol")}
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
          {t("dashboard.addIntelligence")}
        </Button>
      </Box>
    </PageShell>
  );
}
