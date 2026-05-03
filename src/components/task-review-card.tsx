/**
 * checklist TASK CARD
 * v0.12.8-STABLE
 * 
 * A specialized UI component for reviewing and acting upon Next Best Action (NBA) items.
 * Prioritizes the ICE Score (Impact * Confidence * Ease) as the primary sorting and quality metric.
 */
import { useState } from "react";
import { Calendar as CalendarIcon, Check, CheckCheck, CheckCircle, Loader2, MessageSquare, PencilLine, Share2, X } from "lucide-react";

import { Card, Text, Badge, Button, Group, Stack, TextInput, Textarea, ActionIcon, Tooltip, rem, Select, Drawer, Loader, Divider, Paper, Alert } from "@mantine/core";
import { useClipboard } from "@mantine/hooks";
import { HashtagChipList } from "@/components/ui/hashtag-chip-list";
import { DatePicker } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";
import { getIceColorClasses } from "@/lib/ice-colors";

/**
 * Valid action modes for task feedback.
 */
type ActionMode = "ACCEPT" | "DECLINE" | "MODIFY_ACCEPT" | "DELIVER";

/**
 * Tactical intelligence unit representing a proposed action.
 */
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
  userAnnotation?: string;
  hashtags: string[];
  scheduledDate?: string | Date | null;
};

type TaskReviewCardProps = {
  item: NBAItem;
  isActionOpen: boolean;
  actionMode: ActionMode | null;
  isBusy: boolean;
  copied: boolean;
  annotation: string;
  draftTitle: string;
  draftDescription: string;
  onOpenAction: (item: NBAItem, mode: ActionMode) => void;
  onCloseAction: () => void;
  onAnnotationChange: (value: string) => void;
  onDraftTitleChange: (value: string) => void;
  onDraftDescriptionChange: (value: string) => void;
  declineClass?: string;
  onDeclineClassChange?: (value: string) => void;
  activeHashtags: string[];
  onToggleHashtag: (tag: string) => void;
  onRemoveHashtag: (itemId: string, tag: string) => void;
  onSubmit: (
    itemId: string,
    action: ActionMode,
    annotation?: string,
    modifiedTitle?: string,
    modifiedDescription?: string,
    declineClass?: string,
  ) => void;
  onShare: (item: NBAItem) => void;
  onPostpone?: (itemId: string, date: Date | undefined) => void;
};

