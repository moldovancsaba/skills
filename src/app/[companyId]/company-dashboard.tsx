'use client';

import React, { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { useRouter, useParams } from "next/navigation";
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
import { IconPlus as Plus, IconListNumbers as ListOrdered, IconSparkles as Sparkles, IconBolt as Zap, IconArrowRight as ArrowRight, IconTarget as Target, IconLayoutDashboard as LayoutDashboard, IconDatabase as Database, IconLayersIntersect as Layers, IconListCheck as ListCheck, IconHistory as History, IconActivity as Activity, IconAlertTriangle as AlertTriangle, IconCirclesRelation as CirclesRelation, IconHelmet as HardHat, IconSearch as Search, IconGitBranch as GitBranch, IconRadar2 as Radar } from "@tabler/icons-react";
import { stripTechnicalMetadata } from "@/lib/ui-utils";
import type { CompanyScoreHealth } from "@/lib/score-health";
import { BodyText, SectionTitle } from "@/components/ui/typography";
import { useI18n } from "@/lib/ui-i18n";

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

export default function CompanyDashboard() {
  const router = useRouter();
  const params = useParams();
  const companyId = params.companyId as string;

  const { company, setCompany, sources, setSources } = useStore();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [topTasks, setTopTasks] = useState<ChecklistTask[]>([]);
  const [counts, setCounts] = useState({
    sources: 0,
    topics: 0,
    flashcards: 0,
    goals: 0,
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
      setMembers(Array.isArray(data.members) ? data.members : []);
      setCounts(data.counts);
      setTopTasks(data.topTasks);
      setChartData(data.analytics);
      setScoreHealth(data.metrics?.scoreHealth ?? null);
      setIsOwner(data.viewerRole === "OWNER" || data.viewerRole === "SUPERADMIN");
    } catch (err) {
      console.error("[DASHBOARD] Sync failure:", err);
    } finally {
      setLoading(false);
    }
  }, [setCompany, setSources]);

  useEffect(() => {
    if (!companyId) return;

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
    return (
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
  const priorityBandShare = scoreHealth?.taskcards.priorityHealth?.dominantPriorityBand?.share ?? 0;
  const dominantTupleLabel = scoreHealth?.taskcards.dominantTuple?.label ?? "-";
  const topScoreAlert = scoreHealth?.alerts[0] ?? null;
  const planningCount = Math.max(Number(counts.tacticalCount || 0), Number(counts.checklistCount || 0));

  return (
    <PageShell width="full">
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
            <MemberList companyId={companyId} isOwner={isOwner} initialMembers={members} />
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
