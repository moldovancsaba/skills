/**
 * COMPANY DASHBOARD PAGE
 * v0.11.3-PRODUCTION
 * 
 * Implements Unified Page Architecture:
 * - PageShell: Full-Width Layout
 * - UnifiedGrid: 3-Column Desktop Display for checklist preview
 */
'use client';

import React, { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { 
  Container, 
  SimpleGrid, 
  Stack, 
  Group, 
  Title, 
  Text, 
  Button as MantineButton, 
  Loader, 
  rem, 
  ActionIcon,
  Tooltip
} from "@mantine/core";
import { LinkCard, PageHeader, PageShell, UnifiedGrid } from "@/components/ui/app-shell";
import { TaskReviewCard } from "@/components/task-review-card";
import { MemberList } from "@/components/member-list";
import { getDashboardExpertTip } from "@/content/help";
import { motion } from "framer-motion";
import { ExpertTipCard } from "@/components/expert-tip-card";
import { Plus, ListOrdered, Sparkles, Zap, ArrowRight } from "lucide-react";

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
  scheduledDate?: string | Date | null;
  userAnnotation?: string;
  hashtags: string[];
};

type Flashcard = {
  id: string;
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
    const safeFetch = async (url: string) => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Fetch failed: ${url} status ${res.status}`);
        return await res.json();
      } catch (e) {
        console.error(e);
        return [];
      }
    };

    const [s, f, nba, knowmore, topics, members, analytics] = await Promise.all([
      safeFetch(`/api/sources?companyId=${cid}`),
      safeFetch(`/api/data-files?companyId=${cid}`),
      safeFetch(`/api/nba?companyId=${cid}`),
      safeFetch(`/api/knowmore?companyId=${cid}`),
      safeFetch(`/api/topics?companyId=${cid}`),
      safeFetch(`/api/companies/${cid}/members`),
      safeFetch(`/api/analytics/counts?companyId=${cid}`),
    ]);

    setSources(Array.isArray(s) ? s : []);
    setFileCount(Array.isArray(f) ? f.length : 0);
    setNbaItems(Array.isArray(nba) ? nba : []);
    setTopicCount(Array.isArray(topics) ? topics.length : 0);
    setFlashcardCount(Array.isArray(knowmore) ? knowmore.length : 0);
    setChartData(Array.isArray(analytics) ? analytics : []);

    const safeNBA = Array.isArray(nba) ? nba as NBAItem[] : [];
    const now = new Date();
    const pendingTasks = safeNBA.filter((item) =>
      ["DRAFT", "CHECKED", "VERIFIED"].includes(item.processingStatus) &&
      ["ACTIVE", "STALE"].includes(item.activityState) &&
      (!item.scheduledDate || new Date(item.scheduledDate) <= now)
    );
    setPendingTaskCount(pendingTasks.length);
    setTopTasks(pendingTasks.slice(0, 3));

    // Get current user session to determine role
    const sessionRes = await fetch("/api/auth/session");
    if (sessionRes.ok) {
      const session = await sessionRes.json();
      const myMembership = Array.isArray(members) ? members.find((m: any) => m.email === session.email) : null;
      setIsOwner(myMembership?.role === "OWNER" || myMembership?.role === "SUPERADMIN");
    }
  }, [setSources, setNbaItems]);

  useEffect(() => {
    if (!companyId) return;

    const fetchCompany = async (cid: string) => {
      try {
        const companies = await fetch(`/api/companies`).then((res) => res.json());
        if (!Array.isArray(companies)) {
          console.error("Invalid companies response:", companies);
          return;
        }
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

    if (action === "DECLINE" && submittedDeclineClass) {
      payload.declineClass = submittedDeclineClass;
    }
    if (action === "DELIVER") {
      payload.deliveryComment = feedbackAnnotation;
    }

    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    resetActionForm();
    await loadDashboard(company.id);
    setLoading(false);
  }, [company, loadDashboard, resetActionForm]);

  const handlePostpone = useCallback(async (itemId: string, date: Date | undefined) => {
    if (!date || !company) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/nba?id=${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledDate: date }),
      });
      if (res.ok) {
        await loadDashboard(company.id);
      }
    } finally {
      setLoading(false);
    }
  }, [company, loadDashboard]);

  if (loading) {
    return (
      <Container size="xl" py={100}>
        <Stack align="center" gap="md">
          <Loader color="blue" />
          <Text size="sm" c="dimmed">Initializing checklist Context...</Text>
        </Stack>
      </Container>
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
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <PageHeader
          title={company?.name ?? "Company"}
          description="Integrated intelligence layers: Data, Topics, Knowmore, and checklist."
          backHref={companyCount > 1 ? "/" : undefined}
          backLabel="Switch company"
        />
      </motion.div>

      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md" mb="xl">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <LinkCard
            href={`/${companyId}/data`}
            icon={Plus}
            variant="blue"
            metric={(Array.isArray(sources) ? sources.length : 0) + fileCount}
            title="Data Collection"
            description="Raw sources & files"
            chartData={chartData.map(d => ({ date: d.date, value: d.sources }))}
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <LinkCard
            href={`/${companyId}/topics`}
            icon={ListOrdered}
            variant="amber"
            metric={topicCount}
            title="Topics"
            description="Prioritize AI focus"
            chartData={chartData.map(d => ({ date: d.date, value: d.topics }))}
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <LinkCard
            href={`/${companyId}/knowmore`}
            icon={Sparkles}
            variant="green"
            metric={flashcardCount}
            title="Knowmore"
            description="Knowledge layer"
            chartData={chartData.map(d => ({ date: d.date, value: d.flashcards }))}
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
          <LinkCard
            href={`/${companyId}/nba`}
            icon={Zap}
            variant="violet"
            metric={pendingTaskCount}
            title="checklist"
            description="High-impact actions"
            chartData={chartData.map(d => ({ date: d.date, value: d.nba }))}
          />
        </motion.div>
      </SimpleGrid>

      <Stack gap="xl">
        <Group justify="space-between" align="flex-end">
          <div>
            <Title order={3} size="h4" fw={700}>Top strategic intelligence</Title>
            <Text size="sm" c="dimmed">High-impact tasks generated by the trinity engine.</Text>
          </div>
          <MantineButton 
            variant="subtle" 
            color="gray" 
            size="xs" 
            component={Link} 
            href={`/${companyId}/nba`}
            rightSection={<ArrowRight size={14} />}
          >
            Open full checklist
          </MantineButton>
        </Group>

        <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
          {topTasks.map((task, index) => (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.03 }}
            >
              <TaskReviewCard
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
            </motion.div>
          ))}
          
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: topTasks.length * 0.03 }}>
            <ExpertTipCard tip={tip} />
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: (topTasks.length + 1) * 0.03 }}>
            <MemberList companyId={companyId} isOwner={isOwner} />
          </motion.div>
        </SimpleGrid>
      </Stack>

      <div className="fixed bottom-6 right-6 md:bottom-8 md:right-8" style={{ zIndex: 100 }}>
        <MantineButton
          onClick={() => router.push(`/${companyId}/data`)}
          size="lg"
          radius="xl"
          className="shadow-xl"
          color="blue"
          leftSection={<Zap size={20} />}
        >
          Quick Add
        </MantineButton>
      </div>
    </PageShell>
  );
}
