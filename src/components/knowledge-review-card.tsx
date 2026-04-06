import { Check, Loader2, MessageSquare, PencilLine, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormInput, FormTextarea } from "@/components/ui/form-fields";
import { StructuredActionRow, StructuredCard, StructuredChipRow } from "@/components/ui/structured-card";

type FlashcardSource = {
  id: string;
  sourceType: "PRODUCT" | "CUSTOMER" | "COMPETITOR" | "FILE" | "AGENT_FOUND";
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
  sources: FlashcardSource[];
  actions: FlashcardAction[];
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
}: Props) {
  const chips = (
    <StructuredChipRow>
      <Badge variant="secondary" className="font-mono">{flashcard.publicId ? `#${flashcard.publicId}` : `ID ${flashcard.id.slice(0, 8)}`}</Badge>
      <Badge variant="outline" className={reviewStatusClasses(flashcard.reviewStatus)}>{reviewStatusLabel(flashcard.reviewStatus).toUpperCase()}</Badge>
      <Badge variant="outline" className="uppercase">{kindLabel(flashcard.kind)}</Badge>
      <Badge variant="outline">Impact {flashcard.impact}</Badge>
      <Badge variant="outline">Confidence {flashcard.confidence}%</Badge>
      <Badge variant="outline">Weight {flashcard.weight}</Badge>
      {flashcard.sources.map((source) => (
        <Badge key={source.id} variant="outline" className="gap-1 font-normal">
          {source.sourcePublicId ? `#${source.sourcePublicId}` : "pending"} {sourceLabel(source.sourceType)}
        </Badge>
      ))}
    </StructuredChipRow>
  );

  const actions = (
    <StructuredActionRow>
      <Button size="sm" variant="secondary" onClick={() => onOpenAction(flashcard, "ACCEPT")} disabled={isBusy || isGenerating}>
        {isBusy && actionMode === "ACCEPT" && isActionOpen ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        Accept
      </Button>
      <Button size="sm" variant="outline" onClick={() => onOpenAction(flashcard, "DECLINE")} disabled={isBusy || isGenerating}>
        <X className="h-4 w-4" />
        Decline
      </Button>
      <Button size="sm" variant="outline" onClick={() => onOpenAction(flashcard, "MODIFY_ACCEPT")} disabled={isBusy || isGenerating}>
        <PencilLine className="h-4 w-4" />
        Modify + accept
      </Button>
    </StructuredActionRow>
  );

  const details = (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground">
        Refreshed {new Date(flashcard.refreshedAt).toLocaleDateString()}
        {flashcard.lastActionAt ? ` • Last reviewed ${new Date(flashcard.lastActionAt).toLocaleDateString()}` : ""}
      </div>

      {flashcard.userAnnotation ? (
        <div className="text-sm text-foreground">
          <MessageSquare className="mr-2 inline h-4 w-4 align-text-bottom text-muted-foreground" />
          {flashcard.userAnnotation}
        </div>
      ) : null}

      {isActionOpen && actionMode ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">{actionLabel(actionMode)} this flashcard</p>
          {actionMode === "MODIFY_ACCEPT" ? (
            <>
              <FormInput label="Edited title" value={editedTitle} onChange={(event) => onEditedTitleChange(event.target.value)} placeholder="Correct the flashcard title" />
              <FormTextarea label="Edited body" value={editedBody} onChange={(event) => onEditedBodyChange(event.target.value)} placeholder="Correct or refine the flashcard body" className="min-h-[120px]" />
            </>
          ) : null}
          <FormTextarea
            label={actionMode === "DECLINE" ? "Comment" : "Comment (optional)"}
            value={actionComment}
            onChange={(event) => onActionCommentChange(event.target.value)}
            placeholder={actionMode === "DECLINE" ? "Explain what is wrong, misleading, or not useful" : actionMode === "MODIFY_ACCEPT" ? "Explain why the edit matters" : "Add extra context for the local AI"}
          />
          <StructuredActionRow>
            <Button size="sm" onClick={() => onSubmit(flashcard.id)} disabled={isBusy}>
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : actionMode === "DECLINE" ? <X className="h-4 w-4" /> : actionMode === "MODIFY_ACCEPT" ? <PencilLine className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              Confirm {actionLabel(actionMode).toLowerCase()}
            </Button>
            <Button size="sm" variant="ghost" onClick={onCloseAction} disabled={isBusy}>Cancel</Button>
          </StructuredActionRow>
        </div>
      ) : null}

      {flashcard.actions.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent flashcard actions</p>
          {flashcard.actions.map((action) => (
            <div key={action.id} className="text-sm text-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{actionLabel(action.action)}</Badge>
                <span className="text-xs text-muted-foreground">{new Date(action.createdAt).toLocaleString()}</span>
              </div>
              {action.annotation ? <p className="mt-1 text-muted-foreground">{action.annotation}</p> : null}
              {action.modifiedTitle ? <p className="mt-1 text-xs text-muted-foreground">Edited title: {action.modifiedTitle}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );

  return <StructuredCard chips={chips} title={flashcard.title} body={flashcard.body} actions={actions} details={details} />;
}
