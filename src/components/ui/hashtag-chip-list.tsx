"use client";

import { IconHash as Hash, IconX as X } from "@tabler/icons-react";
import { Badge, Group, ActionIcon, UnstyledButton } from "@mantine/core";
import { displayHashtag, normalizeHashtagList } from "@/lib/hashtags";

type Props = {
  hashtags: string[];
  activeTags?: string[];
  onToggle?: (tag: string) => void;
  onRemove?: (tag: string) => void;
};

export function HashtagChipList({
  hashtags,
  activeTags = [],
  onToggle,
  onRemove,
}: Props) {
  const tags = normalizeHashtagList(hashtags);
  const active = new Set(normalizeHashtagList(activeTags));

  if (tags.length === 0) {
    return null;
  }

  return (
    <Group gap={6} wrap="wrap">
      {tags.map((tag) => {
        const isActive = active.has(tag);
        
        return (
          <Group key={tag} gap={2} align="center">
            <UnstyledButton 
              onClick={(event) => {
                event.stopPropagation();
                onToggle?.(tag);
              }}
              disabled={!onToggle}
              style={{ cursor: onToggle ? "pointer" : "default" }}
            >
              <Badge
                variant={isActive ? "filled" : "light"}
                color="gray"
                size="sm"
                leftSection={<Hash size={10} />}
              >
                {displayHashtag(tag)}
              </Badge>
            </UnstyledButton>
            
            {onRemove && (
              <ActionIcon 
                size="xs" 
                variant="subtle" 
                color="red" 
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(tag);
                }}
                
              >
                <X size={10} />
              </ActionIcon>
            )}
          </Group>
        );
      })}
    </Group>
  );
}
