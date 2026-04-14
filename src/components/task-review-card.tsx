import { Check, CheckCircle, Loader2, MessageSquare, PencilLine, Share2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormInput, FormTextarea } from "@/components/ui/form-fields";
import { HashtagChipList } from "@/components/ui/hashtag-chip-list";
import { StructuredActionRow, StructuredCard, StructuredChipRow } from "@/components/ui/structured-card";

type ActionMode = "ACCEPT" | "DECLINE" | "MODIFY_ACCEPT";

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
  activeHashtags: string[];
  onToggleHashtag: (tag: string) => void;
  onRemoveHashtag: (itemId: string, tag: string) => void;
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
  activeHashtags,
  onToggleHashtag,
  onRemoveHashtag,
  onSubmit,
  onShare,
}: TaskReviewCardProps) {
  const chips = (
    <StructuredChipRow>
      <Badge variant="secondary" className="font-mono">
        {item.publicId ? `#${item.publicId}` : `ID ${item.id.slice(0, 8)}`}
      </Badge>
      <Badge variant={statusVariant(item.processingStatus)}>{item.processingStatus.toUpperCase()}</Badge>
      {item.activityState !== "ACTIVE" && (
        <Badge variant="destructive" className="font-mono opacity-80">{item.activityState}</Badge>
      )}
      <Badge variant="outline">Impact {item.impact}</Badge>
      <Badge variant="outline">Confidence {Math.round(item.confidenceScore)}%</Badge>
      <Badge variant="outline">Ease {item.ease}</Badge>
    </StructuredChipRow>
  );

  const actions = (
    <StructuredActionRow>
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
      <Button onClick={() => onShare(item)} variant="ghost" size="sm" title="Share" className="ml-auto">
        {copied ? <CheckCircle className="h-4 w-4 text-green-600" /> : <Share2 className="h-4 w-4" />}
        Share
      </Button>
    </StructuredActionRow>
  );

  const details = (
    <div className="space-y-4">
      <HashtagChipList
        hashtags={item.hashtags}
        activeTags={activeHashtags}
        onToggle={onToggleHashtag}
        onRemove={(tag) => onRemoveHashtag(item.id, tag)}
      />

      {item.userAnnotation ? (
        <div className="text-sm text-foreground">
          <MessageSquare className="mr-2 inline h-4 w-4 align-text-bottom text-muted-foreground" />
          {item.userAnnotation}
        </div>
      ) : null}

      {isActionOpen && actionMode ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">
            {actionMode === "DECLINE" ? "Decline this checklist item" : actionMode === "MODIFY_ACCEPT" ? "Modify and accept this checklist item" : "Accept this checklist item"}
          </p>

          {actionMode === "DECLINE" ? (
            <div className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
              <p className="font-medium">Useful decline language</p>
              <p className="mt-1">
                Say whether this is wrong, already happening, not relevant, too early, or blocked by a dependency. If the idea is good but mistimed, use phrases like after summer, after launch, after hiring, or revisit in Q4.
              </p>
            </div>
          ) : null}

          {actionMode === "MODIFY_ACCEPT" ? (
            <div className="space-y-3">
              <FormInput label="Adjusted task title" value={draftTitle} onChange={(event) => onDraftTitleChange(event.target.value)} placeholder="Adjusted task title" />
              <FormTextarea label="Adjusted task description" value={draftDescription} onChange={(event) => onDraftDescriptionChange(event.target.value)} placeholder="Adjusted task description" />
            </div>
          ) : null}

          <FormTextarea
            label={actionMode === "DECLINE" ? "Comment" : "Comment (optional)"}
            value={annotation}
            onChange={(event) => onAnnotationChange(event.target.value)}
            placeholder={actionMode === "DECLINE" ? "Explain whether this is wrong, already covered, too early, blocked, or ready after a specific milestone" : actionMode === "MODIFY_ACCEPT" ? "Why did you adjust this task?" : "Why are you accepting this task?"}
          />

          <StructuredActionRow>
            <Button
              onClick={() => onSubmit(item.id, actionMode, annotation, actionMode === "MODIFY_ACCEPT" ? draftTitle : undefined, actionMode === "MODIFY_ACCEPT" ? draftDescription : undefined)}
              disabled={isBusy || (actionMode === "DECLINE" && !annotation.trim()) || (actionMode === "MODIFY_ACCEPT" && (!draftTitle.trim() || !draftDescription.trim()))}
              variant={actionMode === "DECLINE" ? "destructive" : "default"}
              size="sm"
            >
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : actionMode === "DECLINE" ? <X className="h-4 w-4" /> : actionMode === "MODIFY_ACCEPT" ? <PencilLine className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              {actionMode === "DECLINE" ? "Confirm decline" : actionMode === "MODIFY_ACCEPT" ? "Save and accept" : "Confirm accept"}
            </Button>
            <Button onClick={onCloseAction} variant="ghost" size="sm" disabled={isBusy}>Cancel</Button>
          </StructuredActionRow>
        </div>
      ) : null}
    </div>
  );

  return <StructuredCard chips={chips} title={item.title} body={item.description} actions={actions} details={details} className={item.processingStatus === "DECLINED" ? "opacity-60" : undefined} />;
}
