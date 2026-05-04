"use client";

import * as React from "react";
import { Badge as MantineBadge, type BadgeProps as MantineBadgeProps } from "@mantine/core";

export interface BadgeProps extends MantineBadgeProps, Omit<React.ComponentPropsWithoutRef<"div">, "style" | "color"> {}

function Badge({ variant = "filled", color, ...props }: BadgeProps) {
  // Map Shadcn variants to Mantine variants
  const variantMap: Record<string, string> = {
    default: "filled",
    secondary: "light",
    destructive: "filled",
    outline: "outline",
  };

  const colorMap: Record<string, string> = {
    destructive: "red",
    default: "brand",
    secondary: "gray",
  };

  return (
    <MantineBadge
      variant={(variantMap[variant as string] || variant) as any}
      color={(colorMap[variant as string] || color || "brand") as any}
      radius="sm"
      size="sm"
      styles={{
        root: { textTransform: "none", fontWeight: 700 }
      }}
      {...props}
    />
  );
}

export { Badge };
