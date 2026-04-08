"use client";

import * as React from "react";
import { useState, useEffect, useRef } from "react";
import { X, Search, Check, Link2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { normalizeHashtag } from "@/lib/hashtags";

interface EntityTagSelectorProps {
  label?: string;
  placeholder?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  suggestions?: string[];
}

export function EntityTagSelector({
  label = "About (Entity)",
  placeholder = "Which entity is this about? e.g. #nike or #soccer_lab...",
  value,
  onChange,
  suggestions = [],
}: EntityTagSelectorProps) {
  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = suggestions.filter(
    (s) => s.toLowerCase().includes(inputValue.toLowerCase()) && s !== value
  );

  const showAddNew =
    inputValue.trim() !== "" &&
    !suggestions.some((s) => s.toLowerCase() === (normalizeHashtag(inputValue) ?? "").toLowerCase()) &&
    normalizeHashtag(inputValue) !== value;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (tag: string) => {
    const normalized = normalizeHashtag(tag);
    onChange(normalized ?? null);
    setInputValue("");
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setInputValue("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && inputValue.trim()) {
      e.preventDefault();
      handleSelect(inputValue);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div className="space-y-2" ref={containerRef}>
      {label && (
        <div className="flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
          <label className="text-sm font-medium text-foreground">{label}</label>
          <span className="text-xs text-muted-foreground">(optional — links this data to a specific entity)</span>
        </div>
      )}

      {/* Selected entity display */}
      {value ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2"
        >
          <Link2 className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-sm font-semibold text-primary flex-1">{value}</span>
          <span className="text-xs text-muted-foreground">this data is about this entity</span>
          <button
            type="button"
            onClick={handleClear}
            className="rounded-full p-0.5 hover:bg-primary/20 text-primary transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      ) : (
        <div className="relative">
          <div
            className={cn(
              "flex items-center gap-2 rounded-lg border border-input bg-background/50 px-3 py-2 transition-all focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary",
              isOpen && "border-primary"
            )}
            onClick={() => {
              setIsOpen(true);
              inputRef.current?.focus();
            }}
          >
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground"
              placeholder={placeholder}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              onKeyDown={handleKeyDown}
            />
          </div>

          {/* Dropdown */}
          <AnimatePresence>
            {isOpen && (filtered.length > 0 || showAddNew || (suggestions.length > 0 && !inputValue)) && (
              <motion.div
                initial={{ opacity: 0, y: 4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.97 }}
                transition={{ duration: 0.12 }}
                className="absolute left-0 top-full z-50 mt-1.5 w-full overflow-hidden rounded-xl border border-border/50 bg-background/95 backdrop-blur-xl p-1 shadow-2xl"
              >
                <div className="max-h-[220px] overflow-y-auto">
                  {/* Show all suggestions when input is empty */}
                  {(inputValue ? filtered : suggestions.filter(s => s !== value)).map((entity) => (
                    <button
                      key={entity}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(entity);
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-primary/10 transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        <Link2 className="w-3 h-3 text-muted-foreground group-hover:text-primary" />
                        <span className="font-medium text-foreground group-hover:text-primary">{entity}</span>
                      </div>
                      <Check className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}

                  {/* Add new free-form entity */}
                  {showAddNew && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(inputValue);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-primary/10 text-primary transition-colors border-t border-border/30 mt-1 pt-2"
                    >
                      <Search className="h-3.5 w-3.5" />
                      <span>Link to new entity: <span className="font-bold">{normalizeHashtag(inputValue)}</span></span>
                    </button>
                  )}

                  {suggestions.length === 0 && !inputValue && (
                    <p className="px-3 py-2 text-xs text-muted-foreground italic">
                      No entities yet — type to create one (e.g. #nike, #customer_x)
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
