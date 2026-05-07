import { IconFileUpload as FileUp, IconPencil as Pencil, IconFileText as ScrollText, IconTrash as Trash2, IconPin as Pin, IconRefresh as RefreshCw, IconArchive as Archive } from "@tabler/icons-react";
import { Badge, Button, Group, Stack, Text, Divider, Tooltip } from "@mantine/core";
import { getIceBadgeColor } from "@/lib/ice-colors";
import { stripTechnicalMetadata } from "@/lib/ui-utils";
import { 
  UnifiedCard, 
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
  type: DataType;
  intelligenceType?: "INTERNAL" | "COMPETITOR";
  hashtags: string[];
  iceScore?: number;
  onStartEdit?: () => void;
  onDelete: () => void;
  activeHashtags?: string[];
  onToggleHashtag?: (tag: string) => void;
  onConvert?: (id: string, targetType: "KNOWLEDGE" | "GOAL" | "TASK") => void;
};

const typeIcon = {
  source: ScrollText,
  file: FileUp,
} satisfies Record<DataType, typeof ScrollText>;

const DATA_CARD_COLOR = "blue" as const;

export function SourceDataCard({
  id,
  publicId,
  name,
  type,
  intelligenceType,
  hashtags,
  iceScore,
  onStartEdit,
  onDelete,
  activeHashtags = [],
  onToggleHashtag,
  onConvert,
}: SourceDataCardProps) {
  const Icon = typeIcon[type];
  const isCompetitor = intelligenceType === "COMPETITOR";

  const lines = name.split("\n");
  const firstLine = stripTechnicalMetadata(lines[0]);
  const bodyText = stripTechnicalMetadata(lines.slice(1).join("\n"));

  return (
    <UnifiedCard tone="ingress">
      <UnifiedCardHeader 
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
            <Badge color="ingress" variant="light" leftSection={<Icon size={10} />}>
              {type}
            </Badge>
            
            <Group gap={4} ml="auto">
              {typeof iceScore === "number" && (
                <Badge color={getIceBadgeColor(iceScore)}>
                  ICE {Math.round(iceScore)}
                </Badge>
              )}
              <Text size="xs" c="dimmed">
                #{publicId || id.slice(0, 8)}
              </Text>
            </Group>
          </Group>
        } 
        title={firstLine} 
      />
      
      <UnifiedCardBody>
        {bodyText && (
          <UnifiedCardText>
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
              onClick={() => onToggleHashtag?.(tag)}
            >
              #{tag}
            </Badge>
          ))}
        </Group>

        <UnifiedCardActions>
          {onStartEdit && (
            <Button variant="filled" color="ingress" size="sm" leftSection={<Pencil size={14} />} onClick={onStartEdit}>
              Edit
            </Button>
          )}
          <Button variant="outline" color="red" size="sm" leftSection={<Trash2 size={14} />} onClick={onDelete}>
            Delete
          </Button>
        </UnifiedCardActions>
      </UnifiedCardBody>

      <UnifiedCardFooter>
        <Stack gap="sm">
          <Text size="xs" c="dimmed">Intelligence Controls</Text>
          <Group gap="xs" wrap="wrap">
            <Tooltip label="Pin relevant evidence">
              <Button variant="subtle" size="compact-xs" color="ingress" leftSection={<Pin size={12} />}>
                Pin
              </Button>
            </Tooltip>
            <Tooltip label="Refresh knowledge">
              <Button variant="subtle" size="compact-xs" color="ingress" leftSection={<RefreshCw size={12} />}>
                Refresh
              </Button>
            </Tooltip>
            <Tooltip label="Archive intelligence">
              <Button variant="subtle" size="compact-xs" color="ingress" leftSection={<Archive size={12} />}>
                Archive
              </Button>
            </Tooltip>
          </Group>

          {onConvert && (
            <>
              <Divider my="xs" label="Convert Research Into" labelPosition="center" />
              <Group gap="xs" justify="center">
                <Button variant="outline" size="compact-xs" color="knowmore" onClick={() => onConvert(id, "KNOWLEDGE")}>Knowledge</Button>
                <Button variant="outline" size="compact-xs" color="strategy" onClick={() => onConvert(id, "GOAL")}>Goal</Button>
                <Button variant="outline" size="compact-xs" color="checklist" onClick={() => onConvert(id, "TASK")}>Task</Button>
              </Group>
            </>
          )}
        </Stack>
      </UnifiedCardFooter>
    </UnifiedCard>
  );
}
