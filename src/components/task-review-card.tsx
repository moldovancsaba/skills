/**
 * checklist TASK CARD
 * v0.15.0
 * 
 * Refactored to pure Mantine-ONLY design system.
 * Unified with PageShell and UnifiedCard architecture.
 */
import { useState } from "react";
import { IconCalendar as CalendarIcon, IconCheck as Check, IconChecks as CheckCheck, IconCircleCheck as CheckCircle, IconMessage2 as MessageSquare, IconPencil as PencilLine, IconShare as Share2, IconX as X, IconHistory as History, IconPin as Pin, IconRefresh as RefreshCw, IconArchive as Archive } from "@tabler/icons-react";
import { 
  Card, 
  Text, 
  Badge, 
  Button, 
  Group, 
  Stack, 
  TextInput, 
  Textarea, 
  ActionIcon, 
  Tooltip, 
  rem, 
  Select, 
  Loader, 
  Divider, 
  Box,
  ThemeIcon
} from "@mantine/core";
import { useClipboard } from "@mantine/hooks";
import { HashtagChipList } from "@/components/ui/hashtag-chip-list";
import { TraceViewer } from "@/components/trace-viewer";
import { stripTechnicalMetadata } from "@/lib/ui-utils";
import { 
  UnifiedCard, 
  UnifiedCardHeader, 
  UnifiedCardBody, 
  UnifiedCardText, 
  UnifiedCardActions, 
  UnifiedCardFooter,
  UnifiedCardSection
} from "@/components/ui/unified-card";

type ActionMode = "ACCEPT" | "DECLINE" | "MODIFY_ACCEPT" | "DELIVER";

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
  onPostpone?: (itemId: string, column: string) => void;
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
    <UnifiedCard style={{ opacity: item.processingStatus === "DECLINED" ? 0.6 : 1 }}>
      <UnifiedCardHeader
        supporting={
          <Group justify="space-between" wrap="nowrap" style={{ width: '100%' }}>
            <Group gap={7}>
              <Badge color="gray">{item.processingStatus}</Badge>
              <Badge color="execution">TASK</Badge>
            </Group>
            <Badge color={iceColor}>ICE {Math.round(item.iceScore)}</Badge>
          </Group>
        }
        title={stripTechnicalMetadata(item.title)}
      />

      <UnifiedCardBody>
        <UnifiedCardText>
          {stripTechnicalMetadata(item.description)}
        </UnifiedCardText>
        
        <HashtagChipList
          hashtags={item.hashtags}
          activeTags={activeHashtags}
          onToggle={onToggleHashtag}
          onRemove={(tag) => onRemoveHashtag(item.id, tag)}
        />

        {item.userAnnotation && (
          <Box 
            p="sm" 
            style={{ 
              borderRadius: rem(8),
              backgroundColor: 'light-dark(rgba(0, 0, 0, 0.03), rgba(0, 0, 0, 0.2))',
              borderLeft: "4px solid var(--mantine-color-blue-6)"
            }}
          >
            <Group gap="xs" wrap="nowrap" align="flex-start">
              <MessageSquare size={14} style={{ marginTop: rem(2), opacity: 0.7 }} />
              <Text size="xs" c="dimmed">{item.userAnnotation}</Text>
            </Group>
          </Box>
        )}

        <UnifiedCardActions>
          <Button 
            size="xs" 
            variant="filled" 
            color="green" 
            leftSection={<CheckCheck size={14} />} 
            onClick={() => onOpenAction(item, "DELIVER")} 
            disabled={isBusy}
          >
            Delivered
          </Button>
          <Button 
            size="xs" 
            variant="light" 
            color="blue" 
            leftSection={<Check size={14} />} 
            onClick={() => onOpenAction(item, "ACCEPT")} 
            disabled={isBusy}
          >
            Accept
          </Button>
          <Button 
            size="xs" 
            variant="outline" 
            color="red" 
            leftSection={<X size={14} />} 
            onClick={() => onOpenAction(item, "DECLINE")} 
            disabled={isBusy}
          >
            Decline
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
        </UnifiedCardActions>

        {isActionOpen && actionMode && (
          <UnifiedCardSection>
            <Stack gap="sm">
              <Text size="xs" c="dimmed">
                {actionMode === "DECLINE" ? "Decline Task" : actionMode === "MODIFY_ACCEPT" ? "Modify & Accept" : actionMode === "DELIVER" ? "Mark Delivered" : "Accept Task"}
              </Text>

              {actionMode === "MODIFY_ACCEPT" && (
                <Stack gap="sm">
                  <TextInput label="Title" value={draftTitle} onChange={(e) => onDraftTitleChange(e.target.value)} size="xs" />
                  <Textarea label="Description" value={draftDescription} onChange={(e) => onDraftDescriptionChange(e.target.value)} autosize minRows={2} size="xs" />
                </Stack>
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
                label="Strategic Feedback"
                value={annotation}
                onChange={(e) => onAnnotationChange(e.target.value)}
                placeholder="Provide context for system calibration..."
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
          </UnifiedCardSection>
        )}
      </UnifiedCardBody>

      <UnifiedCardFooter>
        <Stack gap="xs">
          <Text size="xs" c="dimmed">Intelligence controls</Text>
          <Group gap={6}>
            <Tooltip label="Pin relevant evidence">
              <Button size="compact-xs" variant="subtle" color="gray" leftSection={<Pin size={12} />}>Pin</Button>
            </Tooltip>
            <Tooltip label="Request re-evaluation">
              <Button size="compact-xs" variant="subtle" color="gray" leftSection={<RefreshCw size={12} />}>Refresh</Button>
            </Tooltip>
            <Tooltip label="View synthesis trace">
              <Button size="compact-xs" variant="subtle" color="violet" leftSection={<History size={12} />} onClick={() => setTraceOpen(true)}>Trace</Button>
            </Tooltip>
            
            {onPostpone && (
              <Select
                placeholder="POSTPONE..."
                size="compact-xs"
                variant="subtle"
                color="orange"
                data={[
                  { value: "IDEABANK", label: "Idea Bank" },
                  { value: "ROADMAP", label: "Roadmap" },
                  { value: "BACKLOG", label: "Backlog" },
                  { value: "TODO", label: "Next" },
                ]}
                onChange={(val) => val && onPostpone(item.id, val)}
              />
            )}

            <Button size="compact-xs" variant="subtle" color="gray" leftSection={<Archive size={12} />} ml="auto">Archive</Button>
          </Group>
        </Stack>
      </UnifiedCardFooter>

      {traceOpen && (
        <TraceViewer 
          versionFamilyId={(item as any).versionFamilyId || item.id} 
          onClose={() => setTraceOpen(false)} 
        />
      )}
    </UnifiedCard>
  );
}
