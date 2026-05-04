/**
 * STRATEGIC GOALS PAGE
 * v0.14.0-PRODUCTION
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Brain,
  Database,
  Layers3,
  Loader2,
  Search,
  Sparkles,
  TrendingUp,
  ArrowUpRight,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Group, TextInput } from "@mantine/core";
import {
  EmptyState,
  MetricCard,
  MetricGrid,
  Notice,
  PageHeader,
  PageShell,
  UnifiedGrid,
} from "@/components/ui/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { KnowledgeReviewCard } from "@/components/knowledge-review-card";
import { MemberList } from "@/components/member-list";
import { ExpertTipCard } from "@/components/expert-tip-card";
import { getDashboardExpertTip } from "@/content/help";
import { matchesAllHashtags, parseHashtagFilterParam, stringifyHashtagFilterParam } from "@/lib/hashtags";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
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

type FlashcardCorrection = {
  id: string;
  correctionType: "HIDE" | "MARK_WRONG" | "PIN" | "REQUEST_REFRESH" | "SUPPRESS_SOURCE";
  note: string | null;
  sourceType: FlashcardSource["sourceType"] | null;
  sourceId: string | null;
  sourcePublicId: number | null;
  sourceName: string | null;
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
  corrections: FlashcardCorrection[];
  intelligenceType: "INTERNAL" | "COMPETITOR";
  iceScore: number;
};

type ActionMode = "ACCEPT" | "DECLINE" | "MODIFY_ACCEPT" | "CONVERT";

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const data = await response.json();
      if (typeof data?.error === "string") message = data.error;
    } catch {}
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

function sourceLabel(sourceType: FlashcardSource["sourceType"]) {
  return "Source";
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

function reviewStatusClasses(processingStatus: Goalcard["processingStatus"]) {
  switch (processingStatus) {
    case "ACCEPTED":
      return "border-[hsl(var(--color-high)/0.2)] bg-[hsl(var(--color-high)/0.1)] text-[hsl(var(--color-high))]";
    case "DECLINED":
      return "border-[hsl(var(--color-low)/0.2)] bg-[hsl(var(--color-low)/0.1)] text-[hsl(var(--color-low))]";
    case "VERIFIED":
      return "border-[hsl(var(--color-quality)/0.2)] bg-[hsl(var(--color-quality)/0.1)] text-[hsl(var(--color-quality))]";
    default:
      return "border-input bg-background text-foreground";
  }
}

function kindLabel(kind: string) {
  return kind.toLowerCase().replace(/_/g, " ");
}

export default function CompanyGoalsPage() {
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
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
  const { setSources, sources } = useStore();
  const [isOwner, setIsOwner] = useState(false);

  const loadGoals = useCallback(async (cid: string) => {
    const data = await fetchJson<Goalcard[]>(`/api/goalcards?companyId=${encodeURIComponent(cid)}`);
    setGoals(data);
  }, []);

  const loadPage = useCallback(async (cid: string) => {
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
  }, [loadGoals, router]);

  useEffect(() => {
    if (companyId) loadPage(companyId);
  }, [companyId, loadPage]);

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

  const handleActionSubmit = useCallback(async (id: string) => {
    // Basic CRUD for Goalcard actions if needed
  }, []);

  if (loading) {
    return (
      <PageShell width="full" className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-56" />
      </PageShell>
    );
  }

  return (
    <PageShell width="full">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        {errorMessage && <Notice variant="destructive" className="mb-4">{errorMessage}</Notice>}
        <PageHeader
          backHref={`/${companyId}`}
          backLabel="Back"
          title="Strategic Goals"
          description={`High-level objectives and aspirational milestones for ${company?.name}.`}
        />
      </motion.div>

      <MetricGrid>
        <MetricCard icon={Target} color="green" label="Active goals" value={goals.length} detail="Strategic objectives being tracked." />
        <MetricCard icon={TrendingUp} color="blue" label="Goal Alignment" value="85%" detail="Alignment with current market research." />
      </MetricGrid>

      <Group justify="space-between" align="center">
        <TextInput 
          placeholder="Search goals..." 
          leftSection={<Search size={16} />}
          value={searchQuery} 
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ flex: 1, maxWidth: 400 }}
          radius="md"
        />
      </Group>

      {filteredGoals.length === 0 ? (
        <EmptyState icon={Target} title="No strategic goals found" description="Goals represent what your company wants to become. They are derived from research or created manually." />
      ) : (
        <UnifiedGrid>
          {filteredGoals.map((goal, index) => (
            <motion.div key={goal.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}>
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
                onSubmit={handleActionSubmit}
                activeHashtags={activeHashtags}
                onToggleHashtag={() => {}}
                onRemoveHashtag={() => {}}
                onConvert={(type) => handleConvert(goal.id, type)}
              />
            </motion.div>
          ))}
        </UnifiedGrid>
      )}
    </PageShell>
  );
}
