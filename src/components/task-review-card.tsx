/**
 * Shared task and goal card surface.
 *
 * This component owns the reusable card contract for task-like entities
 * across checklist, goals, review, and planning surfaces.
 */
import { useState } from "react";
import { IconCalendar as CalendarIcon, IconCheck as Check, IconChecks as CheckCheck, IconMessage2 as MessageSquare, IconPencil as PencilLine, IconX as X, IconHistory as History, IconPin as Pin, IconRefresh as RefreshCw, IconArchive as Archive } from "@tabler/icons-react";
import { 
  Text, 
  Badge, 
  Button, 
  Group, 
  Stack, 
  TextInput, 
  Textarea, 
  Tooltip, 
  rem, 
  Select, 
  Divider, 
  Box,
  Loader,
  ThemeIcon
} from "@mantine/core";
import { HashtagChipList } from "@/components/ui/hashtag-chip-list";
import { TraceViewer } from "@/components/trace-viewer";
import { CardShareAction } from "@/components/ui/card-share-action";
import { BodyText, MetaText } from "@/components/ui/typography";
import { getGoalCardFreshness, getTaskCardFreshness } from "@/lib/card-freshness";
import { getIceBadgeColor } from "@/lib/ice-colors";
import { getDisplayableHumanComment, stripTechnicalMetadata } from "@/lib/ui-utils";
import { logClientInteraction } from "@/lib/client-events";
import { 
  UnifiedCard, 
  UnifiedCardFreshnessBadge,
  UnifiedCardHeader, 
  UnifiedCardBody, 
  UnifiedCardText, 
  UnifiedCardActions, 
  UnifiedCardFooter,
  UnifiedCardSection
} from "@/components/ui/unified-card";

type ActionMode = "ACCEPT" | "DECLINE" | "MODIFY_ACCEPT" | "DELIVER" | "DELETE";

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
  createdAt?: string | null;
  updatedAt?: string | null;
  generatedAt?: string | null;
  refreshedAt?: string | null;
  lastActionAt?: string | null;
};

type TaskReviewCardProps = {
  item: NBAItem;
  onOpenDetail?: (item: NBAItem) => void;
  detailMode?: boolean;
  twoPhaseWorkflow?: boolean;
  isActionOpen: boolean;
  actionMode: ActionMode | null;
  isBusy: boolean;
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
  onPostpone?: (itemId: string, column: string) => void;
  hideTitle?: boolean;
};

