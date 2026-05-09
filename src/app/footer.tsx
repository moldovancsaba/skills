'use client';

import { Box, Container, Group, Anchor, Text, rem } from "@mantine/core";
import { APP_VERSION } from "@/lib/release";
import Link from "next/link";
import { getSemanticInsetStyle } from "@/lib/semantic-theme";

export function Footer() {
  return (
    <Box 
      component="footer" 
      mt="auto" 
      py="md" 
      style={{ 
        ...getSemanticInsetStyle("neutral"),
        borderTop: '1px solid var(--surface-section-border)',
        borderRight: 'none',
        borderBottom: 'none',
        borderLeft: 'none',
      }}
    >
      <Container size="7xl">
        <Group justify="space-between">
          <Group gap="xl">
            <Link href="/privacy" style={{ textDecoration: 'none' }}>
              <Text size="xs" c="dimmed">Privacy Policy</Text>
            </Link>
            <Link href="/terms" style={{ textDecoration: 'none' }}>
              <Text size="xs" c="dimmed">Terms of Service</Text>
            </Link>
          </Group>
          <Group gap="xs">
            <Text size="xs" c="dimmed">
              Release
            </Text>
            <Box 
              px="xs" 
              py={2} 
              style={{ 
                ...getSemanticInsetStyle("neutral"),
                borderRadius: rem(6),
              }}
            >
              <Text size="10px">
                v{APP_VERSION}
              </Text>
            </Box>
          </Group>
        </Group>
      </Container>
    </Box>
  );
}
