"use client";

import * as React from "react";
import { useState, useEffect, useRef } from "react";
import { X, Plus, Search, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
  placeholder = "Search or add tags...",
  selected,
  onChange,
  suggestions = [],
  error,
}: HashtagMultiSelectProps) {
  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter suggestions based on input
  const filteredSuggestions = suggestions.filter(
    (s) => 
      s.toLowerCase().includes(inputValue.toLowerCase()) && 
      !selected.includes(s)
  );

  const showAddNew = 
    inputValue.trim() !== "" && 
    !suggestions.some(s => s.toLowerCase() === normalizeHashtag(inputValue)) && 
    !selected.includes(normalizeHashtag(inputValue) || "");

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
    <div className="space-y-2" ref={containerRef}>
      {label && (
        <label className="text-sm font-medium text-foreground">
          {label}
        </label>
      )}
      
      <div 
        className={cn(
          "relative min-h-[42px] w-full rounded-lg border border-input bg-background/50 backdrop-blur-sm px-3 py-1.5 transition-all focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary",
          error && "border-destructive focus-within:ring-destructive/20",
          isOpen && "border-primary"
        )}
        onClick={() => {
          setIsOpen(true);
          inputRef.current?.focus();
        }}
      >
        <div className="flex flex-wrap gap-1.5 items-center">
          <AnimatePresence>
            {selected.map((tag) => (
              <motion.div
                key={tag}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
              >
                <Badge 
                  variant="secondary" 
                  className="pl-2.5 pr-1.5 py-1 flex items-center gap-1 bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 transition-colors"
                >
                  <span className="text-xs font-semibold">{tag}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveTag(tag);
                    }}
                    className="rounded-full hover:bg-primary/20 p-0.5 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              </motion.div>
            ))}
          </AnimatePresence>

          <input
            ref={inputRef}
            type="text"
            className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-sm p-0 placeholder:text-muted-foreground"
            placeholder={selected.length === 0 ? placeholder : ""}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
          />
        </div>

        {/* Predictive Suggestions Dropdown */}
        <AnimatePresence>
          {isOpen && (filteredSuggestions.length > 0 || showAddNew) && (
            <motion.div
              initial={{ opacity: 0, y: 4, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.95 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="absolute left-0 top-full z-50 mt-2 w-full overflow-hidden rounded-xl border border-border/50 bg-background/95 backdrop-blur-xl p-1 shadow-2xl"
            >
              <div className="max-h-[240px] overflow-y-auto scrollbar-hide">
                {filteredSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddTag(suggestion);
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-primary/10 transition-colors group"
                  >
                    <span className="font-medium text-foreground group-hover:text-primary">{suggestion}</span>
                    <Check className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
                
                {showAddNew && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddTag(inputValue);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-primary/10 text-primary transition-colors border-t border-border/50 mt-1 pt-2"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add new industry: <span className="font-bold underline">{normalizeHashtag(inputValue)}</span></span>
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      {error && <p className="text-xs text-destructive mt-1 font-medium">{error}</p>}
    </div>
  );
}
