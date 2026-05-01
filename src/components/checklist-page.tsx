/**
 * checklist checklist INTERFACE
 * v0.11.5-STABLE
 * 
 * Orchestrates the full lifecycle of Next Best Action (NBA) items.
 * Implements adaptive state filtering:
 *   - Active: DRAFT, CHECKED, VERIFIED
 *   - Archived: ACCEPTED, DECLINED, EXPIRED, ARCHIVED
 */
'use client';

import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import { Container, Grid, Title, Text, Button as MantineButton, Group, Loader, Stack, ActionIcon, rem } from "@mantine/core";
import { EmptyState, PageHeader, PageShell, PipelineAccentHeader, UnifiedGrid } from "@/components/ui/app-shell";
import { Button } from "@/components/ui/button";
import { matchesAllHashtags, parseHashtagFilterParam, stringifyHashtagFilterParam } from "@/lib/hashtags";
import { TaskReviewCard } from "@/components/task-review-card";
import { Archive, Brain } from "lucide-react";

/**
 * Representational interface for a tactical intelligence unit (Task).
 */
interface NBAItem {
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
  userAnnotation?: string;
  hashtags: string[];
}

type ActionMode = "ACCEPT" | "DECLINE" | "MODIFY_ACCEPT" | "DELIVER";

type ChecklistPageProps = {
  companyId: string;
  archived?: boolean;
};

