/**
 * SOVEREIGN TASK CARD
 * v0.11.5-STABLE
 * 
 * A specialized UI component for reviewing and acting upon Next Best Action (NBA) items.
 * Prioritizes the ICE Score (Impact * Confidence * Ease) as the primary sorting and quality metric.
 */
import { Check, CheckCircle, Loader2, MessageSquare, PencilLine, Share2, X } from "lucide-react";

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
import { cn } from "@/lib/utils";
import { getIceColorClasses } from "@/lib/ice-colors";

/**
 * Valid action modes for task feedback.
 */
type ActionMode = "ACCEPT" | "DECLINE" | "MODIFY_ACCEPT";

/**
 * Tactical intelligence unit representing a proposed action.
 */
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
  const supporting = (
    <>
      <Badge variant="outline" className="font-mono text-[10px] tracking-wider border-zinc-200/20 text-zinc-400">
        {item.processingStatus.toUpperCase()}
      </Badge>
      <Badge variant="secondary" className="font-mono text-[10px] tracking-wider border-zinc-200/20 bg-zinc-800 text-zinc-300">
        TASK
      </Badge>
      <div className={cn("ml-auto flex items-center gap-3 text-[10px] font-bold uppercase tracking-tighter px-2 py-0.5 rounded-md border", getIceColorClasses(item.iceScore))}>
        <span>ICE {Math.round(item.iceScore)}</span>
      </div>
    </>
  );

  return (
    <UnifiedCard className={cn(item.processingStatus === "DECLINED" && "opacity-60")}>
      <UnifiedCardHeader supporting={supporting} title={item.title} />
      
      <UnifiedCardBody>
        <UnifiedCardText className="text-[0.95rem] leading-relaxed text-zinc-300/90">
          {item.description}
        </UnifiedCardText>

        <HashtagChipList
          hashtags={item.hashtags}
          activeTags={activeHashtags}
          onToggle={onToggleHashtag}
          onRemove={(tag) => onRemoveHashtag(item.id, tag)}
        />

        {item.userAnnotation && (
          <div className={`flex items-start gap-2 rounded-lg px-4 py-3 text-sm ${item.userAnnotation.includes("[JUDGE REJECTION]") ? "border border-amber-200/80 bg-amber-50/80 text-amber-950 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100" : "bg-zinc-400/5 text-zinc-300"}`}>
            <MessageSquare className={`mt-0.5 h-4 w-4 shrink-0 ${item.userAnnotation.includes("[JUDGE REJECTION]") ? "text-amber-600 dark:text-amber-400" : "opacity-70"}`} />
            <p>{item.userAnnotation}</p>
          </div>
        )}

        <UnifiedCardActions className="pt-2">
          <Button size="sm" variant="secondary" className="h-9 shadow-sm" onClick={() => onOpenAction(item, "ACCEPT")} disabled={isBusy}>
            <Check className="h-3.5 w-3.5" />
            Accept
          </Button>
          <Button size="sm" variant="outline" className="h-9 border-zinc-200/10 hover:bg-zinc-200/5" onClick={() => onOpenAction(item, "DECLINE")} disabled={isBusy}>
            <X className="h-3.5 w-3.5" />
            Decline
          </Button>
          <Button size="sm" variant="outline" className="h-9 border-zinc-200/10 hover:bg-zinc-200/5" onClick={() => onOpenAction(item, "MODIFY_ACCEPT")} disabled={isBusy}>
            <PencilLine className="h-3.5 w-3.5" />
            Edit
          </Button>
          <Button onClick={() => onShare(item)} variant="ghost" size="sm" title="Share" className="ml-auto h-9 text-zinc-500 hover:text-white">
            {copied ? <CheckCircle className="h-4 w-4 text-green-500" /> : <Share2 className="h-4 w-4" />}
            Share
          </Button>
        </UnifiedCardActions>

        {isActionOpen && actionMode && (
          <UnifiedCardSection className="space-y-4 bg-zinc-400/5 backdrop-blur-sm animate-in fade-in slide-in-from-top-2 duration-200">
            <p className="text-sm font-semibold text-white">
              {actionMode === "DECLINE" ? "Decline this task" : actionMode === "MODIFY_ACCEPT" ? "Modify and accept this task" : "Accept this task"}
            </p>

            {actionMode === "MODIFY_ACCEPT" && (
              <div className="space-y-3">
                <FormInput label="Title" value={draftTitle} onChange={(e) => onDraftTitleChange(e.target.value)} />
                <FormTextarea label="Description" value={draftDescription} onChange={(e) => onDraftDescriptionChange(e.target.value)} rows={3} />
              </div>
            )}

            <FormTextarea
              label={actionMode === "DECLINE" ? "Reason" : "Comment (optional)"}
              value={annotation}
              onChange={(e) => onAnnotationChange(e.target.value)}
              placeholder="Provide context for the AI..."
            />

            <div className="flex gap-2">
              <Button
                size="sm"
                variant={actionMode === "DECLINE" ? "destructive" : "default"}
                onClick={() => onSubmit(item.id, actionMode, annotation, actionMode === "MODIFY_ACCEPT" ? draftTitle : undefined, actionMode === "MODIFY_ACCEPT" ? draftDescription : undefined)}
                disabled={isBusy || (actionMode === "DECLINE" && !annotation.trim()) || (actionMode === "MODIFY_ACCEPT" && (!draftTitle.trim() || !draftDescription.trim()))}
              >
                {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Action"}
              </Button>
              <Button size="sm" variant="ghost" onClick={onCloseAction} disabled={isBusy}>Cancel</Button>
            </div>
          </UnifiedCardSection>
        )}
      </UnifiedCardBody>

      <UnifiedCardFooter>
        <div className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Intelligence controls</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] uppercase font-bold tracking-tight text-white/70 hover:bg-violet-500/10 hover:text-violet-400" title="Pin record as factual source">
              Pin Evidence
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] uppercase font-bold tracking-tight text-white/70 hover:bg-sky-500/10 hover:text-sky-400" title="Request AI re-evaluation">
              Refresh
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] uppercase font-bold tracking-tight text-white/70 hover:bg-orange-500/10 hover:text-orange-400" title="Move to archive">
              Archive
            </Button>
          </div>
        </div>
      </UnifiedCardFooter>
    </UnifiedCard>
  );
}
