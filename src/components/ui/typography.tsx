'use client';

import type { ReactNode } from "react";
import { Text, Title } from "@mantine/core";

type TextCommonProps = {
  children: ReactNode;
  truncate?: boolean;
  lineClamp?: number;
  ta?: "left" | "center" | "right";
  c?: string;
  maw?: number | string;
  mx?: string | number;
  mt?: string | number;
  mb?: string | number;
  ml?: string | number;
  opacity?: number;
};

export function PageTitle({ children }: { children: ReactNode }) {
  return <Title order={1}>{children}</Title>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Title order={2} size="h3">{children}</Title>;
}

export function CardTitle({ children, lineClamp }: { children: ReactNode; lineClamp?: number }) {
  return <Text size="xl" fw={700} lh={1.25} lineClamp={lineClamp}>{children}</Text>;
}

export function BodyText({
  children,
  lineClamp,
  truncate,
  ta,
  maw,
  mx,
  mt,
  mb,
}: TextCommonProps) {
  return (
    <Text
      size="sm"
      c="var(--text-secondary)"
      lh={1.6}
      lineClamp={lineClamp}
      truncate={truncate}
      ta={ta}
      maw={maw}
      mx={mx}
      mt={mt}
      mb={mb}
    >
      {children}
    </Text>
  );
}

export function MetaText({
  children,
  truncate,
  lineClamp,
  ta,
  c = "dimmed",
  maw,
  mx,
  mt,
  mb,
  ml,
  opacity,
}: TextCommonProps) {
  return (
    <Text
      size="xs"
      c={c}
      truncate={truncate}
      lineClamp={lineClamp}
      ta={ta}
      maw={maw}
      mx={mx}
      mt={mt}
      mb={mb}
      ml={ml}
      opacity={opacity}
    >
      {children}
    </Text>
  );
}

export function LabelText({
  children,
  c = "var(--text-primary)",
  truncate,
  lineClamp,
}: Pick<TextCommonProps, "children" | "c" | "truncate" | "lineClamp">) {
  return (
    <Text size="sm" fw={600} lh={1.35} c={c} truncate={truncate} lineClamp={lineClamp}>
      {children}
    </Text>
  );
}

export function ActionLabel({
  children,
  c = "var(--text-primary)",
}: Pick<TextCommonProps, "children" | "c">) {
  return (
    <Text size="sm" fw={700} tt="uppercase" lts={0.6} c={c}>
      {children}
    </Text>
  );
}
