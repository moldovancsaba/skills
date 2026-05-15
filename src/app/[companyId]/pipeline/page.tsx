import { Text } from "@/components/ui/typography";
'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DragDropContext, Draggable, Droppable, type DropResult, } from "@hello-pangea/dnd";
import {
  Badge, Box, Button, Center, Divider, Group, Loader, SimpleGrid, Stack, ThemeIcon, rem } from "@mantine/core";
import {
  IconAlertTriangle as AlertTriangle,
  IconArrowBackUp as ResetIcon,
  IconBolt as Bolt,
  IconBrain as Brain,
  IconClock as Clock,
  IconHelmet as HardHat,
  IconHistory as History,
  IconLayersIntersect as Layers,
  IconListCheck as ListCheck,
  IconRefresh as RefreshIcon,
} from "@tabler/icons-react";
import { useParams } from "next/navigation";
import { Notice, PageHeader, PageShell } from "@/components/ui/app-shell";
import { UnifiedCard, UnifiedCardBody, UnifiedCardHeader } from "@/components/ui/unified-card";
import type { PipelineJobRecord, PipelineQueueColumn } from "@/lib/pipeline-queue";
import { getSemanticSurfaceStyle } from "@/lib/semantic-theme";

const COLUMNS: Array<{
  key: PipelineQueueColumn;
  label: string;
  description: string;
  tone: "checklist" | "tactical" | "strategy" | "review";
}> = [
  { key: "NOW", label: "Now", description: "Immediate worker focus", tone: "checklist" },
  { key: "SOON", label: "Soon", description: "Next batch of repetitive work", tone: "tactical" },
  { key: "LATER", label: "Later", description: "AI backlog and periodic work", tone: "strategy" },
  { key: "PARKED", label: "Parked", description: "Temporarily out of execution", tone: "review" },
];

function getJobIcon(jobType: PipelineJobRecord["jobType"]) {
  switch (jobType) {
    case "FEEDBACK_RECONCILIATION":
      return History;
    case "CARD_RESCORING":
      return RefreshIcon;
    case "FRONTIER_RECOMPUTE":
      return ListCheck;
    case "ENSURE_FLASHCARD_MINIMUM":
    case "RESEARCH_BACKFILL":
      return Brain;
    case "ENSURE_IDEABANK_MINIMUM":
    case "ENSURE_ROADMAP_MINIMUM":
    case "ENSURE_BACKLOG_MINIMUM":
    case "ENSURE_TODO_MINIMUM":
    case "ENSURE_CHECKLIST_MINIMUM":
      return ListCheck;
    case "REFRESH_FLASHCARDS":
    case "REFRESH_TASKS":
    case "REFRESH_DATACARDS":
    case "REFRESH_GOALS":
      return HardHat;
    case "FULL_MAINTENANCE":
      return HardHat;
    case "SCORE_ALERT_REPAIR":
      return AlertTriangle;
    case "COMPANY_SYNTHESIS":
      return Brain;
    default:
      return Layers;
  }
}

function getJobLabel(job: PipelineJobRecord) {
  if (job.jobType === "WORKFLOW_BLUEPRINT") {
    const blueprintName = (job.reason || "").split(" is active as a bounded workflow blueprint")[0]?.trim();
    if (blueprintName) {
      return blueprintName;
    }
  }

  switch (job.jobType) {
    case "FEEDBACK_RECONCILIATION":
      return "Feedback Reconciliation";
    case "CARD_RESCORING":
      return "Card Rescoring";
    case "FRONTIER_RECOMPUTE":
      return "Frontier Recompute";
    case "ENSURE_FLASHCARD_MINIMUM":
      return "Ensure Flashcard Minimum";
    case "RESEARCH_BACKFILL":
      return "Research Backfill";
    case "ENSURE_IDEABANK_MINIMUM":
      return "Ensure Ideabank Minimum";
    case "ENSURE_ROADMAP_MINIMUM":
      return "Ensure Roadmap Minimum";
    case "ENSURE_BACKLOG_MINIMUM":
      return "Ensure Backlog Minimum";
    case "ENSURE_TODO_MINIMUM":
      return "Ensure Next Minimum";
    case "ENSURE_CHECKLIST_MINIMUM":
      return "Ensure Checklist Minimum";
    case "REFRESH_FLASHCARDS":
      return "Refresh Flashcards";
    case "REFRESH_TASKS":
      return "Refresh Tasks";
    case "REFRESH_DATACARDS":
      return "Refresh Datacards";
    case "REFRESH_GOALS":
      return "Refresh Goals";
    case "FULL_MAINTENANCE":
      return "Full Maintenance";
    case "SCORE_ALERT_REPAIR":
      return "Score Alert Repair";
    case "COMPANY_SYNTHESIS":
      return "Company Synthesis";
    default:
      return job.jobType;
  }
}

