'use client';

import type { ReactNode } from "react";
import {
  Text as MantineText,
  Title as MantineTitle,
} from "@/components/gds/primitives";

type MantineTextFacadeProps = {
  children?: ReactNode;
  [key: string]: any;
};

type MantineTitleFacadeProps = {
  children?: ReactNode;
  [key: string]: any;
};

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
  return <MantineTitle order={1}>{children}</MantineTitle>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <MantineTitle order={2} size="h3">{children}</MantineTitle>;
}

export function CardTitle({ children, lineClamp }: { children: ReactNode; lineClamp?: number }) {
  return <MantineText size="xl" fw={700} lh={1.25} lineClamp={lineClamp}>{children}</MantineText>;
}

export function Text(props: MantineTextFacadeProps) {
  return <MantineText {...props} />;
}

export function Title(props: MantineTitleFacadeProps) {
  return <MantineTitle {...props} />;
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
    <MantineText
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
    </MantineText>
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
    <MantineText
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
    </MantineText>
  );
}

export function LabelText({
  children,
  c = "var(--text-primary)",
  truncate,
  lineClamp,
}: Pick<TextCommonProps, "children" | "c" | "truncate" | "lineClamp">) {
  return (
    <MantineText size="sm" fw={600} lh={1.35} c={c} truncate={truncate} lineClamp={lineClamp}>
      {children}
    </MantineText>
  );
}

export function ActionLabel({
  children,
  c = "var(--text-primary)",
}: Pick<TextCommonProps, "children" | "c">) {
  return (
    <MantineText size="sm" fw={700} lh={1.35} c={c}>
      {children}
    </MantineText>
  );
}
