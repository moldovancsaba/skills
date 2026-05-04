import { FileUp, Link2, Pencil, ScrollText, Trash2, MessageSquare } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  UnifiedCard, 
  UnifiedCardHeader, 
  UnifiedCardBody, 
  UnifiedCardText, 
  UnifiedCardActions,
  UnifiedCardFooter 
} from "@/components/ui/unified-card";
import { HashtagChipList } from "@/components/ui/hashtag-chip-list";
import { cn } from "@/lib/utils";
import { getIceColorClasses } from "@/lib/ice-colors";

type DataType = "source" | "file";

type SourceDataCardProps = {
  id: string;
  publicId: number | null;
  name: string;
  type: DataType;
  intelligenceType?: "INTERNAL" | "COMPETITOR";
  hashtags: string[];
  iceScore?: number;
  onStartEdit?: () => void;
  onDelete: () => void;
  activeHashtags?: string[];
  onToggleHashtag?: (tag: string) => void;
};

const typeIcon = {
  source: ScrollText,
  file: FileUp,
} satisfies Record<DataType, typeof ScrollText>;

export function SourceDataCard({
  id,
  publicId,
  name,
  type,
  intelligenceType,
  hashtags,
  iceScore = 50,
  onStartEdit,
  onDelete,
  activeHashtags = [],
  onToggleHashtag,
}: SourceDataCardProps) {
  const Icon = typeIcon[type];
  const isCompetitor = intelligenceType === "COMPETITOR";

  const badges = (
    <>
      <Badge variant="outline" className="font-mono text-[10px] tracking-wider border-zinc-200/20 text-zinc-400">
        DATACARD
      </Badge>
      <Badge 
        variant="secondary" 
        className={cn(
          "font-mono text-[10px] tracking-wider border-zinc-200/20 gap-1 capitalize",
          isCompetitor ? "bg-amber-500/10 text-amber-500 border-amber-500/20" : "bg-zinc-800 text-zinc-300"
        )}
      >
        {isCompetitor ? "Competitor" : "Internal"}
      </Badge>
      <Badge variant="secondary" className="font-mono text-[10px] tracking-wider border-zinc-200/20 bg-zinc-800 text-zinc-300 gap-1 capitalize">
        <Icon className="h-3 w-3" />
        {type}
      </Badge>
      <div className={cn("ml-auto flex items-center gap-3 text-[10px] font-bold uppercase tracking-tighter px-2 py-0.5 rounded-md border", getIceColorClasses(iceScore))}>
        <span title="Data stage default minimum requirement.">ICE {iceScore}</span>
      </div>
      <div className="text-[10px] font-mono text-zinc-500">
        #{publicId || id.slice(0, 8)}
      </div>
    </>
  );

  const firstLine = name.split("\n")[0].trim();
  const displayTitle = firstLine.length > 80 ? firstLine.slice(0, 80) + "..." : firstLine;

  return (
    <UnifiedCard>
      <UnifiedCardHeader supporting={badges} title={displayTitle} />
      
      <UnifiedCardBody>
        <UnifiedCardText className="line-clamp-4 whitespace-pre-wrap">
          {name}
        </UnifiedCardText>

        <HashtagChipList hashtags={hashtags} activeTags={activeHashtags} onToggle={onToggleHashtag} />

        <UnifiedCardActions>
          {onStartEdit ? (
            <Button onClick={onStartEdit} variant="secondary" size="sm" className="h-9">
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          ) : null}
          <Button onClick={onDelete} variant="outline" size="sm" className="h-9 border-zinc-200/10 text-zinc-400 hover:text-destructive hover:bg-destructive/10">
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </UnifiedCardActions>
      </UnifiedCardBody>

      <UnifiedCardFooter>
        <div className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Intelligence controls</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] uppercase font-bold tracking-tight text-white/70 hover:bg-violet-500/10 hover:text-violet-400">
              Pin Evidence
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] uppercase font-bold tracking-tight text-white/70 hover:bg-sky-500/10 hover:text-sky-400">
              Refresh
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] uppercase font-bold tracking-tight text-white/70 hover:bg-orange-500/10 hover:text-orange-400">
              Archive
            </Button>
          </div>
        </div>
      </UnifiedCardFooter>
    </UnifiedCard>
  );
}
