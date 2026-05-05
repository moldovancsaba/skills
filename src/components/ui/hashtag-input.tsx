"use client";

import { TagsInput, rem } from "@mantine/core";
import { IconHash as Hash } from "@tabler/icons-react";
import { normalizeHashtag } from "@/lib/hashtags";

type HashtagInputProps = {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
  label?: string;
  placeholder?: string;
};

export function HashtagInput({
  value,
  onChange,
  suggestions = [],
  label = "Hashtags",
  placeholder = "Add strategic anchors...",
}: HashtagInputProps) {
  
  const handleAdd = (val: string[]) => {
    const normalized = val.map(tag => normalizeHashtag(tag)).filter(Boolean) as string[];
    onChange(Array.from(new Set(normalized)));
  };

  return (
    <TagsInput
      label={label}
      placeholder={placeholder}
      value={value}
      onChange={handleAdd}
      data={suggestions}
      leftSection={<Hash size={14} />}
      clearable
      splitChars={[',', ' ', '|']}
      maxTags={15}
      radius="md"
      styles={(theme) => ({
        input: { 
          backgroundColor: 'light-dark(rgba(0, 0, 0, 0.02), rgba(255, 255, 255, 0.03))',
          border: `1px solid light-dark(rgba(0, 0, 0, 0.1), rgba(255, 255, 255, 0.1))`,
          minHeight: rem(42)
        },
        label: { 
          fontWeight: 700, 
          marginBottom: rem(4),
          fontSize: theme.fontSizes.sm,
          color: 'light-dark(var(--mantine-color-gray-7), var(--mantine-color-dark-2))'
        },
        pill: { 
          backgroundColor: 'light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-6))',
          color: 'light-dark(black, white)',
          fontWeight: 800,
          border: `1px solid light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.1))`
        }
      })}
    />
  );
}
