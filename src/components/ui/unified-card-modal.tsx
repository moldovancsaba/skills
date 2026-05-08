'use client';

import type { ReactNode } from "react";
import { Modal, Group, Text, Badge, Stack } from "@mantine/core";
import {
  getModuleTheme,
  getSemanticSurfaceStyle,
  type ModuleTone,
} from "@/lib/semantic-theme";

type UnifiedCardModalProps = {
  opened: boolean;
  onClose: () => void;
  tone?: ModuleTone;
  title: string;
  subtitle?: string;
  badge?: string;
  size?: string | number;
  children: ReactNode;
};

export function UnifiedCardModal({
  opened,
  onClose,
  tone = "neutral",
  title,
  subtitle,
  badge,
  size = "xl",
  children,
}: UnifiedCardModalProps) {
  const theme = getModuleTheme(tone);
  const surfaceStyle = getSemanticSurfaceStyle(tone, { elevated: true });

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      withinPortal={false}
      size={size}
      radius="lg"
      padding="lg"
      overlayProps={{
        backgroundOpacity: 0.72,
        color: "var(--overlay-color)",
        blur: 2,
      }}
      styles={{
        content: {
          ...surfaceStyle,
          background: `linear-gradient(180deg, var(--surface-hover-top), var(--surface-hover-bottom)), ${theme.surface}`,
          border: `1px solid ${theme.border}`,
          boxShadow: `0 24px 72px rgba(0, 0, 0, 0.42), 0 0 0 1px ${theme.border}`,
        },
        header: {
          background: "transparent",
          borderBottom: "1px solid var(--surface-section-border)",
          paddingBottom: 16,
        },
        body: {
          paddingTop: 18,
        },
        title: {
          width: "100%",
        },
      }}
      title={
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={4}>
            <Text fw={650}>{title}</Text>
            {subtitle ? (
              <Text size="xs" c="var(--text-secondary)">
                {subtitle}
              </Text>
            ) : null}
          </Stack>
          {badge ? (
            <Badge variant="light" color={tone === "neutral" ? "gray" : tone}>
              {badge}
            </Badge>
          ) : null}
        </Group>
      }
    >
      {children}
    </Modal>
  );
}
