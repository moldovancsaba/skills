import { FileUp, Hash, Package, Pencil, Search, Trash2, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/ui/form-fields";
import { StructuredActionRow, StructuredCard, StructuredChipRow } from "@/components/ui/structured-card";

type DataType = "product" | "customer" | "competitor" | "file";

type SourceDataCardProps = {
  id: string;
  publicId: number | null;
  name: string;
  type: DataType;
  hashtags: string[];
  isEditing: boolean;
  editName: string;
  onEditNameChange: (value: string) => void;
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

export function SourceDataCard({
  id,
  publicId,
  name,
  type,
  hashtags,
  isEditing,
  editName,
  onEditNameChange,
  onStartEdit,
  onSave,
  onDelete,
}: SourceDataCardProps) {
  const Icon = typeIcon[type];

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
          <Badge variant="outline">Raw data</Badge>
          {hashtags.map((tag) => (
            <Badge key={tag} variant="outline" className="gap-1 rounded-full">
              <Hash className="h-3 w-3" />
              {tag}
            </Badge>
          ))}
        </StructuredChipRow>
      }
      title={
        isEditing ? (
          <FormInput
            value={editName}
            onChange={(event) => onEditNameChange(event.target.value)}
            className="max-w-xl"
            onKeyDown={(event) => event.key === "Enter" && onSave()}
            autoFocus
          />
        ) : (
          name
        )
      }
      body={`${publicId ? `Source #${publicId}` : `Source ${id.slice(0, 8)}`} stored exactly as ingested. Processing belongs to Knowmore and Checklist, not the raw data layer.`}
      actions={
        <StructuredActionRow>
          {type !== "file" ? (
            isEditing ? (
              <Button onClick={onSave} variant="outline" size="sm">
                Save
              </Button>
            ) : (
              <Button onClick={onStartEdit} variant="outline" size="sm">
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            )
          ) : null}
          <Button onClick={onDelete} variant="ghost" size="sm">
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </StructuredActionRow>
      }
    />
  );
}