export function TaskReviewCard({
  item,
  isActionOpen,
  actionMode,
  isBusy,
  copied,
  annotation,
  draftTitle,
  draftDescription,
  onOpenAction,
  onCloseAction,
  onAnnotationChange,
  onDraftTitleChange,
  onDraftDescriptionChange,
  declineClass,
  onDeclineClassChange,
  activeHashtags,
  onToggleHashtag,
  onRemoveHashtag,
  onSubmit,
  onShare,
  onPostpone,
}: TaskReviewCardProps) {
  const [traceOpen, setTraceOpen] = useState(false);
  const [traceData, setTraceData] = useState<any>(null);
  const [loadingTrace, setLoadingTrace] = useState(false);

  const fetchTrace = async () => {
    setTraceOpen(true);
    if (traceData) return;
    setLoadingTrace(true);
    try {
      const res = await fetch(`/api/nba/trace?id=${item.id}`);
      const data = await res.json();
      setTraceData(data);
    } catch (e) {
      console.error("Failed to fetch trace:", e);
    } finally {
      setLoadingTrace(false);
    }
  };

  const clipboard = useClipboard({ timeout: 2000 });
  
  const DECLINE_OPTIONS = [
    { value: "DUPLICATE", label: "Already exists (Duplicate)" },
    { value: "ALREADY_DONE", label: "Already completed" },
    { value: "IRRELEVANT", label: "Irrelevant to our strategy" },
    { value: "LOW_PRIORITY", label: "Valid, but low priority right now" },
    { value: "BAD_TIMING", label: "Good idea, but wrong timing" },
    { value: "TOO_VAGUE", label: "Too vague (needs more detail)" },
    { value: "MISSING_CONTEXT", label: "Missing context" },
    { value: "NOT_ACTIONABLE", label: "Not actionable by the team" },
    { value: "WRONG", label: "Factually incorrect" },
    { value: "IGNORANT_OUTPUT", label: "AI Hallucination" },
  ];

  const iceColor = item.iceScore >= 70 ? "green" : item.iceScore >= 40 ? "orange" : "gray";

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder className={cn(item.processingStatus === "DECLINED" && "opacity-60")} bg="var(--mantine-color-dark-6)">
      <Card.Section withBorder inheritPadding py="xs">
        <Group justify="space-between">
          <Group gap={7}>
            <Badge variant="outline" color="gray" size="xs" radius="sm">{item.processingStatus.toUpperCase()}</Badge>
            <Badge variant="filled" color="dark" size="xs" radius="sm">TASK</Badge>
          </Group>
          <Badge color={iceColor} variant="light" size="sm" radius="sm" fw={900}>ICE {Math.round(item.iceScore)}</Badge>
        </Group>
      </Card.Section>

      <Stack gap="md" mt="md">
        <Text fw={700} size="lg" lh={1.2} c="white">{item.title}</Text>
        
        <Text size="sm" c="dimmed" lh={1.6}>
          {item.description}
        </Text>

        <HashtagChipList
          hashtags={item.hashtags}
          activeTags={activeHashtags}
          onToggle={onToggleHashtag}
          onRemove={(tag) => onRemoveHashtag(item.id, tag)}
        />

        {item.userAnnotation && (
          <Group gap="xs" p="sm" bg="var(--mantine-color-dark-5)" style={{ borderRadius: rem(8) }}>
            <MessageSquare size={14} style={{ marginTop: rem(2), opacity: 0.7 }} />
            <Text size="xs" c="dimmed">{item.userAnnotation}</Text>
          </Group>
        )}

        <Group gap="xs" mt="sm">
          <Button size="xs" variant="filled" color="green" leftSection={<CheckCheck size={14} />} onClick={() => onOpenAction(item, "DELIVER")} disabled={isBusy}>
            Delivered
          </Button>
          <Button size="xs" variant="light" color="blue" leftSection={<Check size={14} />} onClick={() => onOpenAction(item, "ACCEPT")} disabled={isBusy}>
            Accept
          </Button>
          <Button size="xs" variant="outline" color="gray" leftSection={<X size={14} />} onClick={() => onOpenAction(item, "DECLINE")} disabled={isBusy}>
            Decline
          </Button>
          <Button size="xs" variant="outline" color="gray" leftSection={<PencilLine size={14} />} onClick={() => onOpenAction(item, "MODIFY_ACCEPT")} disabled={isBusy}>
            Edit
          </Button>
          
          <Button 
            ml="auto"
            variant="subtle" 
            size="xs" 
            color={copied ? "green" : "gray"}
            leftSection={copied ? <CheckCircle size={14} /> : <Share2 size={14} />}
            onClick={() => onShare(item)}
          >
            {copied ? "Copied" : "Share"}
          </Button>
        </Group>

        {isActionOpen && actionMode && (
          <Stack gap="sm" p="md" bg="var(--mantine-color-dark-8)" style={{ borderRadius: rem(12) }}>
            <Text size="sm" fw={600} c="white">
              {actionMode === "DECLINE" ? "Decline this task" : actionMode === "MODIFY_ACCEPT" ? "Modify and accept this task" : actionMode === "DELIVER" ? "Mark this task as delivered" : "Accept this task"}
            </Text>

            {actionMode === "MODIFY_ACCEPT" && (
              <>
                <TextInput label="Title" value={draftTitle} onChange={(e) => onDraftTitleChange(e.target.value)} size="xs" />
                <Textarea label="Description" value={draftDescription} onChange={(e) => onDraftDescriptionChange(e.target.value)} autosize minRows={2} size="xs" />
              </>
            )}

            {actionMode === "DECLINE" && onDeclineClassChange && (
              <Select
                label="Decline Reason"
                placeholder="Select a reason"
                data={DECLINE_OPTIONS}
                value={declineClass}
                onChange={(val) => onDeclineClassChange(val || "WRONG")}
                size="xs"
                allowDeselect={false}
              />
            )}

            <Textarea
              label={actionMode === "DECLINE" ? "Additional comments (optional)" : actionMode === "DELIVER" ? "Delivery notes (optional)" : "Comment (optional)"}
              value={annotation}
              onChange={(e) => onAnnotationChange(e.target.value)}
              placeholder={actionMode === "DELIVER" ? "What was the result? Help the AI learn..." : "Provide context for the AI..."}
              size="xs"
              autosize
              minRows={2}
            />

            <Group gap="xs">
              <Button
                size="xs"
                color={actionMode === "DECLINE" ? "red" : actionMode === "DELIVER" ? "green" : "blue"}
                onClick={() => onSubmit(item.id, actionMode, annotation, actionMode === "MODIFY_ACCEPT" ? draftTitle : undefined, actionMode === "MODIFY_ACCEPT" ? draftDescription : undefined, declineClass)}
                disabled={isBusy || (actionMode === "MODIFY_ACCEPT" && (!draftTitle.trim() || !draftDescription.trim()))}
                loading={isBusy}
              >
                Confirm
              </Button>
              <Button size="xs" variant="subtle" color="gray" onClick={onCloseAction} disabled={isBusy}>Cancel</Button>
            </Group>
          </Stack>
        )}
      </Stack>

      <Card.Section withBorder inheritPadding py="xs" mt="md">
        <Stack gap="xs">
          <Text size="xs" fw={800} tt="uppercase" lts={1} c="dimmed">Intelligence controls</Text>
          <Group gap={6}>
            <Tooltip label="Pin record as factual source">
              <Button size="compact-xs" variant="subtle" color="indigo" radius="xl">Pin Evidence</Button>
            </Tooltip>
            <Tooltip label="Request AI re-evaluation">
              <Button size="compact-xs" variant="subtle" color="cyan" radius="xl">Refresh</Button>
            </Tooltip>
            <Tooltip label="View intelligence lineage">
              <Button size="compact-xs" variant="subtle" color="violet" radius="xl" onClick={fetchTrace}>View Trace</Button>
            </Tooltip>
            
            {onPostpone && (
              <DatePicker 
                placeholder="POSTPONE"
                className="mantine-date-picker-inline"
                setDate={(date) => onPostpone(item.id, date)}
              />
            )}

            <Button size="compact-xs" variant="subtle" color="orange" radius="xl" ml="auto">Archive</Button>
          </Group>
        </Stack>
      </Card.Section>
      <Drawer
        opened={traceOpen}
        onClose={() => setTraceOpen(false)}
        title={<Text fw={900} size="xl">Intelligence Trace</Text>}
        position="right"
        size="md"
        padding="xl"
        styles={{
          header: { background: "var(--mantine-color-dark-7)" },
          content: { background: "var(--mantine-color-dark-8)" }
        }}
      >
        <Stack gap="xl">
          <div>
            <Text size="xs" fw={800} tt="uppercase" lts={1} c="dimmed" mb="xs">Tactical Unit</Text>
            <Text fw={700} size="lg" c="white">{item.title}</Text>
          </div>

          <Divider color="dark.4" />

          {loadingTrace ? (
            <Group justify="center" py="xl">
              <Loader size="sm" color="violet" />
              <Text size="sm" c="dimmed">Reconstructing lineage tree...</Text>
            </Group>
          ) : traceData?.trace?.length > 0 ? (
            traceData.trace.map((step: any, idx: number) => (
              <Paper key={step.flashcard.id} p="md" radius="md" bg="dark.6" withBorder>
                <Stack gap="md">
                  <div>
                    <Badge size="xs" color="violet" mb={4}>Evidence Point {idx + 1}</Badge>
                    <Text fw={700} size="sm" c="white">{step.flashcard.title}</Text>
                    <Text size="xs" c="dimmed" mt={4} lineClamp={3}>{step.flashcard.content}</Text>
                  </div>
                  
                  <Divider color="dark.5" variant="dashed" />

                  <div>
                    <Text size="xs" fw={800} tt="uppercase" lts={1} c="dimmed" mb="xs">Original Sources</Text>
                    <Stack gap="xs">
                      {step.evidence.map((ev: any) => (
                        <Group key={ev.id} gap="xs">
                          <Badge size="xs" variant="dot" color={ev.type === "FILE" ? "blue" : "indigo"}>
                            {ev.type}
                          </Badge>
                          <Text size="xs" c="white" truncate flex={1}>{ev.name}</Text>
                          <Text size="xs" c="dimmed" fs="italic">via {ev.provenance}</Text>
                        </Group>
                      ))}
                    </Stack>
                  </div>
                </Stack>
              </Paper>
            ))
          ) : (
             <Text size="sm" c="dimmed" ta="center" py="xl">No lineage data available for this item.</Text>
          )}

          <Alert variant="light" color="violet" mt="xl">
            <Text size="xs">
              Trace visualization shows the semantic path from raw data to this proposal.
              Sovereign Trinity maintains full provenance for every autonomous decision.
            </Text>
          </Alert>
        </Stack>
      </Drawer>
    </Card>
  );
}
