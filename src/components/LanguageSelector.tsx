"use client";

import React from "react";
import { MultiSelect, Group, Text, Box, rem } from "@mantine/core";
import { Globe, Check } from "lucide-react";

export type Language = {
  id: string;
  label: string;
  nativeName: string;
};

export const LANGUAGES: Language[] = [
  { id: "zh", label: "Mandarin Chinese", nativeName: "中文 / 汉语" },
  { id: "en", label: "English", nativeName: "English" },
  { id: "hi", label: "Hindi", nativeName: "हिन्दी" },
  { id: "es", label: "Spanish", nativeName: "Español" },
  { id: "fr", label: "French", nativeName: "Français" },
  { id: "ar", label: "Modern Standard Arabic", nativeName: "العربية" },
  { id: "bn", label: "Bengali", nativeName: "বাংলা" },
  { id: "pt", label: "Portuguese", nativeName: "Português" },
  { id: "ru", label: "Russian", nativeName: "Русский" },
  { id: "ur", label: "Urdu", nativeName: "اردو" },
  { id: "id", label: "Indonesian", labelNative: "Bahasa Indonesia", nativeName: "Bahasa Indonesia" },
  { id: "de", label: "Standard German", nativeName: "Deutsch" },
  { id: "ja", label: "Japanese", nativeName: "日本語" },
  { id: "sw", label: "Swahili", nativeName: "Kiswahili" },
  { id: "mr", label: "Marathi", nativeName: "मराठी" },
  { id: "te", label: "Telugu", nativeName: "తెలుగు" },
  { id: "tr", label: "Turkish", nativeName: "Türkçe" },
  { id: "ta", label: "Tamil", nativeName: "தமிழ்" },
  { id: "yue", label: "Yue Chinese (Cantonese)", nativeName: "粵語" },
  { id: "vi", label: "Vietnamese", nativeName: "Tiếng Việt" },
  { id: "ko", label: "Korean", nativeName: "한국어 / 조선어" },
  { id: "it", label: "Italian", nativeName: "Italiano" },
  { id: "th", label: "Thai", nativeName: "ไทย" },
  { id: "gu", label: "Gujarati", nativeName: "ગુજરાતી" },
  { id: "fa", label: "Persian (Farsi)", nativeName: "فارسی" },
  { id: "pl", label: "Polish", nativeName: "Polski" },
  { id: "uk", label: "Ukrainian", nativeName: "Українська" },
  { id: "ml", label: "Malayalam", nativeName: "മലയാളം" },
  { id: "kn", label: "Kannada", nativeName: "కన్నడ" },
  { id: "or", label: "Odia", nativeName: "ଓଡ଼ିଆ" },
  { id: "pa", label: "Punjabi", nativeName: "ਪੰਜਾਬੀ" },
  { id: "ro", label: "Romanian", nativeName: "Română" },
  { id: "nl", label: "Dutch", nativeName: "Nederlands" },
  { id: "az", label: "Azerbaijani", nativeName: "Azərbaycan dili" },
  { id: "ku", label: "Kurdish (Kurmanji)", nativeName: "Kurdî" },
  { id: "ha", label: "Hausa", nativeName: "Hausa" },
  { id: "my", label: "Burmese", nativeName: "မြန်မာဘာသာ" },
  { id: "am", label: "Amharic", nativeName: "አማርኛ" },
  { id: "yo", label: "Yoruba", nativeName: "Yorùbá" },
  { id: "sd", label: "Sindhi", nativeName: "سنڌي" },
  { id: "si", label: "Sinhala", nativeName: "සිංහල" },
  { id: "km", label: "Khmer", nativeName: "ខ្មែរ" },
  { id: "ne", label: "Nepali", nativeName: "नेपाली" },
  { id: "ps", label: "Pashto", nativeName: "ਪښਤो" },
  { id: "zu", label: "Zulu", nativeName: "isiZulu" },
  { id: "cs", label: "Czech", nativeName: "Čeština" },
  { id: "hu", label: "Hungarian", nativeName: "Magyar" },
  { id: "el", label: "Greek", nativeName: "Ελληνικά" },
  { id: "sv", label: "Swedish", nativeName: "Svenska" },
  { id: "fi", label: "Finnish", nativeName: "Suomi" },
].map(l => ({ ...l, value: l.label })); // Use label as value for consistency with prompt logic

interface LanguageSelectorProps {
  selectedIds: string[];
  onChange: (newIds: string[]) => void;
  disabled?: boolean;
}

export function LanguageSelector({ selectedIds, onChange, disabled }: LanguageSelectorProps) {
  return (
    <MultiSelect
      label="Permitted Languages"
      placeholder="Select languages for AI synthesis..."
      data={LANGUAGES}
      value={selectedIds}
      onChange={onChange}
      disabled={disabled}
      searchable
      clearable
      hidePickedOptions
      radius="md"
      leftSection={<Globe size={16} />}
      renderOption={({ option, checked }) => (
        <Group justify="space-between" flex={1}>
          <Stack gap={2}>
            <Text size="sm" fw={500}>{option.label}</Text>
            <Text size="xs" c="dimmed" ff="monospace" lts={1}>{(option as any).nativeName}</Text>
          </Stack>
          {checked && <Check size={14} color="var(--mantine-color-brand-6)" />}
        </Group>
      )}
      styles={{
        input: { backgroundColor: "rgba(0,0,0,0.2)" },
        pill: { backgroundColor: "var(--mantine-color-brand-9)", fontWeight: 700 }
      }}
    />
  );
}
