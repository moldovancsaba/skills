"use client";

import { Package, Search, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SourceTypeOption = "product" | "customer" | "competitor";

const OPTIONS = [
  { value: "product", label: "Product", icon: Package },
  { value: "customer", label: "Customer", icon: Users },
  { value: "competitor", label: "Competitor", icon: Search },
] satisfies Array<{ value: SourceTypeOption; label: string; icon: typeof Package }>;

type Props = {
  value: SourceTypeOption;
  onChange: (value: SourceTypeOption) => void;
  disabled?: boolean;
  label?: string;
};

export function SourceTypePicker({
  value,
  onChange,
  disabled = false,
  label = "Source type",
}: Props) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <Button
              key={option.value}
              type="button"
              variant={value === option.value ? "default" : "outline"}
              size="sm"
              className={cn("rounded-full", value === option.value ? "" : "text-muted-foreground")}
              disabled={disabled}
              onClick={() => onChange(option.value)}
            >
              <Icon className="h-4 w-4" />
              {option.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
