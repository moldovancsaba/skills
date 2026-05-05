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
  rem
} from "@mantine/core";
import { Button } from "@/components/ui/button";
import { LinkCard, PageHeader, PageShell } from "@/components/ui/app-shell";
import { TaskReviewCard } from "@/components/task-review-card";
import { MemberList } from "@/components/member-list";
import { getDashboardExpertTip } from "@/content/help";
import { ExpertTipCard } from "@/components/expert-tip-card";
import { Plus, ListOrdered, Sparkles, Zap, ArrowRight, Target, LayoutDashboard } from "lucide-react";

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
  const [pendingTaskCount, setPendingTaskCount] = useState(0);
  const [tacticalCount, setTacticalCount] = useState(0);
  const [flashcardCount, setFlashcardCount] = useState(0);
  const [fileCount, setFileCount] = useState(0);
  const [topicCount, setTopicCount] = useState(0);
  const [companyCount, setCompanyCount] = useState(0);
  const [actionMode, setActionMode] = useState<ActionMode | null>(null);
  const [actionItemId, setActionItemId] = useState<string | null>(null);
  const [annotation, setAnnotation] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [declineClass, setDeclineClass] = useState<string>("WRONG");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [chartData, setChartData] = useState<any[]>([]);

  const loadDashboard = useCallback(async (cid: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/companies/${cid}/dashboard`);
      if (!res.ok) throw new Error("Failed to load dashboard summary");
      
      const data = await res.json();
      
      setCompany(data.company);
      setSources(Array.isArray(data.sources) ? data.sources : []);
      setFileCount(data.counts.files);
      setTopicCount(data.counts.topics);
      setFlashcardCount(data.counts.flashcards);
      setTacticalCount(data.counts.nbaItems);
      setPendingTaskCount(data.counts.pendingTasks);
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
  }, [setCompany, setSources, setNbaItems]);

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

        setCompanyCount(companies.length);
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
    const payload: any = {
      nbaItemId: itemId,
      action,
      annotation: feedbackAnnotation,
      modifiedTitle,
      modifiedDescription,
    };

    if (action === "DECLINE" && submittedDeclineClass) payload.declineClass = submittedDeclineClass;
    if (action === "DELIVER") payload.deliveryComment = feedbackAnnotation;

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
          <Stack align="center" gap="md">
            <Loader color="brand" size="xl" variant="bars" />
            <Text size="sm" fw={800} tt="uppercase" lts={1} c="dimmed">
              Synchronizing Intelligence...
            </Text>
          </Stack>
        </Center>
      </PageShell>
    );
  }

  const safeSources = Array.isArray(sources) ? sources : [];
  const tip = getDashboardExpertTip({
    companyId,
    productCount: safeSources.length,
    customerCount: 0,
    competitorCount: 0,
    fileCount,
    flashcardCount,
    pendingTaskCount,
  });

  return (
    <PageShell width="full">
      <PageHeader
        title={company?.name ?? "Organization"}
        description="Autonomous Intelligence OS: Integrated Data, Strategy, and Execution layers."
        backHref={companyCount > 1 ? "/" : undefined}
        backLabel="Switch company"
      />

      <SimpleGrid cols={{ base: 1, sm: 2, md: 5 }} spacing="lg" mb={40}>
        <LinkCard
          href={`/${companyId}/data`}
          icon={Plus}
          variant="blue"
          metric={safeSources.length + fileCount}
          title="Data Ingress"
          description="Source harvesting & processing"
          chartData={chartData.map(d => ({ date: d.date, value: d.sources }))}
        />
        <LinkCard
          href={`/${companyId}/topics`}
          icon={ListOrdered}
          variant="indigo"
          metric={topicCount}
          title="Topic Synthesis"
          description="Strategic focus prioritization"
          chartData={chartData.map(d => ({ date: d.date, value: d.topics }))}
        />
        <LinkCard
          href={`/${companyId}/knowmore`}
          icon={Sparkles}
          variant="knowledge"
          metric={flashcardCount}
          title="Knowmore"
          description="Contextual memory layer"
          chartData={chartData.map(d => ({ date: d.date, value: d.flashcards }))}
        />
        <LinkCard
          href={`/${companyId}/goals`}
          icon={Target}
          variant="strategy"
          metric={pendingTaskCount}
          title="Strategic Goals"
          description="High-confidence task generation"
          chartData={chartData.map(d => ({ date: d.date, value: d.nba }))}
        />
        <LinkCard
          href={`/${companyId}/tactical`}
          icon={LayoutDashboard}
          variant="execution"
          metric={tacticalCount}
          title="Tactical Board"
          description="Operational task orchestration"
          chartData={chartData.map(d => ({ date: d.date, value: d.nba }))}
        />
      </SimpleGrid>

      <Stack gap={40}>
        <Stack gap="md">
          <Group justify="space-between" align="flex-end">
            <Box>
              <Title order={2} size="h3" fw={900} lts={-0.5}>Generated Intelligence</Title>
              <Text size="sm" c="dimmed">Top-priority strategic goals synthesized by the Trinity engine.</Text>
            </Box>
            <Link href={`/${companyId}/nba`} style={{ textDecoration: 'none' }}>
              <Button 
                variant="subtle" 
                color="gray" 
                size="xs" 
                rightSection={<ArrowRight size={14} />}
                fw={700}
              >
                Open Full Checklist
              </Button>
            </Link>
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

      <Box style={{ position: "fixed", bottom: rem(32), right: rem(32), zIndex: 100 }}>
        <Button
          onClick={() => router.push(`/${companyId}/data`)}
          size="lg"
          radius="xl"
          color="brand"
          leftSection={<Plus size={20} />}
          style={{ boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }}
        >
          Add Intelligence
        </Button>
      </Box>
    </PageShell>
  );
}
