import { IconFileUpload as FileUp, IconPencil as Pencil, IconFileText as ScrollText, IconTrash as Trash2 } from "@/components/gds/icons";
import { Badge, Button, Group, Stack, Divider } from "@/components/gds/primitives";
import { getIceBadgeColor } from "@/lib/ice-colors";
import { getDataCardFreshness } from "@/lib/card-freshness";
import { stripTechnicalMetadata } from "@/lib/ui-utils";
import { CardShareAction } from "@/components/ui/card-share-action";
import { MetaText } from "@/components/ui/typography";
import { 
  UnifiedCard, 
  UnifiedCardFreshnessBadge,
  UnifiedCardHeader, 
  UnifiedCardBody, 
  UnifiedCardText, 
  UnifiedCardActions,
  UnifiedCardFooter 
} from "@/components/ui/unified-card";

type DataType = "source" | "file";

type SourceDataCardProps = {
  id: string;
  publicId: number | null;
  name: string;
  body?: string;
  type: DataType;
  onOpenDetail?: () => void;
  detailMode?: boolean;
  intelligenceType?: "INTERNAL" | "COMPETITOR";
  departmentKey?: string | null;
  hashtags: string[];
  iceScore?: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  onStartEdit?: () => void;
  onDelete: () => void;
  activeHashtags?: string[];
  onToggleHashtag?: (tag: string) => void;
  onConvert?: (id: string, targetType: "KNOWLEDGE" | "GOAL" | "TASK", sourceType: DataType) => void;
};

const typeIcon = {
  source: ScrollText,
  file: FileUp,
} satisfies Record<DataType, typeof ScrollText>;

export function SourceDataCard({
  id,
  publicId,
  name,
  body,
  type,
  onOpenDetail,
  detailMode = false,
  intelligenceType,
  departmentKey,
  hashtags,
  iceScore,
  createdAt,
  updatedAt,
  onStartEdit,
  onDelete,
  activeHashtags = [],
  onToggleHashtag,
  onConvert,
}: SourceDataCardProps) {
  const Icon = typeIcon[type];
  const isCompetitor = intelligenceType === "COMPETITOR";
  const stopCardClick = (event: { stopPropagation: () => void }, callback?: () => void) => {
    event.stopPropagation();
    callback?.();
  };

  const lines = name.split("\n");
  const firstLine = type === "file" ? stripTechnicalMetadata(name) : stripTechnicalMetadata(lines[0]);
  const bodyText = stripTechnicalMetadata(type === "file" ? body || "" : lines.slice(1).join("\n"));
  const freshness = getDataCardFreshness({ createdAt, updatedAt });

  return (
    <UnifiedCard tone="ingress" onClick={onOpenDetail}>
      <UnifiedCardHeader 
        clampTitle={!detailMode}
        supporting={
          <Group gap="xs">
            <Badge color="ingress" variant="light">
              Datacard
            </Badge>
            <Badge 
              color={isCompetitor ? "review" : "ingress"}
              variant="light"
            >
              {isCompetitor ? "Competitor" : "Internal"}
            </Badge>
            {departmentKey ? (
              <Badge color="strategy" variant="light">
                {departmentKey}
              </Badge>
            ) : null}
            <Badge color="ingress" variant="light" leftSection={<Icon size={10} />}>
              {type}
            </Badge>
            <UnifiedCardFreshnessBadge freshness={freshness} />
            
            <Group gap={4} ml="auto">
              {typeof iceScore === "number" && (
                <Badge color={getIceBadgeColor(iceScore)}>
                  ICE {Math.round(iceScore)}
                </Badge>
              )}
              <MetaText>#{publicId || id.slice(0, 8)}</MetaText>
            </Group>
          </Group>
        } 
        title={firstLine} 
      />
      
      <UnifiedCardBody>
        {bodyText && (
          <UnifiedCardText disablePreview={detailMode} markdown>
            {bodyText}
          </UnifiedCardText>
        )}

        <Group gap={4} wrap="wrap">
          {hashtags.map(tag => (
            <Badge 
              key={tag} 
              variant={activeHashtags.includes(tag) ? "filled" : "outline"}
              color="ingress"
              size="xs"
              onClick={(event) => stopCardClick(event, () => onToggleHashtag?.(tag))}
            >
              #{tag}
            </Badge>
          ))}
        </Group>

        <UnifiedCardActions>
          {onStartEdit && (
            <Button variant="filled" color="ingress" size="sm" leftSection={<Pencil size={14} />} onClick={(event) => stopCardClick(event, onStartEdit)}>
              Edit
            </Button>
          )}
          <Button variant="outline" color="review" size="sm" leftSection={<Trash2 size={14} />} onClick={(event) => stopCardClick(event, onDelete)}>
            Delete
          </Button>
          <Group ml="auto">
            <CardShareAction cardId={id} />
          </Group>
        </UnifiedCardActions>
      </UnifiedCardBody>

      {onConvert ? (
        <UnifiedCardFooter>
          <Stack gap="sm">
            <Divider my="xs" label="Convert Research Into" labelPosition="center" />
            <Group gap="xs" justify="center">
              <Button variant="outline" size="compact-xs" color="knowmore" onClick={(event) => stopCardClick(event, () => onConvert(id, "KNOWLEDGE", type))}>Knowledge</Button>
              <Button variant="outline" size="compact-xs" color="strategy" onClick={(event) => stopCardClick(event, () => onConvert(id, "GOAL", type))}>Goal</Button>
              <Button variant="outline" size="compact-xs" color="checklist" onClick={(event) => stopCardClick(event, () => onConvert(id, "TASK", type))}>Task</Button>
            </Group>
          </Stack>
        </UnifiedCardFooter>
      ) : null}
    </UnifiedCard>
  );
}
