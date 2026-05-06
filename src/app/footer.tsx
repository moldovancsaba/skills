'use client';

import { Box, Container, Group, Anchor, Text, rem } from "@mantine/core";
import { APP_VERSION } from "@/lib/release";
import Link from "next/link";

export function Footer() {
  return (
    <Box 
      component="footer" 
      mt="auto" 
      py="md" 
      style={{ 
        borderTop: '1px solid var(--mantine-color-dark-4)',
        backgroundColor: 'rgba(0,0,0,0.2)',
        backdropFilter: 'blur(10px)'
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
                backgroundColor: 'var(--mantine-color-dark-6)',
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
