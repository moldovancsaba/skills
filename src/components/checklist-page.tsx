'use client';
/**
 * Checklist page surface for taskcard review and action handling.
 *
 * This component owns the main checklist experience for active and archived
 * tactical items in the shared product card system.
 */
import { Text } from "@/components/ui/typography";

import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { 
  Group, Loader, Stack, Button, ActionIcon, Tooltip, rem, Box, Divider, Center } from "@mantine/core";
import { EmptyState, PageHeader, PageShell, UnifiedGrid, PipelineAccentHeader } from "@/components/ui/app-shell";
import { UnifiedCardModal } from "@/components/ui/unified-card-modal";
import { matchesAllHashtags, parseHashtagFilterParam, stringifyHashtagFilterParam } from "@/lib/hashtags";
import { TaskReviewCard } from "@/components/task-review-card";
import { IconArchive as Archive, IconSparkles as Sparkles, IconRefresh as RefreshCw, IconArrowLeft as ArrowLeft, IconListCheck as ListCheck, IconDownload as Download } from "@tabler/icons-react";
import { stripTechnicalMetadata } from "@/lib/ui-utils";
import type { ProjectionFreshness } from "@/lib/webapp-projection";
import { buildAcceptedTaskPatch, buildArchivedTaskPatch, buildDeliveredTaskPatch } from "@/lib/candidate-lifecycle";

/**
 * Representational interface for a tactical intelligence unit (Task).
 */
interface ChecklistItem {
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
  createdAt?: string | null;
  updatedAt?: string | null;
  generatedAt?: string | null;
}

type ActionMode = "ACCEPT" | "DECLINE" | "MODIFY_ACCEPT" | "DELIVER" | "DELETE";

type ChecklistPageProps = {
  companyId: string;
  archived?: boolean;
};