export function TaskReviewCard({
  item,
  onOpenDetail,
  detailMode = false,
  twoPhaseWorkflow = true,
  isActionOpen,
  actionMode,
  isBusy,
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
  onPostpone,
  hideTitle = false,
}: TaskReviewCardProps) {
  const [traceOpen, setTraceOpen] = useState(false);
  const stopCardClick = (event: { stopPropagation: () => void }, callback?: () => void) => {
    event.stopPropagation();
    callback?.();
  };

  const logTaskInteraction = (interactionType: string, teachingWeight: number, payload?: Record<string, unknown>) => {
    void logClientInteraction({
      companyId: (item as any).companyId,
      surface: "task-card",
      interactionType,
      entityType: "TASK",
      entityId: item.id,
      payload,
      teachingWeight,
    });
  };
  
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

  const iceColor = getIceBadgeColor(item.iceScore);
  const isAccepted = twoPhaseWorkflow && item.processingStatus === "ACCEPTED";
  const displayableComment = getDisplayableHumanComment(item.userAnnotation);
  const freshness =
    item.refreshedAt || item.lastActionAt
      ? getGoalCardFreshness({
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          refreshedAt: item.refreshedAt,
          lastActionAt: item.lastActionAt,
        })
      : getTaskCardFreshness({
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          generatedAt: item.generatedAt,
        });

  return (
    <UnifiedCard
      tone="checklist"
      onClick={onOpenDetail ? () => onOpenDetail(item) : undefined}
      layoutStyle={{ opacity: item.processingStatus === "DECLINED" ? 0.6 : 1 }}
    >
      <UnifiedCardHeader
        clampTitle={!detailMode}
        supporting={
          <Group justify="space-between" wrap="nowrap" style={{ width: '100%' }}>
            <Group gap={7}>
              <Badge color="dark">{item.processingStatus}</Badge>
              <Badge color="checklist">TASK</Badge>
              <UnifiedCardFreshnessBadge freshness={freshness} />
            </Group>
            <Badge color={iceColor}>ICE {Math.round(item.iceScore)}</Badge>
          </Group>
        }
        title={hideTitle ? undefined : stripTechnicalMetadata(item.title)}
      />

      <UnifiedCardBody>
        <UnifiedCardText disablePreview={detailMode} markdown>
          {stripTechnicalMetadata(item.description)}
        </UnifiedCardText>
        
        <HashtagChipList
          hashtags={item.hashtags}
          activeTags={activeHashtags}
          onToggle={onToggleHashtag}
          onRemove={(tag) => onRemoveHashtag(item.id, tag)}
        />

        {detailMode && displayableComment && (
          <UnifiedCardSection tone="checklist">
            <Group gap="xs" wrap="nowrap" align="flex-start">
              <ThemeIcon variant="light" color="checklist" size="sm">
                <MessageSquare size={14} />
              </ThemeIcon>
              <MetaText>{displayableComment}</MetaText>
            </Group>
          </UnifiedCardSection>
        )}

        <UnifiedCardActions>
          {isAccepted ? (
            <>
              <Button
                size="xs"
                variant="filled"
                color="knowmore"
                leftSection={<CheckCheck size={14} />}
                onClick={(event) => stopCardClick(event, () => onOpenAction(item, "DELIVER"))}
                disabled={isBusy}
              >
                Deliver
              </Button>
              <Button
                size="xs"
                variant="outline"
                color="review"
                leftSection={<Archive size={14} />}
                onClick={(event) => stopCardClick(event, () => onOpenAction(item, "DELETE"))}
                disabled={isBusy}
              >
                Delete
              </Button>
            </>
          ) : (
            <>
              <Button 
                size="xs" 
                variant="light" 
                color="checklist" 
                leftSection={<Check size={14} />} 
                onClick={(event) => stopCardClick(event, () => onOpenAction(item, "ACCEPT"))}
                disabled={isBusy}
              >
                Accept
              </Button>
              <Button 
                size="xs" 
                variant="outline" 
                color="review" 
                leftSection={<X size={14} />} 
                onClick={(event) => stopCardClick(event, () => onOpenAction(item, "DECLINE"))}
                disabled={isBusy}
              >
                Decline
              </Button>
            </>
          )}
          
          <Group ml="auto">
            <CardShareAction cardId={item.id} />
          </Group>
        </UnifiedCardActions>

        {isActionOpen && actionMode && (
          <UnifiedCardSection>
            <Stack gap="sm">
              <MetaText>
                {actionMode === "DECLINE"
                  ? "Decline Task"
                  : actionMode === "MODIFY_ACCEPT"
                    ? "Modify & Accept"
                    : actionMode === "DELIVER"
                      ? "Mark Delivered"
                      : actionMode === "DELETE"
                        ? "Delete Accepted Task"
                        : "Accept Task"}
              </MetaText>

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
                  onClick={(event) => event.stopPropagation()}
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
                  color={actionMode === "DECLINE" || actionMode === "DELETE" ? "review" : actionMode === "DELIVER" ? "knowmore" : "ingress"}
                  onClick={(event) => stopCardClick(event, () => onSubmit(item.id, actionMode, annotation, actionMode === "MODIFY_ACCEPT" ? draftTitle : undefined, actionMode === "MODIFY_ACCEPT" ? draftDescription : undefined, declineClass))}
                  disabled={isBusy || (actionMode === "MODIFY_ACCEPT" && (!draftTitle.trim() || !draftDescription.trim()))}
                  loading={isBusy}
                >
                  Confirm
                </Button>
                <Button size="xs" variant="subtle" color="gray" onClick={(event) => stopCardClick(event, onCloseAction)} disabled={isBusy}>Cancel</Button>
              </Group>
            </Stack>
          </UnifiedCardSection>
        )}
      </UnifiedCardBody>

      <UnifiedCardFooter>
        <Stack gap="xs">
          <MetaText>Intelligence controls</MetaText>
          <Group gap={6}>
            <Tooltip label="Pin relevant evidence">
              <Button
                size="compact-xs"
                variant="subtle"
                color="gray"
                leftSection={<Pin size={12} />}
                onClick={(event) => stopCardClick(event, () => logTaskInteraction("TASK_PIN_REQUEST", 30))}
              >
                Pin
              </Button>
            </Tooltip>
            <Tooltip label="Request re-evaluation">
              <Button
                size="compact-xs"
                variant="subtle"
                color="gray"
                leftSection={<RefreshCw size={12} />}
                onClick={(event) => stopCardClick(event, () => logTaskInteraction("TASK_REFRESH_REQUEST", 30))}
              >
                Refresh
              </Button>
            </Tooltip>
            <Tooltip label="View synthesis trace">
              <Button
                size="compact-xs"
                variant="subtle"
                color="strategy"
                leftSection={<History size={12} />}
                onClick={(event) => stopCardClick(event, () => {
                  logTaskInteraction("TRACE_VIEW_OPEN", 30, {
                    versionFamilyId: (item as any).versionFamilyId || item.id,
                  });
                  setTraceOpen(true);
                })}
              >
                Trace
              </Button>
            </Tooltip>
            
            {onPostpone && (
              <Select
                placeholder="POSTPONE..."
                size="compact-xs"
                variant="subtle"
                color="review"
                data={[
                  { value: "IDEABANK", label: "Idea Bank" },
                  { value: "ROADMAP", label: "Roadmap" },
                  { value: "BACKLOG", label: "Backlog" },
                  { value: "TODO", label: "Next" },
                ]}
                onClick={(event) => event.stopPropagation()}
                onChange={(val) => {
                  if (!val) return;
                  logTaskInteraction("TASK_MOVE_COLUMN", 70, {
                    from: item.kanbanColumn,
                    to: val,
                  });
                  onPostpone(item.id, val);
                }}
              />
            )}

            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              leftSection={<Archive size={12} />}
              ml="auto"
              onClick={(event) => stopCardClick(event, () => logTaskInteraction("TASK_ARCHIVE_REQUEST", 35))}
            >
              Archive
            </Button>
          </Group>
        </Stack>
      </UnifiedCardFooter>

      {traceOpen && (
        <TraceViewer 
          versionFamilyId={(item as any).versionFamilyId || item.id} 
          onClose={() => {
            logTaskInteraction("TRACE_VIEW_CLOSE", 30, {
              versionFamilyId: (item as any).versionFamilyId || item.id,
            });
            setTraceOpen(false);
          }} 
        />
      )}
    </UnifiedCard>
  );
}