function formatDate(value: PipelineJobRecord["lastCompletedAt"] | PipelineJobRecord["lastTriedAt"]) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}

function reorderPipelineJobs(
  jobs: PipelineJobRecord[],
  draggableId: string,
  source: { droppableId: string; index: number },
  destination: { droppableId: string; index: number },
) {
  const sourceColumn = source.droppableId as PipelineQueueColumn;
  const destinationColumn = destination.droppableId as PipelineQueueColumn;
  const sourceItems = jobs.filter((job) => job.queueColumn === sourceColumn);
  const destinationItems = sourceColumn === destinationColumn
    ? sourceItems
    : jobs.filter((job) => job.queueColumn === destinationColumn);
  const movingItem = sourceItems[source.index];
  if (!movingItem || movingItem.id !== draggableId) {
    return null;
  }

  const nextSource = [...sourceItems];
  nextSource.splice(source.index, 1);

  const nextDestination = sourceColumn === destinationColumn ? nextSource : [...destinationItems];
  nextDestination.splice(destination.index, 0, {
    ...movingItem,
    queueColumn: destinationColumn,
    controlMode: "HUMAN_GUIDED",
  });

  const manualize = (items: PipelineJobRecord[]) =>
    items.map((item, index) => ({
      ...item,
      queueColumn: destinationColumn,
      controlMode: "HUMAN_GUIDED" as const,
      manualSortOrder: index - items.length,
    }));

  const sourceManualized = sourceColumn === destinationColumn
    ? []
    : nextSource.map((item, index) => ({
        ...item,
        queueColumn: sourceColumn,
        controlMode: "HUMAN_GUIDED" as const,
        manualSortOrder: index - nextSource.length,
      }));
  const destinationManualized = nextDestination.map((item, index) => ({
    ...item,
    queueColumn: destinationColumn,
    controlMode: "HUMAN_GUIDED" as const,
    manualSortOrder: index - nextDestination.length,
  }));

  const patched = new Map<string, PipelineJobRecord>();
  for (const item of sourceManualized) patched.set(item.id, item);
  for (const item of destinationManualized) patched.set(item.id, item);

  return {
    nextJobs: jobs.map((job) => patched.get(job.id) ?? job),
    sourceColumn,
    destinationColumn,
    sourceColumnOrderIds: sourceColumn === destinationColumn ? undefined : sourceManualized.map((job) => job.id),
    destinationColumnOrderIds: destinationManualized.map((job) => job.id),
  };
}

