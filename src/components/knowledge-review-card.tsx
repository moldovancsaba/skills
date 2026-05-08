import { IconCheck as Check, IconMessage2 as MessageSquare, IconPencil as PencilLine, IconX as X, IconPin as Pin, IconRefresh as RefreshCw, IconSparkles as Sparkles, IconArchive as Archive, IconTarget as Target, IconLayoutDashboard as LayoutDashboard } from "@tabler/icons-react";
import { Badge, Button, Group, Stack, Text, Divider, Box, TextInput, Textarea, Tooltip, rem, Loader } from "@mantine/core";
import { getIceBadgeColor } from "@/lib/ice-colors";
import { getKnowledgeCardFreshness } from "@/lib/card-freshness";
import { stripTechnicalMetadata } from "@/lib/ui-utils";
import {
  UnifiedCard,
  UnifiedCardActions,
  UnifiedCardBody,
  UnifiedCardFreshnessBadge,
  UnifiedCardFooter,
  UnifiedCardHeader,
  UnifiedCardSection,
  UnifiedCardText,
} from "@/components/ui/unified-card";

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

type Flashcard = {
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
  createdAt: string;
  updatedAt: string;
  sources: FlashcardSource[];
  actions: FlashcardAction[];
  corrections: FlashcardCorrection[];
  refreshedAt: string;
  lastActionAt: string | null;
  ischecklistResearch?: boolean;
  intelligenceType: "INTERNAL" | "COMPETITOR";
  iceScore: number;
};

type ActionMode = "ACCEPT" | "DECLINE" | "MODIFY_ACCEPT" | "CONVERT";

type IntelligenceType = "KNOWLEDGE" | "GOAL" | "TASK";

type Props = {
  flashcard: Flashcard;
  onOpenDetail?: (flashcard: Flashcard) => void;
  detailMode?: boolean;
  isActionOpen: boolean;
  actionMode: ActionMode | null;
  isBusy: boolean;
  isGenerating: boolean;
  actionComment: string;
  editedTitle: string;
  editedBody: string;
  reviewStatusLabel: (status: Flashcard["processingStatus"]) => string;
  kindLabel: (kind: Flashcard["kind"]) => string;
  actionLabel: (action: FlashcardAction["action"] | ActionMode) => string;
  onOpenAction: (flashcard: Flashcard, mode: ActionMode) => void;
  onCloseAction: () => void;
  onActionCommentChange: (value: string) => void;
  onEditedTitleChange: (value: string) => void;
  onEditedBodyChange: (value: string) => void;
  onSubmit: (flashcardId: string) => void;
  activeHashtags: string[];
  onToggleHashtag: (tag: string) => void;
  onRemoveHashtag: (flashcardId: string, tag: string) => void;
  onCorrection?: (input: {
    flashcardId: string;
    correctionType: FlashcardCorrection["correctionType"];
    sourceType?: FlashcardSource["sourceType"];
    sourceId?: string;
    sourcePublicId?: number | null;
    sourceName?: string;
  }) => void;
  cardType?: IntelligenceType;
  onConvert?: (type: IntelligenceType) => void;
};

