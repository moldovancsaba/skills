"use client";

import * as React from "react";
import { useState, useRef } from "react";
import { IconX as X, IconPlus as Plus, IconSearch as Search, IconCheck as Check, IconHash as Hash } from "@tabler/icons-react";
import { 
  Stack, 
  Text, 
  Box, 
  Badge, 
  Group, 
  ActionIcon, 
  ScrollArea, 
  UnstyledButton,
  InputBase,
  rem,
  ThemeIcon
} from "@mantine/core";
import { useClickOutside } from "@mantine/hooks";
import { normalizeHashtag } from "@/lib/hashtags";
import { getSemanticHoverStyle, getSemanticInsetStyle, getSemanticSurfaceStyle } from "@/lib/semantic-theme";

interface HashtagMultiSelectProps {
  label?: string;
  placeholder?: string;
  selected: string[];
  onChange: (selected: string[]) => void;
  suggestions?: string[];
  error?: string;
}

export function HashtagMultiSelect({
  label,
  placeholder = "Search or establish focus...",
  selected,
  onChange,
  suggestions = [],
  error,
}: HashtagMultiSelectProps) {
  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useClickOutside(() => setIsOpen(false));

  const filteredSuggestions = suggestions.filter(
    (s) => 
      s.toLowerCase().includes(inputValue.toLowerCase()) && 
      !selected.includes(s)
  );

  const showAddNew = 
    inputValue.trim() !== "" && 
    !suggestions.some(s => s.toLowerCase() === normalizeHashtag(inputValue)) && 
    !selected.includes(normalizeHashtag(inputValue) || "");

  const suggestionItemBaseStyle = {
    borderRadius: 'var(--mantine-radius-md)',
  };

  const createSuggestionBaseStyle = {
    ...suggestionItemBaseStyle,
    borderTop: '1px solid var(--surface-section-border)',
    marginTop: rem(2),
    paddingTop: rem(8),
  };

  const handleAddTag = (tag: string) => {
    const normalized = normalizeHashtag(tag);
    if (normalized && !selected.includes(normalized)) {
      onChange([...selected, normalized]);
    }
    setInputValue("");
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleRemoveTag = (tag: string) => {
    onChange(selected.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && inputValue.trim()) {
      e.preventDefault();
      handleAddTag(inputValue);
    } else if (e.key === "Backspace" && !inputValue && selected.length > 0) {
      handleRemoveTag(selected[selected.length - 1]);
    }
  };

  return (
    <Stack gap={4} ref={containerRef}>
      {label && (
        <Text c="dimmed">
          {label}
        </Text>
      )}
      
      <Box
        pos="relative"
        onClick={() => {
          setIsOpen(true);
          inputRef.current?.focus();
        }}
        style={{
          minHeight: rem(42),
          borderRadius: 'var(--mantine-radius-md)',
          ...getSemanticInsetStyle(isOpen ? "ingress" : "neutral"),
          borderColor: error ? "var(--module-review-color)" : isOpen ? "var(--module-ingress-color)" : "var(--surface-section-border)",
          padding: '4px 12px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: rem(6),
          alignItems: 'center'
        }}
      >
        <Group gap={6}>
          {selected.map((tag) => (
            <Badge 
              key={tag}
              color="ingress"
              size="md"
              rightSection={
                <ActionIcon 
                  size="xs" 
                  color="ingress" 
                  variant="subtle"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveTag(tag);
                  }}
                >
                  <X size={10} />
                </ActionIcon>
              }
            >
              {tag}
            </Badge>
          ))}

          <InputBase
            component="input"
            variant="unstyled"
            ref={inputRef}
            type="text"
            flex={1}
            miw={rem(120)}
            styles={{
              input: {
                color: 'var(--text-primary)',
                padding: '4px 0',
              },
            }}
            placeholder={selected.length === 0 ? placeholder : ""}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
          />
        </Group>

        {isOpen && (filteredSuggestions.length > 0 || showAddNew) && (
          <Box
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 1000,
              marginTop: rem(8),
              borderRadius: 'var(--mantine-radius-lg)',
              ...getSemanticSurfaceStyle("neutral", { elevated: true }),
              padding: rem(4)
            }}
          >
              <ScrollArea.Autosize mah={240}>
                <Stack gap={2}>
                  {filteredSuggestions.map((suggestion) => (
                    <UnstyledButton
                      key={suggestion}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddTag(suggestion);
                      }}
                      p="xs"
                      style={suggestionItemBaseStyle}
                      onMouseEnter={(event) => {
                        Object.assign(event.currentTarget.style, getSemanticHoverStyle("ingress"));
                      }}
                      onMouseLeave={(event) => {
                        Object.assign(event.currentTarget.style, suggestionItemBaseStyle);
                      }}
                    >
                      <Group justify="space-between">
                        <Group gap="xs">
                          <ThemeIcon variant="subtle" color="ingress" size="xs">
                            <Hash size={14} />
                          </ThemeIcon>
                          <Text>{suggestion}</Text>
                        </Group>
                        <Check size={14} color="var(--module-ingress-color)" opacity={0.6} />
                      </Group>
                    </UnstyledButton>
                  ))}
                  
                  {showAddNew && (
                    <UnstyledButton
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddTag(inputValue);
                      }}
                      p="xs"
                      style={createSuggestionBaseStyle}
                      onMouseEnter={(event) => {
                        Object.assign(event.currentTarget.style, getSemanticHoverStyle("ingress"));
                      }}
                      onMouseLeave={(event) => {
                        Object.assign(event.currentTarget.style, createSuggestionBaseStyle);
                      }}
                    >
                      <Group gap="xs">
                        <ThemeIcon variant="light" color="ingress" size="sm" >
                          <Plus size={14} />
                        </ThemeIcon>
                        <Text c="ingress">
                          Add Focus: <Text span td="underline">{normalizeHashtag(inputValue)}</Text>
                        </Text>
                      </Group>
                    </UnstyledButton>
                  )}
                </Stack>
              </ScrollArea.Autosize>
          </Box>
        )}
      </Box>
      
      {error && <Text c="review" mt={2}>{error}</Text>}
    </Stack>
  );
}
