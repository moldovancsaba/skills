"use client";

import { useMemo, useState } from "react";
import { Hash, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/ui/form-fields";
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
  placeholder = "Add hashtags like #product, #priority, #saas",
}: HashtagInputProps) {
  const [draft, setDraft] = useState("");

  const availableSuggestions = useMemo(() => {
    const normalizedDraft = normalizeHashtag(draft);
    return suggestions
      .filter((tag) => !value.includes(tag))
      .filter((tag) => {
        if (!normalizedDraft) return true;
        return tag.includes(normalizedDraft.replace(/^#/, ""));
      })
      .slice(0, 8);
  }, [draft, suggestions, value]);

  const addTag = (input: string) => {
    const normalized = normalizeHashtag(input);
    if (!normalized || value.includes(normalized)) {
      setDraft("");
      return;
    }
    onChange([...value, normalized]);
    setDraft("");
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((item) => item !== tag));
  };

  return (
    <div className="space-y-3">
      <FormInput
        label={label}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={placeholder}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === "," || event.key === "Tab") {
            event.preventDefault();
            addTag(draft);
          }
        }}
      />

      <div className="flex flex-wrap gap-2">
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1 rounded-full px-3 py-1 font-medium">
            <Hash className="h-3 w-3" />
            {tag.replace(/^#/, "")}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="ml-1 rounded-full text-muted-foreground transition-colors hover:text-foreground"
              aria-label={`Remove ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>

      {availableSuggestions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {availableSuggestions.map((tag) => (
            <Button
              key={tag}
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => addTag(tag)}
            >
              {tag}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
