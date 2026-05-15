"use client";
import { Text } from "@/components/ui/typography";

import React from "react";
import { MultiSelect, Group, Stack } from "@mantine/core";
import { IconGlobe as Globe, IconCheck as Check } from "@tabler/icons-react";
import { LANGUAGE_DEFINITIONS } from "@/lib/language-catalog";

export type Language = {
  id: string;
  label: string;
  nativeName: string;
  value: string;
};

export const LANGUAGES: Language[] = LANGUAGE_DEFINITIONS as Language[];

interface LanguageSelectorProps {
  selectedIds: string[];
  onChange: (newIds: string[]) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
}

export function LanguageSelector({
  selectedIds,
  onChange,
  disabled,
  label = "Permitted Languages",
  placeholder = "Select permitted languages for local AI synthesis...",
}: LanguageSelectorProps) {
  return (
    <MultiSelect
      label={label}
      placeholder={placeholder}
      data={LANGUAGES}
      value={selectedIds}
      onChange={onChange}
      disabled={disabled}
      searchable
      clearable
      hidePickedOptions
      leftSection={<Globe size={16} />}
      renderOption={({ option, checked }) => (
        <Group justify="space-between" flex={1}>
          <Stack gap={2}>
            <Text size="sm">{option.label}</Text>
            <Text size="xs" c="dimmed">
              {(option as Language).nativeName}
            </Text>
          </Stack>
          {checked && <Check size={14} color="var(--mantine-color-ingress-6)" />}
        </Group>
      )}
    />
  );
}
