import { IconCheck as Check, IconMessage2 as MessageSquare, IconPencil as PencilLine, IconX as X, IconPin as Pin, IconRefresh as RefreshCw, IconSparkles as Sparkles, IconArchive as Archive, IconTarget as Target, IconLayoutDashboard as LayoutDashboard, IconEyeOff as EyeOff, IconAlertTriangle as AlertTriangle, IconBan as Ban } from "@tabler/icons-react";
import { Badge, Button, Group, Stack, Divider, Box, TextInput, Textarea, Tooltip, rem, Loader, ThemeIcon } from "@mantine/core";
import { getIceBadgeColor } from "@/lib/ice-colors";
import { getKnowledgeCardFreshness } from "@/lib/card-freshness";
import { getDisplayableHumanComment, stripTechnicalMetadata } from "@/lib/ui-utils";
import { CardShareAction } from "@/components/ui/card-share-action";
import { BodyText, MetaText, Title } from "@/components/ui/typography";
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
  processingStatus: "DRAFT" | "CHECKED" | "VERIFIED" | "ACCEPTED" | "DECLINED" | "REVIEW";
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
  conflictDetected?: boolean;
  conflictSummary?: string | null;
  generatedFromIds?: string[];
  versionFamilyId?: string | null;
  duplicateClusterId?: string | null;
  refinedFromId?: string | null;
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
  hideTitle?: boolean;
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
  hideTitle = false,
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
  const displayableComment = getDisplayableHumanComment(flashcard.userAnnotation);
  
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
            {flashcard.conflictDetected && (
              <Badge variant="light" color="review" size="xs">
                Conflict
              </Badge>
            )}

            <Group gap={4} ml="auto">
              <MetaText>ICE</MetaText>
              <Badge color={getIceBadgeColor(flashcard.iceScore)}>
                {Math.round(flashcard.iceScore)}
              </Badge>
            </Group>
          </Group>
        }
        title={hideTitle ? undefined : stripTechnicalMetadata(flashcard.title)}
      />

      <UnifiedCardBody>
        <UnifiedCardText disablePreview={detailMode} markdown>
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

        {detailMode && displayableComment && (
          <UnifiedCardSection tone={getCardTone()}>
            <Group gap="xs" align="flex-start" wrap="nowrap">
              <ThemeIcon variant="light" color={getCardColor()} size="sm">
                <MessageSquare size={14} />
              </ThemeIcon>
              <BodyText c="var(--text-primary)">{displayableComment}</BodyText>
            </Group>
          </UnifiedCardSection>
        )}

        {detailMode && flashcard.conflictDetected && flashcard.conflictSummary && (
          <UnifiedCardSection tone="review">
            <Group gap="xs" align="flex-start" wrap="nowrap">
              <ThemeIcon variant="light" color="review" size="sm">
                <MessageSquare size={14} />
              </ThemeIcon>
              <BodyText c="var(--text-primary)">{flashcard.conflictSummary}</BodyText>
            </Group>
          </UnifiedCardSection>
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
            color="review" 
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
          <Group ml="auto">
            <CardShareAction cardId={flashcard.id} />
          </Group>
        </UnifiedCardActions>

        {onCorrection ? (
          <UnifiedCardActions>
            <Button
              variant="subtle"
              color="strategy"
              size="compact-sm"
              leftSection={<Pin size={14} />}
              onClick={(event) => stopCardClick(event, () => onCorrection({ flashcardId: flashcard.id, correctionType: "PIN" }))}
              disabled={isBusy || isGenerating}
            >
              Pin
            </Button>
            <Button
              variant="subtle"
              color="knowmore"
              size="compact-sm"
              leftSection={<RefreshCw size={14} />}
              onClick={(event) => stopCardClick(event, () => onCorrection({ flashcardId: flashcard.id, correctionType: "REQUEST_REFRESH" }))}
              disabled={isBusy || isGenerating}
            >
              Refresh
            </Button>
            <Button
              variant="subtle"
              color="review"
              size="compact-sm"
              leftSection={<AlertTriangle size={14} />}
              onClick={(event) => stopCardClick(event, () => onCorrection({ flashcardId: flashcard.id, correctionType: "MARK_WRONG" }))}
              disabled={isBusy || isGenerating}
            >
              Mark Wrong
            </Button>
            <Button
              variant="subtle"
              color="gray"
              size="compact-sm"
              leftSection={<EyeOff size={14} />}
              onClick={(event) => stopCardClick(event, () => onCorrection({ flashcardId: flashcard.id, correctionType: "HIDE" }))}
              disabled={isBusy || isGenerating}
            >
              Hide
            </Button>
            {detailMode && flashcard.sources[0] ? (
              <Button
                variant="subtle"
                color="review"
                size="compact-sm"
                leftSection={<Ban size={14} />}
                onClick={(event) =>
                  stopCardClick(event, () =>
                    onCorrection({
                      flashcardId: flashcard.id,
                      correctionType: "SUPPRESS_SOURCE",
                      sourceType: flashcard.sources[0].sourceType,
                      sourceId: flashcard.sources[0].sourceId,
                      sourcePublicId: flashcard.sources[0].sourcePublicId,
                      sourceName: flashcard.sources[0].sourceName,
                    }),
                  )
                }
                disabled={isBusy || isGenerating}
              >
                Suppress Source
              </Button>
            ) : null}
          </UnifiedCardActions>
        ) : null}

        {isActionOpen && actionMode && (
          <UnifiedCardSection>
            <Stack gap="md">
              <MetaText>{actionLabel(actionMode)}</MetaText>
              
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

        {detailMode && flashcard.corrections.length > 0 ? (
          <UnifiedCardSection>
            <Stack gap="xs">
              <MetaText>Recent Corrections</MetaText>
              {flashcard.corrections.map((correction) => (
                <Box key={correction.id}>
                  <Group gap="xs">
                    <Badge variant="light" color="gray" size="xs">
                      {correction.correctionType.replace(/_/g, " ")}
                    </Badge>
                    <MetaText>{new Date(correction.createdAt).toLocaleString()}</MetaText>
                  </Group>
                  {correction.sourceName ? (
                    <BodyText c="var(--text-secondary)">{correction.sourceName}</BodyText>
                  ) : null}
                  {correction.note ? (
                    <BodyText c="var(--text-secondary)">{correction.note}</BodyText>
                  ) : null}
                </Box>
              ))}
            </Stack>
          </UnifiedCardSection>
        ) : null}

        {detailMode && (flashcard.versionFamilyId || flashcard.duplicateClusterId || flashcard.refinedFromId) ? (
          <UnifiedCardSection>
            <Stack gap="xs">
              <MetaText>Lineage</MetaText>
              {flashcard.versionFamilyId ? <BodyText c="var(--text-secondary)">Version Family: {flashcard.versionFamilyId}</BodyText> : null}
              {flashcard.duplicateClusterId ? <BodyText c="var(--text-secondary)">Duplicate Cluster: {flashcard.duplicateClusterId}</BodyText> : null}
              {flashcard.refinedFromId ? <BodyText c="var(--text-secondary)">Refined From: {flashcard.refinedFromId}</BodyText> : null}
            </Stack>
          </UnifiedCardSection>
        ) : null}
      </UnifiedCardBody>

      {flashcard.refreshedAt && (
        <UnifiedCardFooter>
          <MetaText>Last Synthesis: {new Date(flashcard.refreshedAt).toLocaleDateString()}</MetaText>
        </UnifiedCardFooter>
      )}
    </UnifiedCard>
  );
}
