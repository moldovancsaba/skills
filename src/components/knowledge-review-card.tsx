import { Check, Loader2, MessageSquare, PencilLine, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { getMetricColorClasses } from "@/lib/ice-colors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormInput, FormTextarea } from "@/components/ui/form-fields";
import { HashtagChipList } from "@/components/ui/hashtag-chip-list";
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
  reviewStatusClasses: (status: Flashcard["processingStatus"]) => string;
  reviewStatusLabel: (status: Flashcard["processingStatus"]) => string;
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
  cardType?: IntelligenceType;
  onConvert?: (flashcardId: string, targetType: IntelligenceType) => void;
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
  cardType = "KNOWLEDGE",
  onConvert,
}: Props) {
  const ischecklistResearch = Boolean(flashcard.ischecklistResearch);
  return (
    <UnifiedCard className={cn(
      "group relative",
      ischecklistResearch && "border-cyan-400/30 bg-[linear-gradient(180deg,rgba(14,116,144,0.16),rgba(15,23,42,0.96)_22%,rgba(15,23,42,0.98))] shadow-[0_0_0_1px_rgba(34,211,238,0.08),0_18px_48px_rgba(8,47,73,0.28)]"
    )}>
      <UnifiedCardHeader
        supporting={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn(
              "font-mono text-[10px] tracking-wider", 
              cardType === "GOAL" ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/5" :
              cardType === "TASK" ? "border-blue-500/30 text-blue-400 bg-blue-500/5" :
              reviewStatusClasses(flashcard.processingStatus)
            )}>
              {cardType === "GOAL" ? "STRATEGIC GOAL" : cardType === "TASK" ? "TACTICAL TASK" : "KNOWLEDGE"}
            </Badge>
            {flashcard.activityState !== "ACTIVE" && (
              <Badge variant="destructive" className="font-mono text-[10px] tracking-wider uppercase opacity-80">
                {flashcard.activityState}
              </Badge>
            )}
            <Badge variant="secondary" className="font-mono text-[10px] tracking-wider uppercase opacity-80 gap-1">
              <span className="material-symbols-outlined text-[12px]">
                {cardType === "GOAL" ? "target" : cardType === "TASK" ? "checklist" : "auto_awesome"}
              </span>
              {kindLabel(flashcard.kind as any)}
            </Badge>
            <Badge 
              variant="secondary" 
              className={cn(
                "font-mono text-[10px] tracking-wider uppercase",
                flashcard.intelligenceType === "COMPETITOR" ? "bg-amber-500/20 text-amber-500 border border-amber-500/20" : "opacity-80"
              )}
            >
              {flashcard.intelligenceType === "COMPETITOR" ? "The Market" : "Internal"}
            </Badge>
            {flashcard.userAnnotation?.includes("[TRACE:") && (
              <Badge variant="outline" className="border-zinc-500/20 bg-zinc-500/5 font-mono text-[9px] tracking-tight text-zinc-400">
                {flashcard.userAnnotation.match(/\[TRACE:([^\]]+)\]/)?.[1] || "TRACED"}
              </Badge>
            )}
            {flashcard.userAnnotation?.includes("[QUALITY:") && (
              <Badge variant="outline" className="border-indigo-400/40 bg-indigo-500/10 font-mono text-[9px] tracking-tight text-indigo-300">
                Q:{flashcard.userAnnotation.match(/\[QUALITY:([^\]]+)\]/)?.[1] || "0"}
              </Badge>
            )}
            {flashcard.userAnnotation?.includes("[TOPIC_ID:") && (
              <Badge variant="outline" className="border-emerald-400/40 bg-emerald-500/10 font-mono text-[9px] tracking-tight text-emerald-300">
                STRATEGY:{flashcard.userAnnotation.match(/\[TOPIC_ID:([^\]]+)\]/)?.[1]?.substring(0, 4) || "ANCHORED"}
              </Badge>
            )}
            <div className={cn("ml-auto flex items-center gap-3 text-[10px] font-bold uppercase tracking-tighter px-2.5 py-1 rounded-md border shadow-sm", getMetricColorClasses(flashcard.impact * (flashcard.confidenceScore / 10) * flashcard.weight))}>
              <span className="opacity-70">ICE Score</span>
              <span className="text-sm font-black">{Math.round(flashcard.impact * (flashcard.confidenceScore / 10) * flashcard.weight)}</span>
              <div className="h-3 w-px bg-current/20 mx-1" />
              <span className="opacity-70">Ease</span>
              <span className="text-sm font-black">{flashcard.weight}</span>
            </div>
          </div>
        }
        title={<span className="font-display font-bold tracking-tight">{flashcard.title}</span>}
      />

      <UnifiedCardBody>
        <UnifiedCardText className="text-[0.95rem] leading-relaxed text-zinc-300/90">
          {flashcard.body}
        </UnifiedCardText>

        <HashtagChipList
          hashtags={flashcard.hashtags}
          activeTags={activeHashtags}
          onToggle={onToggleHashtag}
          onRemove={(tag) => onRemoveHashtag(flashcard.id, tag)}
        />

        {flashcard.userAnnotation && (
          <div className={cn(
            "flex items-start gap-2 rounded-lg px-4 py-3 text-sm",
            flashcard.userAnnotation.includes("[JUDGE REJECTION]") 
              ? "border border-amber-200/80 bg-amber-50/80 text-amber-950 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100" 
              : flashcard.userAnnotation.includes("[HALLUCINATION")
                ? "border border-red-500/30 bg-red-500/10 text-red-200 shadow-[0_0_15px_rgba(239,68,68,0.1)]"
                : "bg-zinc-400/5 text-zinc-300"
          )}>
            <MessageSquare className={cn(
              "mt-0.5 h-4 w-4 shrink-0",
              flashcard.userAnnotation.includes("[JUDGE REJECTION]") ? "text-amber-600 dark:text-amber-400" : flashcard.userAnnotation.includes("[HALLUCINATION") ? "text-red-400 animate-pulse" : "opacity-70"
            )} />
            <p>
              {flashcard.userAnnotation.includes("[HALLUCINATION") 
                ? <span className="font-bold text-red-400">HALLUCINATION DETECTED: </span> 
                : null
              }
              {flashcard.userAnnotation
                .replace(/\[TRACE:[^\]]+\]/g, '')
                .replace(/\[QUALITY:[^\]]+\]/g, '')
                .replace(/\[TOPIC_ID:[^\]]+\]/g, '')
                .replace(/\[HALLUCINATION_REJECTED\]/g, '')
                .trim()
              }
            </p>
          </div>
        )}

        <UnifiedCardActions className="pt-2">
          <Button size="sm" className="h-9 shadow-sm bg-emerald-500 hover:bg-emerald-600 text-white border-none" onClick={() => onOpenAction(flashcard, "ACCEPT")} disabled={isBusy || isGenerating}>
            {isBusy && actionMode === "ACCEPT" && isActionOpen ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Accept
          </Button>
          <Button size="sm" variant="outline" className="h-9 border-red-500/50 hover:bg-red-500/10 hover:text-red-500 text-red-400" onClick={() => onOpenAction(flashcard, "DECLINE")} disabled={isBusy || isGenerating}>
            <X className="h-3.5 w-3.5" />
            Decline
          </Button>
          <Button size="sm" variant="outline" className="h-9 border-blue-500/50 hover:bg-blue-500/10 hover:text-blue-500 text-blue-400" onClick={() => onOpenAction(flashcard, "MODIFY_ACCEPT")} disabled={isBusy || isGenerating}>
            <PencilLine className="h-3.5 w-3.5" />
            Edit
          </Button>
        </UnifiedCardActions>

        {isActionOpen && actionMode && (
          <UnifiedCardSection className="space-y-4 bg-zinc-400/5 backdrop-blur-sm animate-in fade-in slide-in-from-top-2 duration-200">
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
      </UnifiedCardBody>

      <UnifiedCardFooter className="flex flex-col gap-4">
        <div className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Intelligence controls</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] uppercase font-bold tracking-tight text-white/70 hover:bg-violet-500/10 hover:text-violet-400" onClick={() => onCorrection({ flashcardId: flashcard.id, correctionType: "PIN" })} disabled={isBusy || isGenerating}>
              Pin Evidence
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] uppercase font-bold tracking-tight text-white/70 hover:bg-sky-500/10 hover:text-sky-400" onClick={() => onCorrection({ flashcardId: flashcard.id, correctionType: "REQUEST_REFRESH" })} disabled={isBusy || isGenerating}>
              Refresh
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] uppercase font-bold tracking-tight text-white/70 hover:bg-red-500/10 hover:text-red-400" onClick={() => onCorrection({ flashcardId: flashcard.id, correctionType: "MARK_WRONG" })} disabled={isBusy || isGenerating}>
              Mark Wrong
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] uppercase font-bold tracking-tight text-white/70 hover:bg-orange-500/10 hover:text-orange-400" onClick={() => onCorrection({ flashcardId: flashcard.id, correctionType: "HIDE" })} disabled={isBusy || isGenerating}>
              Archive
            </Button>
            {flashcard.sources.map(src => (
              <Button key={src.id} size="sm" variant="ghost" className="h-7 px-2 text-[10px] uppercase font-bold tracking-tight text-white/70 hover:bg-zinc-500/10 hover:text-zinc-400 border border-zinc-500/10" 
                onClick={() => {
                  if (confirm(`Suppress all future generation from "${src.sourceName}"?`)) {
                    onCorrection({ 
                      flashcardId: flashcard.id, 
                      correctionType: "SUPPRESS_SOURCE",
                      sourceId: src.sourceId,
                      sourceType: src.sourceType,
                      sourceName: src.sourceName
                    })
                  }
                }} 
                disabled={isBusy || isGenerating}
              >
                Suppress {src.sourceName.substring(0, 8)}..
              </Button>
            ))}
          </div>
        </div>
        
        {onConvert && (
          <div className="border-t border-zinc-200/5 pt-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Convert intelligence</p>
            <div className="flex flex-wrap gap-2">
              {cardType !== "KNOWLEDGE" && (
                <Button size="sm" variant="outline" className="h-7 px-2 text-[10px] uppercase font-bold tracking-tight border-zinc-500/20 text-zinc-400 hover:text-white" 
                  onClick={() => onConvert(flashcard.id, "KNOWLEDGE")}
                >
                  To Knowledge
                </Button>
              )}
              {cardType !== "GOAL" && (
                <Button size="sm" variant="outline" className="h-7 px-2 text-[10px] uppercase font-bold tracking-tight border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300" 
                  onClick={() => onConvert(flashcard.id, "GOAL")}
                >
                  To Strategic Goal
                </Button>
              )}
              {cardType !== "TASK" && (
                <Button size="sm" variant="outline" className="h-7 px-2 text-[10px] uppercase font-bold tracking-tight border-blue-500/20 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300" 
                  onClick={() => onConvert(flashcard.id, "TASK")}
                >
                  To Tactical Task
                </Button>
              )}
            </div>
          </div>
        )}
        
        {flashcard.actions.length > 0 && (
          <div className="border-t border-zinc-200/5 pt-3">
            <p className="text-[10px] text-zinc-500">
              Last seen {new Date(flashcard.refreshedAt).toLocaleDateString()}
            </p>
          </div>
        )}
      </UnifiedCardFooter>
    </UnifiedCard>
  );
}
