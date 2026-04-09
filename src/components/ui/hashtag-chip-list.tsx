"use client";

import { Hash, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { displayHashtag, normalizeHashtagList } from "@/lib/hashtags";
import { cn } from "@/lib/utils";

type Props = {
  hashtags: string[];
  activeTags?: string[];
  onToggle?: (tag: string) => void;
  onRemove?: (tag: string) => void;
  className?: string;
};

export function HashtagChipList({
  hashtags,
  activeTags = [],
  onToggle,
  onRemove,
  className,
}: Props) {
  const tags = normalizeHashtagList(hashtags);
  const active = new Set(normalizeHashtagList(activeTags));

  if (tags.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {tags.map((tag) => {
        const isActive = active.has(tag);
        const chip = (
          <Badge
            variant={isActive ? "default" : "outline"}
            className={cn(
              "gap-1 rounded-full px-3 py-1 font-medium",
              onToggle ? "cursor-pointer" : "",
            )}
          >
            <Hash className="h-3 w-3" />
            {displayHashtag(tag)}
          </Badge>
        );

        if (onToggle && onRemove) {
          return (
            <div key={tag} className="flex items-center gap-1">
              <button type="button" onClick={() => onToggle(tag)} className="contents">
                {chip}
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-full"
                onClick={() => onRemove(tag)}
                aria-label={`Remove ${tag}`}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          );
        }

        if (onRemove) {
          return (
            <div key={tag} className="flex items-center gap-1">
              {chip}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-full"
                onClick={() => onRemove(tag)}
                aria-label={`Remove ${tag}`}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          );
        }

        if (onToggle) {
          return (
            <button key={tag} type="button" onClick={() => onToggle(tag)} className="contents">
              {chip}
            </button>
          );
        }

        return <div key={tag}>{chip}</div>;
      })}
    </div>
  );
}
