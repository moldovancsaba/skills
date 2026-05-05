/**
 * STRATEGIC GOALS PAGE
 * v0.15.0
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  Database,
  Layers3,
  Search,
  Sparkles,
  TrendingUp,
  ArrowUpRight,
  Target,
  LayoutList,
  Filter
} from "lucide-react";
import { 
  Badge, 
  Button, 
  Group, 
  TextInput, 
  Stack, 
  Skeleton, 
  Loader, 
  Center,
  Text,
  Title,
  Card,
  rem,
  ThemeIcon,
  Box
} from "@mantine/core";
import {
  EmptyState,
  MetricCard,
  MetricGrid,
  Notice,
  PageHeader,
  PageShell,
  PipelineAccentHeader,
  UnifiedGrid,
} from "@/components/ui/app-shell";
import { KnowledgeReviewCard } from "@/components/knowledge-review-card";
import { MemberList } from "@/components/member-list";
import { ExpertTipCard } from "@/components/expert-tip-card";
import { getDashboardExpertTip } from "@/content/help";
import { matchesAllHashtags, parseHashtagFilterParam, stringifyHashtagFilterParam } from "@/lib/hashtags";
import { useStore } from "@/lib/store";
import React from "react";

type Company = {
  id: string;
  name: string;
};

type FlashcardSource = {
  id: string;
  sourceType: "SOURCE" | "PRODUCT" | "CUSTOMER" | "COMPETITOR" | "FILE" | "AGENT_FOUND";
  sourceId: string;
  sourcePublicId: number | null;
  sourceName: string;
  relationRole: "PRIMARY" | "SUPPORTING" | "MERGED_FROM";
};

type FlashcardAction = {
  id: string;
  action: "ACCEPT" | "DECLINE" | "MODIFY_ACCEPT";
  annotation: string | null;
  modifiedTitle: string | null;
  modifiedBody: string | null;
  createdAt: string;
};

type Goalcard = {
  id: string;
  publicId: number | null;
  kind: string;
  title: string;
  body: string;
  confidenceScore: number;
  impact: number;
  weight: number;
  processingStatus: "DRAFT" | "CHECKED" | "VERIFIED" | "ACCEPTED" | "DECLINED";
  activityState: "ACTIVE" | "STALE" | "EXPIRED" | "ARCHIVED";
  userAnnotation: string | null;
  hashtags: string[];
  lastActionAt: string | null;
  refreshedAt: string;
  sources: FlashcardSource[];
  actions: FlashcardAction[];
  intelligenceType: "INTERNAL" | "COMPETITOR";
  iceScore: number;
};

type ActionMode = "ACCEPT" | "DECLINE" | "MODIFY_ACCEPT" | "CONVERT";

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

function actionLabel(action: FlashcardAction["action"] | ActionMode) {
  switch (action) {
    case "ACCEPT": return "Accepted";
    case "DECLINE": return "Declined";
    case "MODIFY_ACCEPT": return "Modified + accepted";
    case "CONVERT": return "Converted";
  }
}

function reviewStatusLabel(processingStatus: Goalcard["processingStatus"]) {
  return processingStatus.charAt(0).toUpperCase() + processingStatus.slice(1).toLowerCase();
}

function kindLabel(kind: string) {
  return kind.toLowerCase().replace(/_/g, " ");
}

export default function CompanyGoalsPage() {
  const router = useRouter();
  const params = useParams();
  const companyId = params.companyId as string;
  const [company, setCompany] = useState<Company | null>(null);
  const [goals, setGoals] = useState<Goalcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeGoalId, setActiveGoalId] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode | null>(null);
  const [actionComment, setActionComment] = useState("");
  const [editedTitle, setEditedTitle] = useState("");
  const [editedBody, setEditedBody] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeHashtags, setActiveHashtags] = useState<string[]>([]);
  const { sources } = useStore();
  const [isOwner, setIsOwner] = useState(false);

  const loadGoals = useCallback(async (cid: string) => {
    const data = await fetchJson<Goalcard[]>(`/api/goalcards?companyId=${encodeURIComponent(cid)}`);
    setGoals(data);
  }, []);

  useEffect(() => {
    if (!companyId) return;

    const loadPage = async (cid: string) => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const companies = await fetchJson<Company[]>("/api/companies");
        const found = companies.find((item) => item.id === cid);
        if (!found) {
          router.push("/");
          return;
        }
        setCompany(found);
        await loadGoals(found.id);

        const [members, sessionRes] = await Promise.all([
          fetch(`/api/companies/${cid}/members`).then((res) => res.json()),
          fetch("/api/auth/session")
        ]);

        if (sessionRes.ok) {
          const session = await sessionRes.json();
          const myMembership = Array.isArray(members) ? members.find((m: any) => m.email === session.email) : null;
          setIsOwner(myMembership?.role === "OWNER" || myMembership?.role === "SUPERADMIN");
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      } finally {
        setLoading(false);
      }
    };

    loadPage(companyId);
  }, [companyId, loadGoals, router]);

  const filteredGoals = useMemo(() => {
    return goals.filter((goal) => {
      const matchesSearch = goal.title.toLowerCase().includes(searchQuery.toLowerCase()) || goal.body.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTags = matchesAllHashtags(goal.hashtags, activeHashtags);
      return matchesSearch && matchesTags;
    });
  }, [goals, searchQuery, activeHashtags]);

  const handleConvert = useCallback(async (id: string, targetType: string) => {
    if (!company) return;
    setActingId(id);
    try {
      await fetchJson("/api/intelligence/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: id,
          sourceType: "GOALCARD",
          targetType: targetType === "KNOWLEDGE" ? "FLASHCARD" : targetType === "TASK" ? "TASKCARD" : "GOALCARD",
          companyId: company.id
        })
      });
      setGoals(prev => prev.filter(g => g.id !== id));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setActingId(null);
    }
  }, [company]);

  if (loading) {
    return (
      <PageShell width="full">
        <Center h="100vh">
          <Stack align="center" gap="md">
            <Loader size="xl" variant="bars" color="brand" />
            <Text size="sm" fw={900} tt="uppercase" lts={2} c="dimmed">Synchronizing Strategic Goals...</Text>
          </Stack>
        </Center>
      </PageShell>
    );
  }

  const tip = getDashboardExpertTip({
    companyId,
    productCount: sources.length,
    customerCount: 0,
    competitorCount: 0,
    fileCount: 0,
    flashcardCount: 0,
    pendingTaskCount: goals.length,
  });

  return (
    <PageShell width="full">
      <Stack gap="xl">
        <PipelineAccentHeader 
          activeKey="goals" 
          title="Strategic Goals" 
          icon="target" 
        />
        {errorMessage && <Notice variant="destructive">{errorMessage}</Notice>}

        <MetricGrid>
          <MetricCard 
            icon={Target} 
            color="green" 
            label="Active Goals" 
            value={goals.length} 
            detail="Objectives under management" 
          />
          <MetricCard 
            icon={TrendingUp} 
            color="blue" 
            label="Synthesis Yield" 
            value="85%" 
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
            radius="md"
            size="md"
          />
          <Group gap="sm">
            <Button variant="light" color="gray" leftSection={<Filter size={16} />} size="sm" radius="md">Filters</Button>
          </Group>
        </Group>

        {filteredGoals.length === 0 ? (
          <Center h={rem(400)}>
            <Card radius="lg" withBorder p={rem(60)} ta="center" style={{ borderStyle: 'dashed', backgroundColor: 'transparent' }}>
              <Stack align="center" gap="xl">
                <ThemeIcon variant="light" color="gray" size={64} radius="xl">
                  <LayoutList size={32} />
                </ThemeIcon>
                <Stack gap="xs">
                  <Title order={3} fw={900} lts={-0.5}>No Strategic Goals Identified</Title>
                  <Text size="sm" c="dimmed" maw={400} mx="auto" fw={500}>
                    Goals represent the aspirational future of the organization. They are synthesized from evidence units or established manually.
                  </Text>
                </Stack>
              </Stack>
            </Card>
          </Center>
        ) : (
          <UnifiedGrid>
            <AnimatePresence mode="popLayout">
              {filteredGoals.map((goal, index) => (
                <motion.div 
                  key={goal.id} 
                  layout
                  initial={{ opacity: 0, scale: 0.98 }} 
                  animate={{ opacity: 1, scale: 1 }} 
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ delay: index * 0.03 }}
                >
                  <KnowledgeReviewCard
                    flashcard={goal as any}
                    cardType="GOAL"
                    isActionOpen={activeGoalId === goal.id}
                    actionMode={actionMode}
                    isBusy={actingId === goal.id}
                    isGenerating={false}
                    actionComment={actionComment}
                    editedTitle={editedTitle}
                    editedBody={editedBody}
                    reviewStatusLabel={reviewStatusLabel}
                    kindLabel={kindLabel}
                    actionLabel={actionLabel}
                    onOpenAction={(fc, mode) => {
                      setActiveGoalId(fc.id);
                      setActionMode(mode);
                      setEditedTitle(fc.title);
                      setEditedBody(fc.body);
                    }}
                    onCloseAction={() => {
                      setActiveGoalId(null);
                      setActionMode(null);
                    }}
                    onActionCommentChange={setActionComment}
                    onEditedTitleChange={setEditedTitle}
                    onEditedBodyChange={setEditedBody}
                    onSubmit={() => {}}
                    activeHashtags={activeHashtags}
                    onToggleHashtag={() => {}}
                    onRemoveHashtag={() => {}}
                    onConvert={(type) => handleConvert(goal.id, type)}
                  />
                </motion.div>
              ))}
              <ExpertTipCard tip={tip} />
              <MemberList companyId={companyId} isOwner={isOwner} />
            </AnimatePresence>
          </UnifiedGrid>
        )}
      </Stack>
    </PageShell>
  );
}
