import { FileUp, Hash, Link2, Package, Pencil, Search, Trash2, Users, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/ui/form-fields";
import { StructuredActionRow, StructuredCard, StructuredChipRow } from "@/components/ui/structured-card";
import { normalizeHashtag } from "@/lib/hashtags";
import { useState } from "react";

type DataType = "product" | "customer" | "competitor" | "file";

type SourceDataCardProps = {
  id: string;
  publicId: number | null;
  name: string;
  type: DataType;
  hashtags: string[];
  entityTag?: string | null;
  isEditing: boolean;
  editName: string;
  editHashtags: string[];
  editEntityTag: string | null;
  onEditNameChange: (value: string) => void;
  onEditHashtagsChange: (tags: string[]) => void;
  onEditEntityTagChange: (tag: string | null) => void;
  onStartEdit: () => void;
  onSave: () => void;
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

        // Simple inline bold **text** rendering
        const rendered = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>');

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
            dangerouslySetInnerHTML={{ __html: rendered || "&nbsp;" }}
          />
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
  isEditing,
  editName,
  editHashtags,
  editEntityTag,
  onEditNameChange,
  onEditHashtagsChange,
  onEditEntityTagChange,
  onStartEdit,
  onSave,
  onDelete,
}: SourceDataCardProps) {
  const Icon = typeIcon[type];
  const [draftTag, setDraftTag] = useState("");

  const addTag = (input: string) => {
    const normalized = normalizeHashtag(input);
    if (!normalized || editHashtags.includes(normalized)) { setDraftTag(""); return; }
    onEditHashtagsChange([...editHashtags, normalized]);
    setDraftTag("");
  };

  const removeTag = (tag: string) => {
    onEditHashtagsChange(editHashtags.filter(t => t !== tag));
  };

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
          {entityTag && !isEditing && (
            <Badge className="gap-1 bg-primary/10 text-primary border-primary/30 font-medium">
              <Link2 className="h-3 w-3" />
              <span>{entityTag}</span>
              <span className="text-primary/50">›</span>
              {hashtags.filter(h => !SYSTEM_TAGS.includes(h)).map(h => (
                <span key={h}>{h}</span>
              ))}
            </Badge>
          )}
          {!entityTag && !isEditing && hashtags.map((tag) => (
            <Badge key={tag} variant="outline" className="gap-1 rounded-full">
              <Hash className="h-3 w-3" />
              {tag}
            </Badge>
          ))}
        </StructuredChipRow>
      }
      title={
        isEditing ? (
          <div className="space-y-3 w-full">
            <FormInput
              value={editName}
              onChange={(event) => onEditNameChange(event.target.value)}
              className="max-w-xl"
              onKeyDown={(event) => event.key === "Enter" && !event.shiftKey && onSave()}
              autoFocus
            />
            {/* Hashtag editor */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Hashtags</p>
              <div className="flex flex-wrap gap-1.5 items-center">
                {editHashtags.map(tag => (
                  <Badge key={tag} variant="secondary" className="pl-2 pr-1 py-1 flex items-center gap-1 bg-primary/10 text-primary border-primary/20">
                    <span className="text-xs font-semibold">{tag}</span>
                    <button type="button" onClick={() => removeTag(tag)} className="rounded-full hover:bg-primary/20 p-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <input
                  type="text"
                  value={draftTag}
                  onChange={e => setDraftTag(e.target.value)}
                  onKeyDown={e => {
                    if (["Enter", ",", "Tab"].includes(e.key)) { e.preventDefault(); addTag(draftTag); }
                  }}
                  onBlur={() => draftTag.trim() && addTag(draftTag)}
                  placeholder="+ add tag"
                  className="text-xs bg-transparent border-b border-dashed border-border/60 outline-none px-1 py-0.5 min-w-[60px] placeholder:text-muted-foreground/50 focus:border-primary"
                />
              </div>
            </div>
            {/* Entity tag editor */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Link2 className="w-3 h-3" /> About (Entity)</p>
              {editEntityTag ? (
                <div className="flex items-center gap-2">
                  <Badge className="bg-primary/10 text-primary border-primary/20 gap-1">
                    {editEntityTag}
                    <button type="button" onClick={() => onEditEntityTagChange(null)}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                </div>
              ) : (
                <input
                  type="text"
                  placeholder="Type entity to link (e.g. #nike)..."
                  className="text-xs bg-transparent border-b border-dashed border-border/60 outline-none px-1 py-0.5 w-full placeholder:text-muted-foreground/50 focus:border-primary"
                  onKeyDown={e => {
                    if (["Enter", "Tab"].includes(e.key)) {
                      e.preventDefault();
                      const val = normalizeHashtag((e.target as HTMLInputElement).value);
                      if (val) { onEditEntityTagChange(val); (e.target as HTMLInputElement).value = ""; }
                    }
                  }}
                />
              )}
            </div>
          </div>
        ) : isRich ? (
          <RichContent content={name} />
        ) : (
          name
        )
      }
      body={isEditing ? null : (isRich ? null : `${publicId ? `Source #${publicId}` : `Source ${id.slice(0, 8)}`} stored exactly as ingested.`)}
      actions={
        <StructuredActionRow>
          {type !== "file" ? (
            isEditing ? (
              <>
                <Button onClick={onSave} variant="outline" size="sm">
                  Save
                </Button>
                <Button onClick={onDelete} variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                  Cancel
                </Button>
              </>
            ) : (
              <Button onClick={onStartEdit} variant="outline" size="sm">
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            )
          ) : null}
          {!isEditing && (
            <Button onClick={onDelete} variant="ghost" size="sm">
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          )}
        </StructuredActionRow>
      }
    />
  );
}
