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
          variant="gradient" 
          gradient={{ from: "brand.6", to: "brand.9", deg: 45 }}
        >
          <Sparkles size={iconSize} />
        </ThemeIcon>
        <Text 
          size={fontSize} 
          fw={900} 
          variant="gradient" 
          gradient={{ from: "white", to: "rgba(255,255,255,0.5)", deg: 45 }}
          style={{ 
            fontFamily: "var(--font-display)", 
            letterSpacing: rem(-1),
            textTransform: "lowercase"
          }}
        >
          checklist
        </Text>
      </Group>
    </Link>
  );
}