export function ChecklistPage({ companyId, archived = false }: ChecklistPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { company, setCompany } = useStore();
  const [items, setItems] = useState<NBAItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMode, setActionMode] = useState<ActionMode | null>(null);
  const [actionItemId, setActionItemId] = useState<string | null>(null);
  const [annotation, setAnnotation] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [declineClass, setDeclineClass] = useState<string>("WRONG");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeHashtags, setActiveHashtags] = useState<string[]>([]);
  const [actingId, setActingId] = useState<string | null>(null);

  const loadchecklist = useCallback(async (cid: string) => {
    setLoading(true);
    const res = await fetch(`/api/nba?companyId=${cid}${archived ? "&archived=true" : ""}`);
    const data = await res.json();
    
    // API now handles the filtering standard (v0.11.5)
    setItems(data);
    setLoading(false);
  }, [archived]);

  const handleRefresh = useCallback(async () => {
    if (!company || archived) return;
    setLoading(true);
    await loadchecklist(company.id);
  }, [archived, company, loadchecklist]);

  useEffect(() => {
    if (!companyId) return;

    const fetchCompany = async (cid: string) => {
      try {
        const companies = await fetch(`/api/companies`).then((res) => res.json());
        if (!Array.isArray(companies)) {
          console.error("Invalid companies response:", companies);
          return;
        }
        const found = companies.find((entry: any) => entry.id === cid);
        if (!found) {
          router.push("/");
          return;
        }

        setCompany(found);
        await loadchecklist(found.id);
      } catch (error) {
        console.error(error);
      }
    };

    void fetchCompany(companyId);
  }, [companyId, loadchecklist, router, setCompany]);

  useEffect(() => {
    const syncFromLocation = () => {
      setActiveHashtags(parseHashtagFilterParam(new URLSearchParams(window.location.search).get("tags")));
    };
    syncFromLocation();
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, []);

  useEffect(() => {
    if (archived) return;

    const interval = setInterval(() => {
      if (company) void loadchecklist(company.id);
    }, 600000);
    return () => clearInterval(interval);
  }, [archived, company, loadchecklist]);

  const handleShare = useCallback(async (item: NBAItem) => {
    const text = `${item.title}\n\n${item.description}\n\nImpact: ${item.impact} | Confidence: ${item.confidenceScore}% | Ease: ${item.ease}\nICE Score: ${Math.round(item.iceScore)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error("Failed to copy", error);
    }
  }, []);

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

  const handleFeedback = useCallback(async (
    itemId: string,
    action: ActionMode,
    feedbackAnnotation?: string,
    modifiedTitle?: string,
    modifiedDescription?: string,
    submittedDeclineClass?: string,
  ) => {
    setActingId(itemId);
    
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

    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      // Archive or update the item in local state optimistically
      setItems(prev => prev.filter(i => i.id !== itemId));
    }

    resetActionForm();
    setActingId(null);
  }, [resetActionForm]);

  const handlePostpone = useCallback(async (itemId: string, date: Date | undefined) => {
    if (!date) return;
    setActingId(itemId);
    try {
      const res = await fetch(`/api/nba?id=${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledDate: date }),
      });
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== itemId));
      }
    } finally {
      setActingId(null);
    }
  }, []);

  const toggleHashtagFilter = useCallback((tag: string) => {
    const next = activeHashtags.includes(tag)
      ? activeHashtags.filter((item) => item !== tag)
      : [...activeHashtags, tag];
    const nextSearch = new URLSearchParams(window.location.search);
    if (next.length > 0) {
      nextSearch.set("tags", stringifyHashtagFilterParam(next));
    } else {
      nextSearch.delete("tags");
    }
    setActiveHashtags(next);
    router.replace(`${pathname}${nextSearch.toString() ? `?${nextSearch.toString()}` : ""}`, { scroll: false });
  }, [activeHashtags, pathname, router]);

  const removeTaskHashtag = useCallback(async (itemId: string, tag: string) => {
    if (!company) return;
    setActingId(itemId);
    try {
      const res = await fetch("/api/hashtags/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: "checklist",
          entityId: itemId,
          tag,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        setItems(prev => prev.map(i => i.id === itemId ? { ...i, hashtags: result.hashtags } : i));
      }
    } finally {
      setActingId(null);
    }
  }, [company]);

  useEffect(() => {
    if (archived) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (event.key === "r" || event.key === "R") {
        void handleRefresh();
      } else if (event.key === "a" || event.key === "A") {
        const actionable = items.find((item) => ["VERIFIED", "DRAFT", "CHECKED"].includes(item.processingStatus));
        if (actionable) {
          void handleFeedback(actionable.id, "ACCEPT");
        }
      } else if (event.key === "Escape") {
        resetActionForm();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [archived, handleFeedback, handleRefresh, items, resetActionForm]);

  if (loading) {
    return (
      <Container size="xl" py={100}>
        <Stack align="center" gap="md">
          <Loader color="blue" />
          <Text size="sm" c="dimmed">Decrypting tactical intelligence...</Text>
        </Stack>
      </Container>
    );
  }

  const filteredItems = items.filter((item) => matchesAllHashtags(item.hashtags, activeHashtags));

  return (
    <Container size="xl" py="xl">
      <Stack gap="xl">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <PipelineAccentHeader
            activeKey="checklist"
            title="checklist"
            icon="looks_4"
            toneClassName="text-violet-600"
            borderClassName="border-violet-500/20"
            backgroundClassName="bg-violet-500/10"
          />
          <Group justify="space-between" align="flex-end" mt="md">
            <div>
              <Title order={2} fw={900} lts={-1}>{archived ? "Archived checklist" : "checklist"}</Title>
              <Text size="sm" c="dimmed">{filteredItems.length} {archived ? "archived" : "pending"} units detected</Text>
            </div>
            <Group gap="xs">
              {archived ? (
                <MantineButton variant="subtle" color="gray" size="xs" component={Link} href={`/${companyId}/nba`}>
                  Open Active checklist
                </MantineButton>
              ) : (
                <>
                  <MantineButton 
                    onClick={handleRefresh} 
                    variant="subtle" 
                    color="gray" 
                    size="xs" 
                    loading={loading}
                    leftSection={!loading && <Loader size={14} />}
                  >
                    Refresh
                  </MantineButton>
                  <MantineButton variant="subtle" color="gray" size="xs" component={Link} href={`/${companyId}/nba_archived`} leftSection={<Archive size={14} />}>
                    Show Archived
                  </MantineButton>
                </>
              )}
            </Group>
          </Group>
        </motion.div>

        {filteredItems.length === 0 ? (
          <EmptyState
            icon={archived ? Archive : Brain}
            title={archived ? "No archived checklist items" : "No checklist items yet"}
            description={activeHashtags.length > 0 ? "Try clearing hashtag filters." : archived ? "Accepted, declined, and AI-filtered items will appear here." : "Add data to get AI-powered suggestions."}
          />
        ) : (
          <Grid gutter="lg">
            {filteredItems.map((item, index) => (
              <Grid.Col key={item.id} span={{ base: 12, md: 6, lg: 4 }}>
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                >
                  <TaskReviewCard
                    item={item}
                    isActionOpen={actionItemId === item.id && actionMode !== null}
                    actionMode={actionMode}
                    isBusy={actingId === item.id}
                    copied={copiedId === item.id}
                    annotation={annotation}
                    draftTitle={draftTitle}
                    draftDescription={draftDescription}
                    activeHashtags={activeHashtags}
                    onOpenAction={openActionForm}
                    onCloseAction={resetActionForm}
                    onAnnotationChange={setAnnotation}
                    onDraftTitleChange={setDraftTitle}
                    onDraftDescriptionChange={setDraftDescription}
                    declineClass={declineClass}
                    onDeclineClassChange={setDeclineClass}
                    onToggleHashtag={toggleHashtagFilter}
                    onRemoveHashtag={(itemId: string, tag: string) => void removeTaskHashtag(itemId, tag)}
                    onSubmit={handleFeedback}
                    onShare={handleShare}
                    onPostpone={handlePostpone}
                  />
                </motion.div>
              </Grid.Col>
            ))}
          </Grid>
        )}
      </Stack>
    </Container>
  );
}
