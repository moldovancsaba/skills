"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { Search, X, Check, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export type Language = {
  id: string;
  englishName: string;
  nativeName: string;
};

export const LANGUAGES: Language[] = [
  { id: "zh", englishName: "Mandarin Chinese", nativeName: "中文 / 汉语" },
  { id: "en", englishName: "English", nativeName: "English" },
  { id: "hi", englishName: "Hindi", nativeName: "हिन्दी" },
  { id: "es", englishName: "Spanish", nativeName: "Español" },
  { id: "fr", englishName: "French", nativeName: "Français" },
  { id: "ar", englishName: "Modern Standard Arabic", nativeName: "العربية" },
  { id: "bn", englishName: "Bengali", nativeName: "বাংলা" },
  { id: "pt", englishName: "Portuguese", nativeName: "Português" },
  { id: "ru", englishName: "Russian", nativeName: "Русский" },
  { id: "ur", englishName: "Urdu", nativeName: "اردو" },
  { id: "id", englishName: "Indonesian", nativeName: "Bahasa Indonesia" },
  { id: "de", englishName: "Standard German", nativeName: "Deutsch" },
  { id: "ja", englishName: "Japanese", nativeName: "日本語" },
  { id: "sw", englishName: "Swahili", nativeName: "Kiswahili" },
  { id: "mr", englishName: "Marathi", nativeName: "मराठी" },
  { id: "te", englishName: "Telugu", nativeName: "తెలుగు" },
  { id: "tr", englishName: "Turkish", nativeName: "Türkçe" },
  { id: "ta", englishName: "Tamil", nativeName: "தமிழ்" },
  { id: "yue", englishName: "Yue Chinese (Cantonese)", nativeName: "粵語" },
  { id: "vi", englishName: "Vietnamese", nativeName: "Tiếng Việt" },
  { id: "ko", englishName: "Korean", nativeName: "한국어 / 조선어" },
  { id: "it", englishName: "Italian", nativeName: "Italiano" },
  { id: "th", englishName: "Thai", nativeName: "ไทย" },
  { id: "gu", englishName: "Gujarati", nativeName: "ગુજરાતી" },
  { id: "fa", englishName: "Persian (Farsi)", nativeName: "فارسی" },
  { id: "pl", englishName: "Polish", nativeName: "Polski" },
  { id: "uk", englishName: "Ukrainian", nativeName: "Українська" },
  { id: "ml", englishName: "Malayalam", nativeName: "മലയാളം" },
  { id: "kn", englishName: "Kannada", nativeName: "కన్నడ" },
  { id: "or", englishName: "Odia", nativeName: "ଓଡ଼ିଆ" },
  { id: "pa", englishName: "Punjabi", nativeName: "ਪੰਜਾਬੀ" },
  { id: "ro", englishName: "Romanian", nativeName: "Română" },
  { id: "nl", englishName: "Dutch", nativeName: "Nederlands" },
  { id: "az", englishName: "Azerbaijani", nativeName: "Azərbaycan dili" },
  { id: "ku", englishName: "Kurdish (Kurmanji)", nativeName: "Kurdî" },
  { id: "ha", englishName: "Hausa", nativeName: "Hausa" },
  { id: "my", englishName: "Burmese", nativeName: "မြန်မာဘာသာ" },
  { id: "am", englishName: "Amharic", nativeName: "አማርኛ" },
  { id: "yo", englishName: "Yoruba", nativeName: "Yorùbá" },
  { id: "sd", englishName: "Sindhi", nativeName: "سنڌي" },
  { id: "si", englishName: "Sinhala", nativeName: "සිංහල" },
  { id: "km", englishName: "Khmer", nativeName: "ខ្មែរ" },
  { id: "ne", englishName: "Nepali", nativeName: "नेपाली" },
  { id: "ps", englishName: "Pashto", nativeName: "ਪښਤੋ" },
  { id: "zu", englishName: "Zulu", nativeName: "isiZulu" },
  { id: "cs", englishName: "Czech", nativeName: "Čeština" },
  { id: "hu", englishName: "Hungarian", nativeName: "Magyar" },
  { id: "el", englishName: "Greek", nativeName: "Ελληνικά" },
  { id: "sv", englishName: "Swedish", nativeName: "Svenska" },
  { id: "fi", englishName: "Finnish", nativeName: "Suomi" },
];

interface LanguageSelectorProps {
  selectedIds: string[];
  onChange: (newIds: string[]) => void;
  disabled?: boolean;
}

export function LanguageSelector({ selectedIds, onChange, disabled }: LanguageSelectorProps) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredLanguages = useMemo(() => {
    const s = search.toLowerCase();
    return LANGUAGES.filter(l => 
      l.englishName.toLowerCase().includes(s) || 
      l.nativeName.toLowerCase().includes(s)
    );
  }, [search]);

  const selectedLanguages = useMemo(() => 
    LANGUAGES.filter(l => selectedIds.includes(l.englishName)), // Using englishName as the ID value since user mentioned English format
    [selectedIds]
  );

  // Note: user said "using the following languages format only as selectable".
  // The list provided has English names. I'll use English names as the value stored in the DB for simplicity in prompts.

  const toggleLanguage = (lang: Language) => {
    if (selectedIds.includes(lang.englishName)) {
      onChange(selectedIds.filter(id => id !== lang.englishName));
    } else {
      onChange([...selectedIds, lang.englishName]);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="space-y-4" ref={containerRef}>
      <div className="flex flex-wrap gap-2 min-h-12 p-3 rounded-xl border bg-background/50 backdrop-blur-md border-border focus-within:border-accent/50 transition-all duration-300">
        <AnimatePresence>
          {selectedLanguages.map(lang => (
            <motion.div
              key={lang.id}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
            >
              <Badge 
                variant="secondary" 
                className="pl-2 pr-1 py-1 gap-1 bg-accent/10 hover:bg-accent/20 text-accent border-accent/20 group"
              >
                <span className="text-xs font-medium">#{lang.englishName}</span>
                <button
                  type="button"
                  onClick={() => toggleLanguage(lang)}
                  className="p-0.5 rounded-full hover:bg-accent/30 transition-colors"
                  disabled={disabled}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            </motion.div>
          ))}
        </AnimatePresence>
        
        <input
          type="text"
          placeholder={selectedLanguages.length === 0 ? "Search languages..." : ""}
          className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground/50"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          disabled={disabled}
        />
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-border bg-popover shadow-2xl backdrop-blur-xl"
            style={{ width: containerRef.current?.offsetWidth }}
          >
            <div className="p-1">
              {filteredLanguages.length > 0 ? (
                filteredLanguages.map(lang => {
                  const isSelected = selectedIds.includes(lang.englishName);
                  return (
                    <button
                      key={lang.id}
                      className={cn(
                        "w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left transition-all",
                        isSelected ? "bg-accent/10 text-accent" : "hover:bg-accent/5 text-muted-foreground"
                      )}
                      onClick={() => toggleLanguage(lang)}
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{lang.englishName}</span>
                        <span className="text-[10px] opacity-60 font-mono tracking-wider">{lang.nativeName}</span>
                      </div>
                      {isSelected && <Check className="h-4 w-4" />}
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-4 text-center text-sm text-zinc-600 italic">
                  No matching languages found
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
