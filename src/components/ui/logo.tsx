"use client";

import { Group, Text, ThemeIcon, rem } from "@mantine/core";
import { IconSparkles as Sparkles } from "@tabler/icons-react";
import Link from "next/link";

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const iconSize = size === "sm" ? 18 : size === "md" ? 24 : 32;
  const fontSize = size === "sm" ? "md" : size === "md" ? "xl" : "2xl";

  return (
    <Link href="/" style={{ textDecoration: "none" }}>
      <Group gap="xs">
        <ThemeIcon 
          size={iconSize + 8} 
          radius="md" 
          color="brand"
        >
          <Sparkles size={iconSize} />
        </ThemeIcon>
        <Text 
          size={fontSize} 
          fw={700} 
          c="white"
          style={{ 
            fontFamily: "var(--font-display)", 
            letterSpacing: rem(-0.5),
            textTransform: "lowercase"
          }}
        >
          checklist
        </Text>
      </Group>
    </Link>
  );
}
