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
    />
  );
}
