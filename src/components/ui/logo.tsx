"use client";
import { Text } from "@/components/ui/typography";

import { Group, ThemeIcon, Anchor } from "@mantine/core";
import { IconCheckbox as LogoIcon } from "@tabler/icons-react";
import Link from "next/link";

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const iconSize = size === "sm" ? 18 : size === "md" ? 24 : 32;
  const fontSize = size === "sm" ? "md" : size === "md" ? "xl" : "2xl";

  return (
    <Anchor component={Link} href="/" underline="never" c="inherit">
      <Group gap="xs">
        <ThemeIcon 
          size={iconSize + 8} 
          color="ingress"
        >
          <LogoIcon size={iconSize} />
        </ThemeIcon>
        <Text 
          size={fontSize} 
          c="var(--text-primary)"
          ff="var(--font-display)"
        >
          checklist
        </Text>
      </Group>
    </Anchor>
  );
}
