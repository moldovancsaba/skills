import { Check, Loader2, MessageSquare, PencilLine, X, Pin, RefreshCw, AlertCircle, Archive } from "lucide-react";
import { Badge, Button, Group, Stack, Text, Divider, Box, TextInput, Textarea, Tooltip } from "@mantine/core";
import { stripTechnicalMetadata } from "@/lib/ui-utils";
import {
  UnifiedCard,
  UnifiedCardActions,
  UnifiedCardBody,
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
  
  const getCardColor = () => {
    if (cardType === "GOAL") return "strategy";
    if (cardType === "TASK") return "execution";
    return "knowledge";
  };

  const getICEColor = (score: number) => {
    if (score > 500) return "green";
    if (score > 250) return "orange";
    return "red";
  };

  return (
    <UnifiedCard>
      <UnifiedCardHeader
        supporting={
          <Group gap="xs">
            <Badge 
              variant="outline" 
              color={getCardColor()} 
              size="sm"
              tt="uppercase"
              fw={800}
            >
              {cardType === "GOAL" ? "Strategic Goal" : cardType === "TASK" ? "Tactical Task" : "Knowledge"}
            </Badge>
            
            {flashcard.activityState !== "ACTIVE" && (
              <Badge variant="filled" color="gray" size="xs" tt="uppercase">
                {flashcard.activityState}
              </Badge>
            )}

            <Badge variant="light" color="gray" size="xs" tt="uppercase" leftSection={<AlertCircle size={10} />}>
              {kindLabel(flashcard.kind as any)}
            </Badge>

            <Badge 
              variant="light" 
              color={flashcard.intelligenceType === "COMPETITOR" ? "orange" : "gray"} 
              size="xs" 
              tt="uppercase"
            >
              {flashcard.intelligenceType === "COMPETITOR" ? "The Market" : "Internal"}
            </Badge>

            <Group gap={4} ml="auto">
              <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: 1 }}>ICE Score</Text>
              <Badge size="lg" radius="sm" color={getICEColor(flashcard.iceScore)} variant="filled">
                {Math.round(flashcard.iceScore)}
              </Badge>
            </Group>
          </Group>
        }
        title={stripTechnicalMetadata(flashcard.title)}
      />

      <UnifiedCardBody>
        <UnifiedCardText>
          {stripTechnicalMetadata(flashcard.body)}
        </UnifiedCardText>

        <Group gap={4}>
          {flashcard.hashtags.map(tag => (
            <Badge 
              key={tag} 
              variant={activeHashtags.includes(tag) ? "filled" : "outline"}
              color="gray"
              size="xs"
              style={{ cursor: "pointer" }}
              onClick={() => onToggleHashtag(tag)}
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
              backgroundColor: "rgba(0,0,0,0.2)",
              borderLeft: "4px solid var(--mantine-color-brand-6)"
            }}
          >
            <Group gap="xs" align="flex-start" wrap="nowrap">
              <MessageSquare size={16} style={{ marginTop: 4, opacity: 0.6 }} />
              <Text size="sm" style={{ fontStyle: "italic", lineHeight: 1.5 }}>
                {flashcard.userAnnotation}
              </Text>
            </Group>
          </Box>
        )}

        <UnifiedCardActions>
          <Button 
            variant="filled" 
            color={getCardColor()} 
            leftSection={isBusy && actionMode === "ACCEPT" ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            onClick={() => onOpenAction(flashcard, "ACCEPT")}
            disabled={isBusy || isGenerating}
          >
            Accept
          </Button>
          <Button 
            variant="outline" 
            color="red" 
            leftSection={<X size={16} />}
            onClick={() => onOpenAction(flashcard, "DECLINE")}
            disabled={isBusy || isGenerating}
          >
            Decline
          </Button>
          <Button 
            variant="outline" 
            color="gray" 
            leftSection={<PencilLine size={16} />}
            onClick={() => onOpenAction(flashcard, "MODIFY_ACCEPT")}
            disabled={isBusy || isGenerating}
          >
            Edit
          </Button>
        </UnifiedCardActions>

        {isActionOpen && actionMode && (
          <UnifiedCardSection>
            <Stack gap="md">
              <Text fw={700} size="sm">{actionLabel(actionMode)}</Text>
              
              {actionMode === "MODIFY_ACCEPT" && (
                <Stack gap="sm">
                  <TextInput label="Title" value={editedTitle} onChange={(e) => onEditedTitleChange(e.target.value)} />
                  <Textarea label="Body" value={editedBody} onChange={(e) => onEditedBodyChange(e.target.value)} minRows={3} />
                </Stack>
              )}
              
              <Textarea
                label="Feedback"
                placeholder="Why this action? Help the AI learn..."
                value={actionComment}
                onChange={(e) => onActionCommentChange(e.target.value)}
                minRows={2}
              />
              
              <Group gap="xs">
                <Button size="sm" onClick={() => onSubmit(flashcard.id)} loading={isBusy}>Confirm</Button>
                <Button size="sm" variant="subtle" color="gray" onClick={onCloseAction} disabled={isBusy}>Cancel</Button>
              </Group>
            </Stack>
          </UnifiedCardSection>
        )}
      </UnifiedCardBody>

      {flashcard.refreshedAt && (
        <UnifiedCardFooter>
          <Text size="xs" c="dimmed">
            Last seen {new Date(flashcard.refreshedAt).toLocaleDateString()}
          </Text>
        </UnifiedCardFooter>
      )}
    </UnifiedCard>
  );
}