export function KnowledgeReviewCard({
  flashcard,
  onOpenDetail,
  detailMode = false,
  isActionOpen,
  actionMode,
  isBusy,
  isGenerating,
  actionComment,
  editedTitle,
  editedBody,
  reviewStatusLabel,
  kindLabel,
  actionLabel,
  onOpenAction,
  onCloseAction,
  onActionCommentChange,
  onEditedTitleChange,
  onEditedBodyChange,
  onSubmit,
  activeHashtags,
  onToggleHashtag,
  onRemoveHashtag,
  onCorrection,
  cardType = "KNOWLEDGE",
  onConvert,
}: Props) {
  const stopCardClick = (event: { stopPropagation: () => void }, callback?: () => void) => {
    event.stopPropagation();
    callback?.();
  };
  const freshness = getKnowledgeCardFreshness({
    createdAt: flashcard.createdAt,
    updatedAt: flashcard.updatedAt,
    refreshedAt: flashcard.refreshedAt,
    lastActionAt: flashcard.lastActionAt,
  });
  
  const getCardColor = () => {
    if (cardType === "GOAL") return "strategy";
    if (cardType === "TASK") return "checklist";
    return "knowmore";
  };

  const getCardTone = () => {
    if (cardType === "GOAL") return "strategy" as const;
    if (cardType === "TASK") return "checklist" as const;
    return "knowmore" as const;
  };

  return (
    <UnifiedCard tone={getCardTone()} onClick={onOpenDetail ? () => onOpenDetail(flashcard) : undefined}>
      <UnifiedCardHeader
        clampTitle={!detailMode}
        supporting={
          <Group gap="xs">
            <Badge 
              variant="outline" 
              color={getCardColor()} 
              size="sm"
            >
              {cardType === "GOAL" ? "Strategic Goal" : cardType === "TASK" ? "Tactical Task" : "Knowledge"}
            </Badge>
            
            {flashcard.activityState !== "ACTIVE" && (
              <Badge variant="filled" color="gray" size="xs" >
                {flashcard.activityState}
              </Badge>
            )}

            <Badge 
              variant="light" 
              color="gray" 
              size="xs"  
              leftSection={
                cardType === "GOAL" ? <Target size={10} /> : 
                cardType === "TASK" ? <LayoutDashboard size={10} /> : 
                <Sparkles size={10} />
              }
            >
              {kindLabel(flashcard.kind as any)}
            </Badge>

            <Badge 
              variant="light" 
              color={flashcard.intelligenceType === "COMPETITOR" ? "orange" : "gray"} 
              size="xs" 
            >
              {flashcard.intelligenceType === "COMPETITOR" ? "The Market" : "Internal"}
            </Badge>
            <UnifiedCardFreshnessBadge freshness={freshness} />

            <Group gap={4} ml="auto">
              <Text size="xs" c="dimmed">ICE</Text>
              <Badge color={getIceBadgeColor(flashcard.iceScore)}>
                {Math.round(flashcard.iceScore)}
              </Badge>
            </Group>
          </Group>
        }
        title={stripTechnicalMetadata(flashcard.title)}
      />

      <UnifiedCardBody>
        <UnifiedCardText disablePreview={detailMode}>
          {stripTechnicalMetadata(flashcard.body)}
        </UnifiedCardText>

        <Group gap={4}>
          {flashcard.hashtags.map(tag => (
            <Badge 
              key={tag} 
              variant={activeHashtags.includes(tag) ? "filled" : "outline"}
              color="gray"
              size="xs"
              onClick={(event) => stopCardClick(event, () => onToggleHashtag(tag))}
            >
              #{tag}
            </Badge>
          ))}
        </Group>

        {flashcard.userAnnotation && (
          <Box 
            p="md" 
            style={{ 
              borderRadius: "var(--mantine-radius-md)",
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              borderLeft: `4px solid var(--mantine-color-${getCardColor()}-4)`,
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              borderRight: '1px solid rgba(255, 255, 255, 0.06)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
            }}
          >
            <Group gap="xs" align="flex-start" wrap="nowrap">
              <MessageSquare size={16} style={{ marginTop: 4, opacity: 0.6 }} />
              <Text size="sm">
                {stripTechnicalMetadata(flashcard.userAnnotation)}
              </Text>
            </Group>
          </Box>
        )}

        <UnifiedCardActions>
          <Button 
            variant="filled" 
            color={getCardColor()} 
            leftSection={isBusy && actionMode === "ACCEPT" ? <Loader size={16} color="white" /> : <Check size={16} />}
            onClick={(event) => stopCardClick(event, () => onOpenAction(flashcard, "ACCEPT"))}
            disabled={isBusy || isGenerating}
          >
            Accept
          </Button>
          <Button 
            variant="outline" 
            color="red" 
            leftSection={<X size={16} />}
            onClick={(event) => stopCardClick(event, () => onOpenAction(flashcard, "DECLINE"))}
            disabled={isBusy || isGenerating}
          >
            Decline
          </Button>
          <Button 
            variant="outline" 
            color="gray" 
            leftSection={<PencilLine size={16} />}
            onClick={(event) => stopCardClick(event, () => onOpenAction(flashcard, "MODIFY_ACCEPT"))}
            disabled={isBusy || isGenerating}
          >
            Edit
          </Button>
        </UnifiedCardActions>

        {isActionOpen && actionMode && (
          <UnifiedCardSection>
            <Stack gap="md">
              <Text  size="xs"   c="dimmed">{actionLabel(actionMode)}</Text>
              
              {actionMode === "MODIFY_ACCEPT" && (
                <Stack gap="sm">
                  <TextInput label="Title" value={editedTitle} onChange={(e) => onEditedTitleChange(e.target.value)}  />
                  <Textarea label="Body" value={editedBody} onChange={(e) => onEditedBodyChange(e.target.value)} minRows={3}  />
                </Stack>
              )}
              
              <Textarea
                label="Strategic Feedback"
                placeholder="Why this action? Help the AI calibrate..."
                value={actionComment}
                onChange={(e) => onActionCommentChange(e.target.value)}
                minRows={2}
                
              />
              
              <Group gap="xs">
                <Button size="sm" onClick={(event) => stopCardClick(event, () => onSubmit(flashcard.id))} loading={isBusy}>Confirm Action</Button>
                <Button size="sm" variant="subtle" color="gray" onClick={(event) => stopCardClick(event, onCloseAction)} disabled={isBusy}>Cancel</Button>
              </Group>
            </Stack>
          </UnifiedCardSection>
        )}
      </UnifiedCardBody>

      {flashcard.refreshedAt && (
        <UnifiedCardFooter>
          <Text size="xs" c="dimmed">
            Last Synthesis: {new Date(flashcard.refreshedAt).toLocaleDateString()}
          </Text>
        </UnifiedCardFooter>
      )}
    </UnifiedCard>
  );
}