export default function PipelineQueuePage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const [jobs, setJobs] = useState<PipelineJobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isResetting, setIsResetting] = useState(false);

  const loadJobs = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/pipeline-jobs?companyId=${companyId}`);
      if (!response.ok) throw new Error("Failed to load pipeline queue");
      setJobs(await response.json());
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadJobs();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadJobs]);

  const handleResetAiOnly = useCallback(async () => {
    setIsResetting(true);
    try {
      const response = await fetch("/api/pipeline-jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "RESET_AI_ONLY",
          companyId,
        }),
      });
      if (!response.ok) throw new Error("Failed to reset queue");
      setJobs(await response.json());
    } finally {
      setIsResetting(false);
    }
  }, [companyId]);

  const handleDragEnd = useCallback(async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;
    const reordered = reorderPipelineJobs(jobs, draggableId, source, destination);
    if (!reordered) return;

    setJobs(reordered.nextJobs);
    const response = await fetch("/api/pipeline-jobs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "REORDER",
        companyId,
        jobId: draggableId,
        sourceColumn: reordered.sourceColumn,
        destinationColumn: reordered.destinationColumn,
        destinationColumnOrderIds: reordered.destinationColumnOrderIds,
        sourceColumnOrderIds: reordered.sourceColumnOrderIds,
      }),
    });
    if (!response.ok) {
      await loadJobs();
      return;
    }
    setJobs(await response.json());
  }, [companyId, jobs, loadJobs]);

  const humanGuidedCount = useMemo(
    () => jobs.filter((job) => job.controlMode === "HUMAN_GUIDED").length,
    [jobs],
  );
  const failedCount = useMemo(
    () => jobs.filter((job) => job.status === "FAILED").length,
    [jobs],
  );

  if (loading) {
    return (
      <PageShell width="full">
        <Center mih="60vh">
          <Stack align="center" gap="xl">
            <Loader color="review" />
            <Text c="dimmed">Synchronizing pipeline queue…</Text>
          </Stack>
        </Center>
      </PageShell>
    );
  }

  return (
    <PageShell width="full">
      <PageHeader
        title="AI Queue"
        description="Shared local AI queue for repetitive jobs. Human moves win until you reset the queue back to AI-only scheduling."
        actions={
          <Group gap="sm">
            <Badge color={humanGuidedCount > 0 ? "review" : "knowmore"} variant="light" size="lg">
              {humanGuidedCount > 0 ? `${humanGuidedCount} Human-Guided` : "AI Only"}
            </Badge>
            <Button
              color="review"
              variant="light"
              leftSection={<ResetIcon size={16} />}
              loading={isResetting}
              onClick={() => void handleResetAiOnly()}
            >
              Reset to AI Only
            </Button>
          </Group>
        }
      />

      <Notice title="Queue Contract" icon={Bolt}>
        The local worker consumes this persisted queue directly. Manual drag-and-drop moves switch jobs into human-guided mode. Reset removes those overrides and returns scheduling to autonomous AI control.
      </Notice>

      {failedCount > 0 ? (
        <Notice title="Failed Jobs" icon={AlertTriangle} variant="destructive">
          {failedCount} job(s) are currently marked failed. They remain visible in the queue until AI-only reset or a new successful run clears the error state.
        </Notice>
      ) : null}

      <DragDropContext onDragEnd={(result) => void handleDragEnd(result)}>
        <SimpleGrid cols={{ base: 1, lg: 4 }} spacing="lg">
          {COLUMNS.map((column) => {
            const columnJobs = jobs.filter((job) => job.queueColumn === column.key);
            return (
              <Droppable key={column.key} droppableId={column.key}>
                {(provided, snapshot) => (
                  <Box
                    p="md"
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    style={{
                      ...getSemanticSurfaceStyle(column.tone, { elevated: false }),
                      minHeight: rem(520),
                      borderStyle: snapshot.isDraggingOver ? "dashed" : "solid",
                    }}
                  >
                    <Stack gap="md">
                      <Group justify="space-between">
                        <Box>
                          <Text size="lg">{column.label}</Text>
                          <Text size="xs" c="dimmed">{column.description}</Text>
                        </Box>
                        <Badge color={column.tone}>{columnJobs.length}</Badge>
                      </Group>

                      <Divider variant="dashed" />

                      <Stack gap="md">
                        {columnJobs.map((job, index) => {
                          const Icon = getJobIcon(job.jobType);
                          return (
                            <Draggable key={job.id} draggableId={job.id} index={index}>
                              {(dragProvided, dragSnapshot) => (
                                <Box
                                  ref={dragProvided.innerRef}
                                  {...dragProvided.draggableProps}
                                  {...dragProvided.dragHandleProps}
                                  style={{
                                    transform: dragSnapshot.isDragging ? `${dragProvided.draggableProps.style?.transform ?? ""} rotate(1deg)` : dragProvided.draggableProps.style?.transform,
                                    ...dragProvided.draggableProps.style,
                                  }}
                                >
                                  <UnifiedCard tone={column.tone}>
                                    <UnifiedCardHeader
                                      clampTitle={false}
                                      supporting={
                                        <Group justify="space-between" wrap="nowrap" style={{ width: "100%" }}>
                                          <Group gap="xs">
                                            <ThemeIcon color={column.tone}>
                                              <Icon size={15} />
                                            </ThemeIcon>
                                            <Badge size="xs" color={job.controlMode === "HUMAN_GUIDED" ? "tactical" : "dark"}>
                                              {job.controlMode === "HUMAN_GUIDED" ? "Human-guided" : "AI-only"}
                                            </Badge>
                                          </Group>
                                          <Badge color={job.status === "FAILED" ? "review" : column.tone}>
                                            {job.status}
                                          </Badge>
                                        </Group>
                                      }
                                      title={getJobLabel(job)}
                                      description={`Priority ${Math.round(job.priorityScore)}`}
                                    />
                                    <UnifiedCardBody>
                                      <Text size="sm" c="dimmed">
                                        {job.reason || "No queue rationale provided."}
                                      </Text>
                                      <Group gap="xs" wrap="wrap">
                                        <Badge size="xs" variant="outline" color="gray">
                                          {job.sourceSignal || "unspecified-signal"}
                                        </Badge>
                                        {job.lastError ? (
                                          <Badge size="xs" color="review">Error</Badge>
                                        ) : null}
                                      </Group>
                                      <Divider variant="dashed" />
                                      <Group gap="xs" justify="space-between">
                                        <Group gap="xs">
                                          <Clock size={14} opacity={0.7} />
                                          <Text size="xs" c="dimmed">
                                            Last run: {formatDate(job.lastCompletedAt)}
                                          </Text>
                                        </Group>
                                        <Text size="xs" c="dimmed">
                                          Attempts: {job.attemptCount}
                                        </Text>
                                      </Group>
                                    </UnifiedCardBody>
                                  </UnifiedCard>
                                </Box>
                              )}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}
                      </Stack>
                    </Stack>
                  </Box>
                )}
              </Droppable>
            );
          })}
        </SimpleGrid>
      </DragDropContext>
    </PageShell>
  );
}
