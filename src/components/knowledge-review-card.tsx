import { Check, Loader2, MessageSquare, PencilLine, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormInput, FormTextarea } from "@/components/ui/form-fields";
import { HashtagChipList } from "@/components/ui/hashtag-chip-list";
import {
  UnifiedCard,
  UnifiedCardActions,
  UnifiedCardBody,
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
  kind:
    | "SUMMARY"
    | "EXPLANATION"
    | "COMPARISON"
    | "NEWS"
    | "CONCLUSION"
    | "EVALUATION"
    | "OPINION"
    | "JUDGMENT"
    | "RECOMMENDATION"
    | "RESEARCH"
    | "FORECAST"
    | "STOCK"
    | "GOSSIP"
    | "PRICE";
  title: string;
  body: string;
  confidence: number;
  impact: number;
  weight: number;
  reviewStatus: "PENDING" | "ACCEPTED" | "DECLINED" | "MODIFIED_ACCEPTED";
  userAnnotation: string | null;
  hashtags: string[];
  sources: FlashcardSource[];
  actions: FlashcardAction[];
  corrections: FlashcardCorrection[];
  refreshedAt: string;
  lastActionAt: string | null;
};

type ActionMode = "ACCEPT" | "DECLINE" | "MODIFY_ACCEPT";

type Props = {
  flashcard: Flashcard;
  isActionOpen: boolean;
  actionMode: ActionMode | null;
  isBusy: boolean;
  isGenerating: boolean;
  actionComment: string;
  editedTitle: string;
  editedBody: string;
  reviewStatusClasses: (status: Flashcard["reviewStatus"]) => string;
  reviewStatusLabel: (status: Flashcard["reviewStatus"]) => string;
  kindLabel: (kind: Flashcard["kind"]) => string;
  sourceLabel: (type: FlashcardSource["sourceType"]) => string;
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
  onCorrection: (input: {
    flashcardId: string;
    correctionType: FlashcardCorrection["correctionType"];
    sourceType?: FlashcardSource["sourceType"];
    sourceId?: string;
    sourcePublicId?: number | null;
    sourceName?: string;
  }) => void;
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
  reviewStatusClasses,
  reviewStatusLabel,
  kindLabel,
  sourceLabel,
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
}: Props) {
  return (
    <UnifiedCard className="group relative">
      <UnifiedCardHeader
        badges={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn("font-mono text-[10px] tracking-wider", reviewStatusClasses(flashcard.reviewStatus))}>
              {reviewStatusLabel(flashcard.reviewStatus).toUpperCase()}
            </Badge>
            <Badge variant="secondary" className="font-mono text-[10px] tracking-wider uppercase opacity-80">
              {kindLabel(flashcard.kind)}
            </Badge>
            <div className="ml-auto flex items-center gap-3 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-tighter">
              <span>Impact {flashcard.impact}</span>
              <span>Confidence {flashcard.confidence}%</span>
            </div>
          </div>
        }
        title={<span className="font-display font-bold tracking-tight">{flashcard.title}</span>}
      />

      <UnifiedCardBody>
        <UnifiedCardText className="text-[0.95rem] leading-relaxed text-foreground/90">
          {flashcard.body}
        </UnifiedCardText>

        <HashtagChipList
          hashtags={flashcard.hashtags}
          activeTags={activeHashtags}
          onToggle={onToggleHashtag}
          onRemove={(tag) => onRemoveHashtag(flashcard.id, tag)}
        />

        <div className="space-y-4 pt-2">
          {flashcard.userAnnotation && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-200">
              <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 opacity-70" />
              <p>{flashcard.userAnnotation}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5 opacity-60 transition-opacity group-hover:opacity-100">
            {flashcard.sources.map((source) => (
              <Badge key={source.id} variant="outline" className="text-[10px] font-normal lowercase bg-background/50">
                {sourceLabel(source.sourceType)}: {source.sourceName}
              </Badge>
            ))}
          </div>

          <UnifiedCardActions className="pt-2">
            <Button size="sm" variant="secondary" className="h-8 shadow-sm" onClick={() => onOpenAction(flashcard, "ACCEPT")} disabled={isBusy || isGenerating}>
              {isBusy && actionMode === "ACCEPT" && isActionOpen ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Accept
            </Button>
            <Button size="sm" variant="outline" className="h-8" onClick={() => onOpenAction(flashcard, "DECLINE")} disabled={isBusy || isGenerating}>
              <X className="h-3.5 w-3.5" />
              Decline
            </Button>
            <Button size="sm" variant="outline" className="h-8" onClick={() => onOpenAction(flashcard, "MODIFY_ACCEPT")} disabled={isBusy || isGenerating}>
              <PencilLine className="h-3.5 w-3.5" />
              Edit
            </Button>
          </UnifiedCardActions>

          {isActionOpen && actionMode && (
            <UnifiedCardSection className="space-y-4 bg-accent/5 backdrop-blur-sm animate-in fade-in slide-in-from-top-2 duration-200">
              <p className="text-sm font-semibold">{actionLabel(actionMode)}</p>
              {actionMode === "MODIFY_ACCEPT" && (
                <div className="space-y-3">
                  <FormInput label="Title" value={editedTitle} onChange={(e) => onEditedTitleChange(e.target.value)} />
                  <FormTextarea label="Body" value={editedBody} onChange={(e) => onEditedBodyChange(e.target.value)} rows={3} />
                </div>
              )}
              <FormTextarea
                label="Feedback"
                placeholder="Why this action? Help the AI learn..."
                value={actionComment}
                onChange={(e) => onActionCommentChange(e.target.value)}
                rows={2}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => onSubmit(flashcard.id)} disabled={isBusy}>
                  {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
                </Button>
                <Button size="sm" variant="ghost" onClick={onCloseAction} disabled={isBusy}>Cancel</Button>
              </div>
            </UnifiedCardSection>
          )}

          <div className="flex gap-4 border-t border-border/40 pt-4">
            <div className="flex-1 space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Intelligence controls</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" className="h-7 text-[10px] uppercase font-bold tracking-tight hover:bg-violet-500/10 hover:text-violet-600" onClick={() => onCorrection({ flashcardId: flashcard.id, correctionType: "PIN" })} disabled={isBusy || isGenerating}>
                  Pin Evidence
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-[10px] uppercase font-bold tracking-tight hover:bg-sky-500/10 hover:text-sky-600" onClick={() => onCorrection({ flashcardId: flashcard.id, correctionType: "REQUEST_REFRESH" })} disabled={isBusy || isGenerating}>
                  Refresh
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-[10px] uppercase font-bold tracking-tight hover:bg-orange-500/10 hover:text-orange-600" onClick={() => onCorrection({ flashcardId: flashcard.id, correctionType: "HIDE" })} disabled={isBusy || isGenerating}>
                  Archive
                </Button>
              </div>
            </div>
            {flashcard.actions.length > 0 && (
              <div className="shrink-0 text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">History</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Last seen {new Date(flashcard.refreshedAt).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
        </div>
      </UnifiedCardBody>
    </UnifiedCard>
  );
}