export function ChecklistPage({ companyId, archived = false }: ChecklistPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { company, setCompany } = useStore();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMode, setActionMode] = useState<ActionMode | null>(null);
  const [actionItemId, setActionItemId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [annotation, setAnnotation] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [declineClass, setDeclineClass] = useState<string>("WRONG");
  const [activeHashtags, setActiveHashtags] = useState<string[]>([]);
  const [actingId, setActingId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>("");
  const [planningSummary, setPlanningSummary] = useState<{ tacticalCount: number; checklistCount: number } | null>(null);
  const [projectionFreshness, setProjectionFreshness] = useState<ProjectionFreshness | null>(null);

  const checklistExportHref = `/api/checklist/export?companyId=${companyId}&scope=checklist`;

  const loadChecklist = useCallback(async (cid: string) => {
    setLoading(true);
    const res = await fetch(`/api/checklist?companyId=${cid}${archived ? "&archived=true" : ""}`);
    const data = await res.json();
    
    // The API owns the canonical archived vs active filtering contract.
    setItems(data);
    setLoading(false);
  }, [archived]);

  const handleRefresh = useCallback(async () => {
    if (!company || archived) return;
    setLoading(true);
    await loadChecklist(company.id);
  }, [archived, company, loadChecklist]);

  useEffect(() => {
    if (!companyId) return;

    const fetchCompany = async (cid: string) => {
      try {
        const res = await fetch(`/api/companies/${cid}/planning-summary`);
        if (!res.ok) {
          if (res.status === 404) {
            router.push("/");
            return;
          }
          throw new Error("Failed to load planning summary");
        }
        const data = await res.json();
        if (!data?.company?.id) {
          return;
        }

        setCompany(data.company);
        setCompanyName(data.company.name || "");
        setPlanningSummary(data.planningSummary ?? null);
        setProjectionFreshness(data.projection?.freshness ?? null);
        await loadChecklist(data.company.id);
      } catch (error) {
        console.error(error);
      }
    };

    void fetchCompany(companyId);
  }, [companyId, loadChecklist, router, setCompany]);

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
      if (company) void loadChecklist(company.id);
    }, 600000);
    return () => clearInterval(interval);
  }, [archived, company, loadChecklist]);

  const resetActionForm = useCallback(() => {
    setActionMode(null);
    setActionItemId(null);
    setAnnotation("");
    setDraftTitle("");
    setDraftDescription("");
    setDeclineClass("WRONG");
  }, []);

  const openActionForm = useCallback((item: ChecklistItem, mode: ActionMode) => {
    setSelectedItemId(item.id);
    setActionMode(mode);
    setActionItemId(item.id);
    setAnnotation(stripTechnicalMetadata(item.userAnnotation));
    setDraftTitle(item.title);
    setDraftDescription(item.description);
    setDeclineClass("WRONG");
  }, []);

  const closeDetailModal = useCallback(() => {
    setSelectedItemId(null);
    resetActionForm();
  }, [resetActionForm]);

  const handleFeedback = useCallback(async (
    itemId: string,
    action: ActionMode,
    feedbackAnnotation?: string,
    modifiedTitle?: string,
    modifiedDescription?: string,
    submittedDeclineClass?: string,
  ) => {
    if (!company) return;
    setActingId(itemId);
    try {
      if (action === "DELETE") {
        const res = await fetch(`/api/checklist?id=${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildArchivedTaskPatch(feedbackAnnotation?.trim() || "Accepted but not delivered")),
        });

        if (res.ok) {
          setItems((prev) => prev.filter((i) => i.id !== itemId));
          if (selectedItemId === itemId) {
            closeDetailModal();
          } else {
            resetActionForm();
          }
        }
        return;
      }

      const payload: any = {
        companyId: company.id,
        entityId: itemId,
        entityType: "TASK",
        action,
        annotation: feedbackAnnotation,
        modifiedTitle,
        modifiedDescription,
        declineClass: action === "DECLINE" ? submittedDeclineClass : undefined,
      };

      const feedbackRes = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!feedbackRes.ok) {
        return;
      }

      if (action === "ACCEPT") {
        const patchRes = await fetch(`/api/checklist?id=${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildAcceptedTaskPatch(feedbackAnnotation?.trim() || "Accepted for execution")),
        });

        if (patchRes.ok) {
          setItems((prev) =>
            prev.map((i) =>
              i.id === itemId
                ? { ...i, processingStatus: "ACCEPTED", userAnnotation: stripTechnicalMetadata(feedbackAnnotation) || i.userAnnotation }
                : i,
            ),
          );
        }
      } else if (action === "DELIVER") {
        const patchRes = await fetch(`/api/checklist?id=${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildDeliveredTaskPatch(feedbackAnnotation?.trim() || "Delivered in reality")),
        });

        if (patchRes.ok) {
          setItems((prev) => prev.filter((i) => i.id !== itemId));
        }
      } else if (action === "DECLINE") {
        setItems((prev) => prev.filter((i) => i.id !== itemId));
      }

      resetActionForm();
    } finally {
      setActingId(null);
    }
  }, [closeDetailModal, company, resetActionForm, selectedItemId]);

  const handlePostpone = useCallback(async (itemId: string, column: string) => {
    setActingId(itemId);
    try {
      const res = await fetch(`/api/checklist?id=${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kanbanColumn: column }),
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
      <PageShell width="full">
        <Center h="60vh">
          <Stack align="center" gap="md">
            <Loader color="checklist" size="xl" variant="bars" />
            <Text size="sm"    c="dimmed">Decrypting tactical intelligence...</Text>
          </Stack>
        </Center>
      </PageShell>
    );
  }

  const filteredItems = items.filter((item) => matchesAllHashtags(item.hashtags, activeHashtags));
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;
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
      <Stack gap="xl">
        <PipelineAccentHeader 
          activeKey="checklist" 
          title="Checklist" 
          icon={ListCheck} 
        />
        <Box>
          <Group justify="space-between" align="center">
            <Stack gap={0}>
              <Group gap={8}>
                {archived ? <Archive size={12} color="var(--module-checklist-color)" /> : <Sparkles size={12} color="var(--module-checklist-color)" />}
                <Text size="xs" c="checklist">
                  {archived ? "Archive" : "Active Intelligence"}
                </Text>
              </Group>
              <Group gap="xs" mt={6}>
                {companyName ? (
                  <Text size="xs" c="dimmed">
                    {companyName}
                  </Text>
                ) : null}
                {planningSummary ? (
                  <>
                    <Text size="xs" c="dimmed">
                      Planning {Math.max(Number(planningSummary.tacticalCount || 0), Number(planningSummary.checklistCount || 0))}
                    </Text>
                    <Text size="xs" c="dimmed">
                      Checklist {Number(planningSummary.checklistCount || 0)}
                    </Text>
                  </>
                ) : null}
                <Text size="xs" c={projectionFreshness?.status === "STALE" ? "review" : projectionFreshness?.status === "AGING" ? "strategy" : "dimmed"}>
                  {projectionFreshnessLabel}
                </Text>
              </Group>
            </Stack>

            <Group gap="sm">
              {archived ? (
                <Button 
                  variant="light" 
                  color="gray" 
                  onClick={() => router.push(`/${companyId}/checklist`)}
                  leftSection={<ArrowLeft size={14} />}
                >
                  Open Active Checklist
                </Button>
              ) : (
                <Group gap="xs">
                  <Button 
                    onClick={handleRefresh} 
                    variant="light" 
                    color="gray" 
                    loading={loading}
                    leftSection={<RefreshCw size={14} />}
                  >
                    Refresh
                  </Button>
                  <Button
                    component="a"
                    href={checklistExportHref}
                    variant="light"
                    color="gray"
                    leftSection={<Download size={14} />}
                  >
                    Export CSV
                  </Button>
                  <Button 
                    variant="light" 
                    color="gray" 
                    onClick={() => router.push(`/${companyId}/checklist_archived`)}
                    leftSection={<Archive size={14} />}
                  >
                    Show Archived
                  </Button>
                </Group>
              )}
            </Group>
          </Group>
        </Box>

        {filteredItems.length === 0 ? (
          <EmptyState
            icon={archived ? Archive : Sparkles}
            title={archived ? "No archived checklist items" : "No checklist items yet"}
            description={activeHashtags.length > 0 ? "Try clearing hashtag filters." : archived ? "Accepted, declined, and AI-filtered items will appear here." : "Add data to get AI-powered suggestions."}
            primaryAction={
              activeHashtags.length > 0 ? (
                <Button variant="light" onClick={() => {
                  const nextSearch = new URLSearchParams(window.location.search);
                  nextSearch.delete("tags");
                  setActiveHashtags([]);
                  router.replace(`${pathname}`, { scroll: false });
                }}>
                  Clear Filters
                </Button>
              ) : !archived ? (
                <Button variant="filled" color="ingress" onClick={() => router.push(`/${companyId}/data`)}>
                  Open Data Ingress
                </Button>
              ) : undefined
            }
          />
        ) : (
          <UnifiedGrid>
            {filteredItems.map((item, index) => (
              <Box key={item.id}>
                <TaskReviewCard
                  item={item}
                  onOpenDetail={(nextItem) => setSelectedItemId(nextItem.id)}
                  isActionOpen={actionItemId === item.id && actionMode !== null}
                  actionMode={actionMode}
                  isBusy={actingId === item.id}
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
                  onPostpone={handlePostpone}
                />
              </Box>
            ))}
          </UnifiedGrid>
        )}
      </Stack>

      <UnifiedCardModal
        opened={Boolean(selectedItem)}
        onClose={closeDetailModal}
        tone="checklist"
        title={selectedItem?.title ?? "Checklist Item"}
        subtitle={selectedItem ? `#${selectedItem.publicId ?? "—"} · Tactical execution unit` : undefined}
        badge="Checklist"
      >
        {selectedItem ? (
          <TaskReviewCard
            item={selectedItem}
            detailMode
            hideTitle
            isActionOpen={actionItemId === selectedItem.id && actionMode !== null}
            actionMode={actionMode}
            isBusy={actingId === selectedItem.id}
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
            onPostpone={handlePostpone}
          />
        ) : null}
      </UnifiedCardModal>
    </PageShell>
  );
}
