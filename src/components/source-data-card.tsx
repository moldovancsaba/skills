import { FileUp, Link2, Pencil, ScrollText, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StructuredActionRow, StructuredCard, StructuredChipRow } from "@/components/ui/structured-card";
import { HashtagChipList } from "@/components/ui/hashtag-chip-list";

type DataType = "source" | "file";

type SourceDataCardProps = {
  id: string;
  publicId: number | null;
  name: string;
  type: DataType;
  hashtags: string[];
  entityTag?: string | null;
  onStartEdit?: () => void;
  onDelete: () => void;
  activeHashtags?: string[];
  onToggleHashtag?: (tag: string) => void;
};

const typeIcon = {
  source: ScrollText,
  file: FileUp,
} satisfies Record<DataType, typeof ScrollText>;

/** Render raw source content while preserving line breaks exactly as entered. */
function RichContent({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div className="space-y-0.5">
      {lines.map((line, i) => {
        return (
          <p
            key={i}
            className="text-sm text-muted-foreground whitespace-pre-wrap break-words"
          >
            {line || "\u00A0"}
          </p>
        );
      })}
    </div>
  );
}

export function SourceDataCard({
  id,
  publicId,
  name,
  type,
  hashtags,
  entityTag,
  onStartEdit,
  onDelete,
  activeHashtags = [],
  onToggleHashtag,
}: SourceDataCardProps) {
  const Icon = typeIcon[type];

  // Check if content has newlines or structural chars (should render richly)
  const isRich = name.includes("\n") || name.includes("**") || name.includes("## ") || name.includes("- ");

  return (
    <StructuredCard
      chips={
        <StructuredChipRow>
          <Badge variant="secondary" className="font-mono">
            {publicId ? `#${publicId}` : `ID ${id.slice(0, 8)}`}
          </Badge>
          <Badge variant="outline" className="gap-1 capitalize">
            <Icon className="h-3.5 w-3.5" />
            {type}
          </Badge>
          {entityTag && (
            <Badge className="gap-1 bg-primary/10 text-primary border-primary/30 font-medium">
              <Link2 className="h-3 w-3" />
              <span>{entityTag}</span>
            </Badge>
          )}
          <HashtagChipList hashtags={hashtags} activeTags={activeHashtags} onToggle={onToggleHashtag} />
        </StructuredChipRow>
      }
      title={isRich ? <RichContent content={name} /> : name}
      body={
        isRich
          ? null
          : `${publicId ? `Source #${publicId}` : `Source ${id.slice(0, 8)}`} stored exactly as ingested.`
      }
      actions={
        <StructuredActionRow>
          {onStartEdit ? (
            <Button onClick={onStartEdit} variant="outline" size="sm">
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          ) : null}
          <Button onClick={onDelete} variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </StructuredActionRow>
      }
    />
  );
}
