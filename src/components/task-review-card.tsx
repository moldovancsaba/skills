import { Check, CheckCircle, Loader2, MessageSquare, PencilLine, Share2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormInput, FormTextarea } from "@/components/ui/form-fields";
import {
  UnifiedCard,
  UnifiedCardActions,
  UnifiedCardBody,
  UnifiedCardHeader,
  UnifiedCardSection,
  UnifiedCardText,
} from "@/components/ui/unified-card";

type ActionMode = "ACCEPT" | "DECLINE" | "MODIFY_ACCEPT";

type NBAItem = {
  id: string;
  title: string;
  description: string;
  impact: number;
  confidence: number;
  ease: number;
  iceScore: number;
  status: string;
  userAnnotation?: string;
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
  onSubmit: (
    itemId: string,
    action: ActionMode,
    annotation?: string,
    modifiedTitle?: string,
    modifiedDescription?: string,
  ) => void;
  onShare: (item: NBAItem) => void;
};

function statusVariant(status: string) {
  switch (status) {
    case "ACCEPTED":
      return "default" as const;
    case "DECLINED":
      return "destructive" as const;
    default:
      return "outline" as const;
  }
}

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
  onSubmit,
  onShare,
}: TaskReviewCardProps) {
  return (
    <UnifiedCard className={item.status === "DECLINED" ? "opacity-60" : undefined}>
      <UnifiedCardHeader
        badges={
          <>
            <Badge variant={statusVariant(item.status)}>{item.status}</Badge>
            <Badge variant="outline">Impact {item.impact}</Badge>
            <Badge variant="outline">Confidence {item.confidence}%</Badge>
            <Badge variant="outline">Ease {item.ease}</Badge>
            <Badge variant="secondary">ICE {Math.round(item.iceScore)}</Badge>
          </>
        }
        title={item.title}
        description={item.description}
        aside={
          item.status === "PENDING" ? (
            <UnifiedCardActions className="justify-end">
              <Button size="sm" variant="secondary" onClick={() => onOpenAction(item, "ACCEPT")}>
                <Check className="h-4 w-4" />
                Accept
              </Button>
              <Button size="sm" variant="outline" onClick={() => onOpenAction(item, "DECLINE")}>
                <X className="h-4 w-4" />
                Decline
              </Button>
              <Button size="sm" variant="outline" onClick={() => onOpenAction(item, "MODIFY_ACCEPT")}>
                <PencilLine className="h-4 w-4" />
                Modify + accept
              </Button>
            </UnifiedCardActions>
          ) : (
            <Button onClick={() => onShare(item)} variant="ghost" size="icon" title="Share">
              {copied ? <CheckCircle className="h-5 w-5 text-green-600" /> : <Share2 className="h-5 w-5" />}
            </Button>
          )
        }
      />

      <UnifiedCardBody>
        {item.userAnnotation ? (
          <UnifiedCardSection className="bg-muted/60">
            <UnifiedCardText className="leading-5">
              <MessageSquare className="mr-2 inline h-4 w-4 align-text-bottom text-muted-foreground" />
              {item.userAnnotation}
            </UnifiedCardText>
          </UnifiedCardSection>
        ) : null}

        {isActionOpen && actionMode ? (
          <UnifiedCardSection className="bg-muted/20">
            <p className="text-sm font-medium text-foreground">
              {actionMode === "DECLINE"
                ? "Decline this checklist item"
                : actionMode === "MODIFY_ACCEPT"
                  ? "Modify and accept this checklist item"
                  : "Accept this checklist item"}
            </p>

            {actionMode === "MODIFY_ACCEPT" ? (
              <div className="space-y-3">
                <FormInput
                  label="Adjusted task title"
                  value={draftTitle}
                  onChange={(event) => onDraftTitleChange(event.target.value)}
                  placeholder="Adjusted task title"
                />
                <FormTextarea
                  label="Adjusted task description"
                  value={draftDescription}
                  onChange={(event) => onDraftDescriptionChange(event.target.value)}
                  placeholder="Adjusted task description"
                />
              </div>
            ) : null}

            <FormTextarea
              label={actionMode === "DECLINE" ? "Comment" : "Comment (optional)"}
              value={annotation}
              onChange={(event) => onAnnotationChange(event.target.value)}
              placeholder={
                actionMode === "DECLINE"
                  ? "Why are you declining? (required)"
                  : actionMode === "MODIFY_ACCEPT"
                    ? "Why did you adjust this task?"
                    : "Why are you accepting this task?"
              }
            />

            <UnifiedCardActions>
              <Button
                onClick={() =>
                  onSubmit(
                    item.id,
                    actionMode,
                    annotation,
                    actionMode === "MODIFY_ACCEPT" ? draftTitle : undefined,
                    actionMode === "MODIFY_ACCEPT" ? draftDescription : undefined,
                  )
                }
                disabled={
                  isBusy ||
                  (actionMode === "DECLINE" && !annotation.trim()) ||
                  (actionMode === "MODIFY_ACCEPT" && (!draftTitle.trim() || !draftDescription.trim()))
                }
                variant={actionMode === "DECLINE" ? "destructive" : "default"}
                size="sm"
              >
                {isBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : actionMode === "DECLINE" ? (
                  <X className="h-4 w-4" />
                ) : actionMode === "MODIFY_ACCEPT" ? (
                  <PencilLine className="h-4 w-4" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {actionMode === "DECLINE"
                  ? "Confirm decline"
                  : actionMode === "MODIFY_ACCEPT"
                    ? "Save and accept"
                    : "Confirm accept"}
              </Button>
              <Button onClick={onCloseAction} variant="ghost" size="sm" disabled={isBusy}>
                Cancel
              </Button>
            </UnifiedCardActions>
          </UnifiedCardSection>
        ) : null}
      </UnifiedCardBody>
    </UnifiedCard>
  );
}
