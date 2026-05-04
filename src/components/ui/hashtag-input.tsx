"use client";

import { TagsInput } from "@mantine/core";
import { Hash } from "lucide-react";
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
  placeholder = "Add hashtags...",
}: HashtagInputProps) {
  
  const handleAdd = (val: string[]) => {
    const normalized = val.map(tag => normalizeHashtag(tag)).filter(Boolean) as string[];
    // Ensure unique and hashtag-formatted
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
      styles={{
        input: { backgroundColor: "rgba(0,0,0,0.2)" },
        pill: { backgroundColor: "var(--mantine-color-dark-6)", fontWeight: 700 }
      }}
    />
  );
}
