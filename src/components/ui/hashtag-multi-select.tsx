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
  Transition,
  rem,
  TextInput,
  ThemeIcon
} from "@mantine/core";
import { useClickOutside } from "@mantine/hooks";
import { normalizeHashtag } from "@/lib/hashtags";

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
        <Text size="sm" fw={700} c="dimmed" tt="uppercase" lts={1}>
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
          border: `1px solid ${error ? 'var(--mantine-color-red-filled)' : isOpen ? 'var(--mantine-color-brand-filled)' : 'var(--mantine-color-dark-4)'}`,
          backgroundColor: 'rgba(0,0,0,0.2)',
          padding: '4px 12px',
          transition: 'all 0.2s ease',
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
              variant="light" 
              color="brand"
              size="md"
              radius="sm"
              fw={900}
              tt="none"
              rightSection={
                <ActionIcon 
                  size="xs" 
                  color="brand" 
                  variant="transparent"
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

          <input
            ref={inputRef}
            type="text"
            style={{
              flex: 1,
              minWidth: rem(120),
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'white',
              fontSize: 'var(--mantine-font-size-sm)',
              padding: '4px 0'
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

        <Transition mounted={isOpen && (filteredSuggestions.length > 0 || showAddNew)} transition="pop-top-left" duration={200} timingFunction="ease">
          {(styles) => (
            <Box 
              style={{
                ...styles,
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 1000,
                marginTop: rem(8),
                borderRadius: 'var(--mantine-radius-lg)',
                border: '1px solid var(--mantine-color-dark-4)',
                backgroundColor: 'rgba(20, 20, 20, 0.95)',
                backdropFilter: 'blur(16px)',
                padding: rem(4),
                boxShadow: '0 20px 40px rgba(0,0,0,0.4)'
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
                      style={(theme) => ({
                        borderRadius: 'var(--mantine-radius-md)',
                        transition: 'background 0.2s ease',
                        '&:hover': {
                          backgroundColor: 'light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05))',
                        }
                      })}
                    >
                      <Group justify="space-between">
                        <Group gap="xs">
                          <ThemeIcon variant="transparent" color="brand" size="xs">
                            <Hash size={14} />
                          </ThemeIcon>
                          <Text size="sm" fw={600}>{suggestion}</Text>
                        </Group>
                        <Check size={14} color="var(--mantine-color-brand-filled)" style={{ opacity: 0.6 }} />
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
                      style={(theme) => ({
                        borderRadius: 'var(--mantine-radius-md)',
                        borderTop: '1px solid var(--mantine-color-dark-4)',
                        marginTop: rem(2),
                        paddingTop: rem(8),
                        '&:hover': {
                          backgroundColor: 'light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05))',
                        }
                      })}
                    >
                      <Group gap="xs">
                        <ThemeIcon variant="light" color="brand" size="sm" radius="xl">
                          <Plus size={14} />
                        </ThemeIcon>
                        <Text size="sm" fw={800} c="brand">
                          Add Focus: <Text span fw={900} td="underline">{normalizeHashtag(inputValue)}</Text>
                        </Text>
                      </Group>
                    </UnstyledButton>
                  )}
                </Stack>
              </ScrollArea.Autosize>
            </Box>
          )}
        </Transition>
      </Box>
      
      {error && <Text size="xs" c="red" fw={700} mt={2}>{error}</Text>}
    </Stack>
  );
}
