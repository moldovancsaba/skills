import { FileUp, Hash, Link2, Package, Pencil, Search, Trash2, Users, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/ui/form-fields";
import { HashtagInput } from "@/components/ui/hashtag-input";
import { EntityTagSelector } from "@/components/ui/entity-tag-selector";
import { StructuredActionRow, StructuredCard, StructuredChipRow } from "@/components/ui/structured-card";

type DataType = "product" | "customer" | "competitor" | "file";

type SourceDataCardProps = {
  id: string;
  publicId: number | null;
  name: string;
  type: DataType;
  hashtags: string[];
  entityTag?: string | null;
  isEditing?: boolean;
  editName?: string;
  editHashtags?: string[];
  editEntityTag?: string | null;
  hashtagSuggestions?: string[];
  entitySuggestions?: string[];
  onEditNameChange?: (value: string) => void;
  onEditHashtagsChange?: (tags: string[]) => void;
  onEditEntityTagChange?: (tag: string | null) => void;
  onStartEdit?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
  onDelete: () => void;
};

const typeIcon = {
  product: Package,
  customer: Users,
  competitor: Search,
  file: FileUp,
} satisfies Record<DataType, typeof Package>;

const SYSTEM_TAGS = ["#product", "#customer", "#competitor", "#file"];

/** Render a string with preserved newlines and simple markdown-like formatting */
function RichContent({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div className="space-y-0.5">
      {lines.map((line, i) => {
        const trimmed = line.trimStart();
        const isBullet = trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("• ");
        const isHeading = trimmed.startsWith("## ") || trimmed.startsWith("# ");
        const isHr = /^---+$/.test(trimmed);
        
        if (isHr) return <hr key={i} className="border-border/40 my-1" />;

        const text = isHeading 
          ? trimmed.replace(/^#+\s/, "")
          : isBullet ? trimmed.replace(/^[-*•]\s/, "")
          : line;

        // Safe parsing: Split by markdown-like markers and render as components
        const parts = text.split(/(\*\*.*?\*\*|\*.*?\*)/g);

        return (
          <p
            key={i}
            className={
              isHeading
                ? "text-sm font-semibold text-foreground mt-2 first:mt-0"
                : isBullet
                ? "text-sm text-muted-foreground pl-3 relative before:absolute before:left-0 before:content-['·'] before:text-primary"
                : "text-sm text-muted-foreground"
            }
          >
            {parts.map((part, j) => {
              if (part.startsWith("**") && part.endsWith("**")) {
                return <strong key={j}>{part.slice(2, -2)}</strong>;
              }
              if (part.startsWith("*") && part.endsWith("*")) {
                return <em key={j}>{part.slice(1, -1)}</em>;
              }
              return part || (j === 0 ? "\u00A0" : "");
            })}
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
  isEditing = false,
  editName = "",
  editHashtags = [],
  editEntityTag = null,
  hashtagSuggestions = [],
  entitySuggestions = [],
  onEditNameChange,
  onEditHashtagsChange,
  onEditEntityTagChange,
  onStartEdit,
  onSave,
  onCancel,
  onDelete,
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
              <span className="text-primary/50">›</span>
              {hashtags.filter(h => !SYSTEM_TAGS.includes(h)).map(h => (
                <span key={h}>{h}</span>
              ))}
            </Badge>
          )}
          {!entityTag && hashtags.map((tag) => (
            <Badge key={tag} variant="outline" className="gap-1 rounded-full">
              <Hash className="h-3 w-3" />
              {tag}
            </Badge>
          ))}
        </StructuredChipRow>
      }
      title={
        isEditing ? (
          <div className="space-y-4">
            <FormInput
              value={editName}
              onChange={(event) => onEditNameChange?.(event.target.value)}
              className="max-w-xl"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  onSave?.();
                }
              }}
              autoFocus
            />
            <HashtagInput
              value={editHashtags}
              onChange={(tags) => onEditHashtagsChange?.(tags)}
              suggestions={hashtagSuggestions}
              label="Hashtags"
              placeholder="Add hashtags"
            />
            <EntityTagSelector
              value={editEntityTag}
              onChange={(tag) => onEditEntityTagChange?.(tag)}
              suggestions={entitySuggestions}
              label="About (Entity)"
              placeholder="Which entity is this about?"
            />
          </div>
        ) : isRich ? (
          <RichContent content={name} />
        ) : (
          name
        )
      }
      body={
        isEditing
          ? "Update the raw source label, hashtags, and related entity before saving."
          : isRich
            ? null
            : `${publicId ? `Source #${publicId}` : `Source ${id.slice(0, 8)}`} stored exactly as ingested.`
      }
      actions={
        <StructuredActionRow>
          {isEditing ? (
            <>
              <Button onClick={onSave} variant="outline" size="sm">
                Save
              </Button>
              <Button onClick={onCancel} variant="ghost" size="sm">
                <X className="h-4 w-4" />
                Cancel
              </Button>
            </>
          ) : (
            <Button onClick={onStartEdit} variant="outline" size="sm">
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          )}
          <Button onClick={onDelete} variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </StructuredActionRow>
      }
    />
  );
}
